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

// ── Byte pipe: reads a stream, grows buffer, yields completed pages ──

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

  ready(offset: number, size: number) { return this.pos >= offset + size; }
  slice(offset: number, size: number) { return this.buf.slice(offset, offset + size); }
  view() { return new DataView(this.buf.buffer, 0, this.pos); }
}

// ── Pump: read from a reader until predicate is true ─────────────────

async function pump(reader: ReadableStreamDefaultReader<Uint8Array>, pipe: BytePipe, until: number) {
  while (pipe.pos < until) {
    const { value, done } = await reader.read();
    if (done) throw new Error("Unexpected EOF");
    pipe.push(value);
  }
}

// ── MCZ ──────────────────────────────────────────────────────────────

export class MCZ {
  readonly pages: readonly PageInfo[];
  readonly pageCount: number;

  // Exactly one of these is set:
  private _buf: ArrayBuffer | null;         // local data
  private _remote: {                        // remote URL
    url: string;
    reader: ReadableStreamDefaultReader<Uint8Array> | null;  // non-null = stream in progress
    pipe: BytePipe | null;
    total: number;
  } | null;

  private constructor(pages: PageInfo[], buf: ArrayBuffer | null, remote: MCZ["_remote"]) {
    this.pages = pages;
    this.pageCount = pages.length;
    this._buf = buf;
    this._remote = remote;
  }

  // ── Constructors ──

  static from(buf: ArrayBuffer): MCZ {
    return new MCZ(parseIndex(buf), buf, null);
  }

  static async open(url: string): Promise<MCZ> {
    // Always stream — 1 request total. Read index from first bytes, keep reader for stream().
    const res = await fetch(url);
    const total = +(res.headers.get("content-length") || 0);
    const reader = res.body!.getReader();
    const pipe = new BytePipe(total);

    await pump(reader, pipe, HDR);
    const n = pipe.view().getUint16(6, true);
    await pump(reader, pipe, indexSize(n));

    const pages = parseIndex(pipe.buf.buffer.slice(0, pipe.pos));
    return new MCZ(pages, null, { url, reader, pipe, total });
  }

  // ── Single page fetch ──

  async blob(i: number): Promise<Blob> {
    const p = this.pages[i];
    if (!p) throw new RangeError(`Page ${i} out of range`);
    if (this._buf) return new Blob([new Uint8Array(this._buf, p.offset, p.size)], { type: MIME[p.format] });
    const res = await fetch(this._remote!.url, { headers: { Range: `bytes=${p.offset}-${p.offset + p.size - 1}` } });
    return new Blob([await res.arrayBuffer()], { type: MIME[p.format] });
  }

  // ── Progressive stream ──

  async *stream(opts?: StreamOptions): AsyncGenerator<StreamPage> {
    // Local buffer → yield all immediately
    if (this._buf) {
      for (const p of this.pages) yield { index: p.index, blob: new Blob([new Uint8Array(this._buf, p.offset, p.size)], { type: MIME[p.format] }) };
      return;
    }

    const r = this._remote!;
    let reader: ReadableStreamDefaultReader<Uint8Array>;
    let pipe: BytePipe;
    let total: number;

    if (r.reader) {
      // Continue stream started in open() — zero extra requests
      reader = r.reader; pipe = r.pipe!; total = r.total;
      r.reader = null; r.pipe = null;
    } else {
      // Range was used in open() — need new fetch for streaming
      const res = await fetch(r.url);
      total = +(res.headers.get("content-length") || 0);
      reader = res.body!.getReader();
      pipe = new BytePipe(total);
    }

    let pi = 0;

    // Yield pages already in buffer (from open() carry)
    while (pi < this.pages.length && pipe.ready(this.pages[pi].offset, this.pages[pi].size)) {
      const p = this.pages[pi++];
      yield { index: p.index, blob: new Blob([pipe.slice(p.offset, p.size)], { type: MIME[p.format] }) };
    }

    // Stream remaining
    while (pi < this.pages.length) {
      const { value, done } = await reader.read();
      if (done) break;
      pipe.push(value);
      opts?.onProgress?.(pipe.pos, total);
      while (pi < this.pages.length && pipe.ready(this.pages[pi].offset, this.pages[pi].size)) {
        const p = this.pages[pi++];
        yield { index: p.index, blob: new Blob([pipe.slice(p.offset, p.size)], { type: MIME[p.format] }) };
      }
    }
  }

  // ── Pack ──

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
