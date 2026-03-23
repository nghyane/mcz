// MCZ — zero-dependency TypeScript SDK

const MAGIC = 0x015a434d;
const HDR = 8;
const ENT = 16;
const FMT = ["webp", "jpeg", "jxl"] as const;
const MIME: Record<string, string> = { webp: "image/webp", jpeg: "image/jpeg", jxl: "image/jxl" };

export interface PageInfo { readonly index: number; readonly offset: number; readonly size: number; readonly width: number; readonly height: number; readonly format: "webp" | "jpeg" | "jxl" }
export interface StreamPage { readonly index: number; readonly blob: Blob }
export interface StreamOptions { onProgress?: (received: number, total: number) => void }
export interface PackInput { data: ArrayBuffer | Uint8Array | Blob; width: number; height: number; format: "webp" | "jpeg" | "jxl" }

export function parseIndex(buf: ArrayBuffer): PageInfo[] {
  const v = new DataView(buf);
  if (v.getUint32(0, true) !== MAGIC) throw new Error("Invalid MCZ");
  const n = v.getUint16(6, true);
  return Array.from({ length: n }, (_, i) => {
    const b = HDR + i * ENT;
    return { index: i, offset: v.getUint32(b, true), size: v.getUint32(b + 4, true), width: v.getUint16(b + 8, true), height: v.getUint16(b + 10, true), format: FMT[v.getUint8(b + 12)] ?? "webp" };
  });
}

export const indexSize = (n: number) => HDR + n * ENT;

// ── BytePipe: growable buffer with readiness check ──

class BytePipe {
  buf: Uint8Array;
  pos = 0;
  constructor(hint: number) { this.buf = new Uint8Array(hint || 65536); }
  push(chunk: Uint8Array) {
    if (this.pos + chunk.length > this.buf.length) {
      const next = new Uint8Array(Math.max(this.buf.length * 2, this.pos + chunk.length));
      next.set(this.buf.subarray(0, this.pos));
      this.buf = next;
    }
    this.buf.set(chunk, this.pos);
    this.pos += chunk.length;
  }
  has(offset: number, size: number) { return this.pos >= offset + size; }
  slice(offset: number, size: number) { return this.buf.slice(offset, offset + size); }
}

async function pumpUntil(reader: ReadableStreamDefaultReader<Uint8Array>, pipe: BytePipe, n: number) {
  while (pipe.pos < n) {
    const { value, done } = await reader.read();
    if (done) throw new Error("Unexpected EOF");
    pipe.push(value);
  }
}

function pageBlob(buf: ArrayBuffer, p: PageInfo) {
  return new Blob([new Uint8Array(buf, p.offset, p.size)], { type: MIME[p.format] });
}

// ── MCZ ──

export class MCZ {
  readonly pages: readonly PageInfo[];
  readonly pageCount: number;
  private readonly url: string | null;
  private readonly data: ArrayBuffer | null;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null;
  private pipe: BytePipe | null;
  private total: number;

  private constructor(pages: PageInfo[], url: string | null, data: ArrayBuffer | null, reader: ReadableStreamDefaultReader<Uint8Array> | null, pipe: BytePipe | null, total: number) {
    this.pages = pages;
    this.pageCount = pages.length;
    this.url = url;
    this.data = data;
    this.reader = reader;
    this.pipe = pipe;
    this.total = total;
  }

  /** Open from local buffer. */
  static from(buf: ArrayBuffer): MCZ {
    return new MCZ(parseIndex(buf), null, buf, null, null, 0);
  }

  /** Open from URL — 1 fetch, parse index from stream, keep reader for stream(). */
  static async open(url: string): Promise<MCZ> {
    const res = await fetch(url);
    const total = +(res.headers.get("content-length") || 0);
    const reader = res.body!.getReader();
    const pipe = new BytePipe(total);

    await pumpUntil(reader, pipe, HDR);
    const n = new DataView(pipe.buf.buffer, 0, pipe.pos).getUint16(6, true);
    await pumpUntil(reader, pipe, indexSize(n));

    return new MCZ(parseIndex(pipe.buf.buffer.slice(0, pipe.pos)), url, null, reader, pipe, total);
  }

  /** Fetch single page via Range request. */
  async blob(i: number): Promise<Blob> {
    const p = this.pages[i];
    if (!p) throw new RangeError(`Page ${i} out of range`);
    if (this.data) return pageBlob(this.data, p);
    const res = await fetch(this.url!, { headers: { Range: `bytes=${p.offset}-${p.offset + p.size - 1}` } });
    return new Blob([await res.arrayBuffer()], { type: MIME[p.format] });
  }

  /** Stream all pages progressively — continues the connection from open(). */
  async *stream(opts?: StreamOptions): AsyncGenerator<StreamPage> {
    if (this.data) {
      for (const p of this.pages) yield { index: p.index, blob: pageBlob(this.data, p) };
      return;
    }

    const reader = this.reader!;
    const pipe = this.pipe!;
    let pi = 0;

    // Yield pages already buffered during open()
    while (pi < this.pages.length && pipe.has(this.pages[pi].offset, this.pages[pi].size)) {
      const p = this.pages[pi++];
      yield { index: p.index, blob: new Blob([pipe.slice(p.offset, p.size)], { type: MIME[p.format] }) };
    }

    // Continue reading same stream
    while (pi < this.pages.length) {
      const { value, done } = await reader.read();
      if (done) break;
      pipe.push(value);
      opts?.onProgress?.(pipe.pos, this.total);
      while (pi < this.pages.length && pipe.has(this.pages[pi].offset, this.pages[pi].size)) {
        const p = this.pages[pi++];
        yield { index: p.index, blob: new Blob([pipe.slice(p.offset, p.size)], { type: MIME[p.format] }) };
      }
    }
  }

  /** Pack pages into MCZ. */
  static async pack(inputs: PackInput[]): Promise<ArrayBuffer> {
    const fid = { webp: 0, jpeg: 1, jxl: 2 } as const;
    const n = inputs.length, dOff = HDR + n * ENT;
    const bufs: Uint8Array[] = [];
    let dLen = 0;
    for (const inp of inputs) {
      const b = inp.data instanceof Uint8Array ? inp.data : new Uint8Array(inp.data instanceof ArrayBuffer ? inp.data : await inp.data.arrayBuffer());
      bufs.push(b); dLen += b.length;
    }
    const out = new Uint8Array(dOff + dLen), v = new DataView(out.buffer);
    v.setUint32(0, MAGIC, true); out[4] = 1; v.setUint16(6, n, true);
    let off = dOff;
    for (let i = 0; i < n; i++) {
      const b = HDR + i * ENT;
      v.setUint32(b, off, true); v.setUint32(b + 4, bufs[i].length, true);
      v.setUint16(b + 8, inputs[i].width, true); v.setUint16(b + 10, inputs[i].height, true);
      out[b + 12] = fid[inputs[i].format]; out.set(bufs[i], off); off += bufs[i].length;
    }
    return out.buffer;
  }

  close() {}
}
