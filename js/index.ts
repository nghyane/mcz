// MCZ Reader — zero-dependency TypeScript reader for MCZ (Manga Container) files.
// Index first, access pattern flexible.

const MAGIC = [0x4d, 0x43, 0x5a, 0x01]; // "MCZ\x01"
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

const FORMATS = ["webp", "jpeg", "jxl"] as const;
const MIME: Record<string, string> = { webp: "image/webp", jpeg: "image/jpeg", jxl: "image/jxl" };

// ── Parse (exported) ────────────────────────────────────────────────

export function parseIndex(buf: ArrayBuffer): PageInfo[] {
  const view = new DataView(buf);
  for (let i = 0; i < 4; i++) {
    if (view.getUint8(i) !== MAGIC[i]) throw new Error("Invalid MCZ file");
  }
  const pageCount = view.getUint16(6, true);
  const pages: PageInfo[] = [];
  for (let i = 0; i < pageCount; i++) {
    const base = HEADER_SIZE + i * ENTRY_SIZE;
    if (base + ENTRY_SIZE > buf.byteLength) break;
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

/** Minimum bytes needed to parse the full index. */
export function indexSize(pageCount: number): number {
  return HEADER_SIZE + pageCount * ENTRY_SIZE;
}

// ── MCZ handle ──────────────────────────────────────────────────────

export class MCZ {
  readonly pages: readonly PageInfo[];
  readonly pageCount: number;

  private readonly _source: ArrayBuffer | string;
  private readonly _urls = new Map<number, string>();

  private constructor(source: ArrayBuffer | string, pages: PageInfo[]) {
    this._source = source;
    this.pages = pages;
    this.pageCount = pages.length;
  }

  // ── Factory: local buffer ───────────────────────────────────────

  static from(buf: ArrayBuffer): MCZ {
    return new MCZ(buf, parseIndex(buf));
  }

  // ── Factory: remote URL (Range fetch for index only) ────────────

  static async open(url: string): Promise<MCZ> {
    // Fetch enough for header to get page_count
    const probe = await fetch(url, {
      headers: { Range: `bytes=0-${HEADER_SIZE - 1}` },
    });
    const headerBuf = await probe.arrayBuffer();
    const view = new DataView(headerBuf);
    for (let i = 0; i < 4; i++) {
      if (view.getUint8(i) !== MAGIC[i]) throw new Error("Invalid MCZ file");
    }
    const pageCount = view.getUint16(6, true);
    const needed = indexSize(pageCount);

    // Fetch full index if we don't have it all
    let indexBuf: ArrayBuffer;
    if (headerBuf.byteLength >= needed) {
      indexBuf = headerBuf;
    } else {
      const res = await fetch(url, {
        headers: { Range: `bytes=0-${needed - 1}` },
      });
      indexBuf = await res.arrayBuffer();
    }

    return new MCZ(url, parseIndex(indexBuf));
  }

  // ── Single page access ─────────────────────────────────────────

  async blob(index: number): Promise<Blob> {
    const info = this.pages[index];
    if (!info) throw new RangeError(`Page ${index} out of range`);

    if (this._source instanceof ArrayBuffer) {
      return new Blob(
        [this._source.slice(info.offset, info.offset + info.size)],
        { type: MIME[info.format] },
      );
    }

    // Range fetch single page
    const res = await fetch(this._source, {
      headers: { Range: `bytes=${info.offset}-${info.offset + info.size - 1}` },
    });
    const data = await res.arrayBuffer();
    return new Blob([data], { type: MIME[info.format] });
  }

  async url(index: number): Promise<string> {
    const existing = this._urls.get(index);
    if (existing) return existing;
    const blob = await this.blob(index);
    const u = URL.createObjectURL(blob);
    this._urls.set(index, u);
    return u;
  }

  // ── Progressive stream (single fetch, yields pages in order) ───

  async *stream(): AsyncGenerator<StreamPage> {
    if (this._source instanceof ArrayBuffer) {
      for (const info of this.pages) {
        const blob = new Blob(
          [this._source.slice(info.offset, info.offset + info.size)],
          { type: MIME[info.format] },
        );
        yield { index: info.index, blob };
      }
      return;
    }

    const res = await fetch(this._source);
    const total = +(res.headers.get("content-length") || 0);
    const reader = res.body!.getReader();

    // Pre-allocate if Content-Length known, otherwise collect chunks
    let buffer: Uint8Array;
    let pos = 0;

    if (total > 0) {
      buffer = new Uint8Array(total);
    } else {
      buffer = new Uint8Array(0);
    }

    let pageIdx = 0;

    while (pageIdx < this.pages.length) {
      const { value, done } = await reader.read();
      if (done) break;

      if (total > 0) {
        // Pre-allocated: write directly
        buffer.set(value, pos);
      } else {
        // Unknown size: grow buffer
        if (pos + value.length > buffer.length) {
          const next = new Uint8Array(Math.max(buffer.length * 2, pos + value.length));
          next.set(buffer);
          buffer = next;
        }
        buffer.set(value, pos);
      }
      pos += value.length;

      // Yield all pages whose data is now complete
      while (pageIdx < this.pages.length) {
        const info = this.pages[pageIdx];
        if (pos < info.offset + info.size) break;
        const blob = new Blob(
          [buffer.slice(info.offset, info.offset + info.size)],
          { type: MIME[info.format] },
        );
        yield { index: info.index, blob };
        pageIdx++;
      }
    }
  }

  // ── Cleanup ────────────────────────────────────────────────────

  close(): void {
    for (const u of this._urls.values()) URL.revokeObjectURL(u);
    this._urls.clear();
  }
}
