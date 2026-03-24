// Bunle — zero-dependency TypeScript SDK for BNL files. Read, stream, pack.

const MAGIC = 0x015a434d; // "MCZ\x01" as u32 LE
const HEADER_SIZE = 8;
const ENTRY_SIZE = 16;

export interface PageInfo {
  readonly index: number;
  readonly offset: number;
  readonly size: number;
  readonly width: number;
  readonly height: number;
  readonly format: "webp" | "jpeg" | "jxl";
}

export interface StreamPage {
  readonly index: number;
  readonly blob: Blob;
}

export interface StreamOptions {
  onProgress?: (received: number, total: number) => void;
}

export interface PackInput {
  data: ArrayBuffer | Uint8Array | Blob;
  width: number;
  height: number;
  format: "webp" | "jpeg" | "jxl";
}

const FORMATS = ["webp", "jpeg", "jxl"] as const;
const MIME: Record<string, string> = {
  webp: "image/webp",
  jpeg: "image/jpeg",
  jxl: "image/jxl",
};

// ── Parse ───────────────────────────────────────────────────────────

export function parseIndex(buf: ArrayBuffer, offset = 0): PageInfo[] {
  const view = new DataView(buf, offset);
  if (view.getUint32(0, true) !== MAGIC) throw new Error("Invalid BNL file");
  const n = view.getUint16(6, true);
  const pages: PageInfo[] = [];
  for (let i = 0; i < n; i++) {
    const base = HEADER_SIZE + i * ENTRY_SIZE;
    if (base + ENTRY_SIZE > view.byteLength) break;
    pages.push({
      index: i,
      offset: view.getUint32(base, true),
      size: view.getUint32(base + 4, true),
      width: view.getUint16(base + 8, true),
      height: view.getUint16(base + 10, true),
      format: FORMATS[view.getUint8(base + 12)] ?? "webp",
    });
  }
  return pages;
}

export function indexSize(pageCount: number): number {
  return HEADER_SIZE + pageCount * ENTRY_SIZE;
}

// ── Bunle ───────────────────────────────────────────────────────────

export class Bunle {
  readonly pages: readonly PageInfo[];
  readonly pageCount: number;

  private readonly _source: ArrayBuffer | string;
  private readonly _urls = new Map<number, string>();

  private constructor(source: ArrayBuffer | string, pages: PageInfo[]) {
    this._source = source;
    this.pages = pages;
    this.pageCount = pages.length;
  }

  /** Open from local buffer. */
  static from(buf: ArrayBuffer): Bunle {
    return new Bunle(buf, parseIndex(buf));
  }

  /** Open from URL — single Range request for index. */
  static async open(url: string): Promise<Bunle> {
    // Request header + up to 256 pages of index in one Range request
    const maxIndex = indexSize(256);
    const res = await fetch(url, {
      headers: { Range: `bytes=0-${maxIndex - 1}` },
    });
    const buf = await res.arrayBuffer();
    const view = new DataView(buf);
    if (view.getUint32(0, true) !== MAGIC) throw new Error("Invalid BNL file");
    const pageCount = view.getUint16(6, true);
    const needed = indexSize(pageCount);

    // >256 pages: need a second request (rare)
    if (buf.byteLength < needed) {
      const res2 = await fetch(url, {
        headers: { Range: `bytes=0-${needed - 1}` },
      });
      return new Bunle(url, parseIndex(await res2.arrayBuffer()));
    }

    return new Bunle(url, parseIndex(buf));
  }

  /** Fetch a single page. Range request if remote, zero-copy view if local. */
  async blob(index: number): Promise<Blob> {
    const info = this.pages[index];
    if (!info) throw new RangeError(`Page ${index} out of range`);

    if (this._source instanceof ArrayBuffer) {
      return new Blob(
        [new Uint8Array(this._source, info.offset, info.size)],
        { type: MIME[info.format] },
      );
    }

    const res = await fetch(this._source, {
      headers: {
        Range: `bytes=${info.offset}-${info.offset + info.size - 1}`,
      },
    });
    return new Blob([await res.arrayBuffer()], { type: MIME[info.format] });
  }

  /** ObjectURL wrapper with caching. */
  async url(index: number): Promise<string> {
    const cached = this._urls.get(index);
    if (cached) return cached;
    const u = URL.createObjectURL(await this.blob(index));
    this._urls.set(index, u);
    return u;
  }

  /** Stream all pages progressively. Single fetch, yields pages as data arrives. */
  async *stream(opts?: StreamOptions): AsyncGenerator<StreamPage> {
    if (this._source instanceof ArrayBuffer) {
      for (const info of this.pages) {
        yield {
          index: info.index,
          blob: new Blob(
            [new Uint8Array(this._source, info.offset, info.size)],
            { type: MIME[info.format] },
          ),
        };
      }
      return;
    }

    const res = await fetch(this._source);
    const total = +(res.headers.get("content-length") || 0);
    const reader = res.body!.getReader();

    let buf = new Uint8Array(total > 0 ? total : 64 * 1024);
    let pos = 0;
    let pi = 0;

    while (pi < this.pages.length) {
      const { value, done } = await reader.read();
      if (done) break;

      // Grow buffer if needed
      if (pos + value.length > buf.length) {
        const cap = Math.max(buf.length * 2, pos + value.length);
        const next = new Uint8Array(cap);
        next.set(buf.subarray(0, pos));
        buf = next;
      }
      buf.set(value, pos);
      pos += value.length;

      opts?.onProgress?.(pos, total);

      // Yield completed pages
      while (pi < this.pages.length) {
        const info = this.pages[pi];
        if (pos < info.offset + info.size) break;
        yield {
          index: info.index,
          blob: new Blob(
            [buf.slice(info.offset, info.offset + info.size)],
            { type: MIME[info.format] },
          ),
        };
        pi++;
      }
    }
  }

  /** Pack pages into a BNL ArrayBuffer. */
  static async pack(inputs: PackInput[]): Promise<ArrayBuffer> {
    const formatId = { webp: 0, jpeg: 1, jxl: 2 } as const;
    const count = inputs.length;
    const dataOffset = HEADER_SIZE + count * ENTRY_SIZE;

    // Resolve all inputs to Uint8Array
    const buffers: Uint8Array[] = [];
    let totalData = 0;
    for (const input of inputs) {
      let bytes: Uint8Array;
      if (input.data instanceof Uint8Array) {
        bytes = input.data;
      } else if (input.data instanceof ArrayBuffer) {
        bytes = new Uint8Array(input.data);
      } else {
        bytes = new Uint8Array(await input.data.arrayBuffer());
      }
      buffers.push(bytes);
      totalData += bytes.length;
    }

    // Write header + index + data
    const out = new Uint8Array(dataOffset + totalData);
    const view = new DataView(out.buffer);

    // Header
    view.setUint32(0, MAGIC, true);
    out[4] = 1; // version
    out[5] = 0; // flags
    view.setUint16(6, count, true);

    // Index + data
    let offset = dataOffset;
    for (let i = 0; i < count; i++) {
      const base = HEADER_SIZE + i * ENTRY_SIZE;
      const bytes = buffers[i];
      view.setUint32(base, offset, true);
      view.setUint32(base + 4, bytes.length, true);
      view.setUint16(base + 8, inputs[i].width, true);
      view.setUint16(base + 10, inputs[i].height, true);
      out[base + 12] = formatId[inputs[i].format];
      out.set(bytes, offset);
      offset += bytes.length;
    }

    return out.buffer;
  }

  /** Revoke all cached ObjectURLs. */
  close(): void {
    for (const u of this._urls.values()) URL.revokeObjectURL(u);
    this._urls.clear();
  }
}
