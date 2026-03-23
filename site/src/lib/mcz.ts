// MCZ — zero-dependency TypeScript SDK

const MAGIC = 0x015a434d;
const RIFF = 0x46464952;
const HDR = 8;
const ENT = 16;
const FMT = ["webp", "jpeg", "jxl"] as const;
const MIME: Record<string, string> = { webp: "image/webp", jpeg: "image/jpeg", jxl: "image/jxl" };

// Minimal 1×1 white VP8L WebP (38 bytes). Width/height patched at runtime.
// Layout: RIFF(12) + VP8L tag(4) + VP8L size(4) + signature(1) + header(4) + image data(13)
const WEBP_1X1 = new Uint8Array([
  0x52,0x49,0x46,0x46, 0x1e,0x00,0x00,0x00, 0x57,0x45,0x42,0x50,
  0x56,0x50,0x38,0x4c, 0x11,0x00,0x00,0x00, 0x2f,
  0x00,0x00,0x00,0x00, // ← VP8L image header (patched per dimensions)
  0x07,0xd0,0xff,0xfe,0xf7,0xbf,0xff,0x81,0x88,0xe8,0x7f,0x00,0x00,
]);

export type Format = "webp" | "jpeg" | "jxl";
export interface PageInfo { readonly index: number; readonly offset: number; readonly size: number; readonly width: number; readonly height: number; readonly format: Format }
export interface StreamPage { readonly index: number; readonly blob: Blob }
export interface StreamOptions { onProgress?: (received: number, total: number) => void }
export interface PackInput { data: ArrayBuffer | Uint8Array | Blob; width: number; height: number; format: Format }
export interface PackOptions { cover?: boolean }

// ── Helpers ──

/** Detect WebP (RIFF) prefix and return byte offset where MCZ header starts. */
export function mczOffset(v: DataView): number {
  if (v.getUint32(0, true) === MAGIC) return 0;
  if (v.getUint32(0, true) === RIFF) return 8 + v.getUint32(4, true);
  throw new Error("Invalid MCZ");
}

export function parseIndex(v: DataView, off: number): PageInfo[] {
  if (v.getUint32(off, true) !== MAGIC) throw new Error("Invalid MCZ");
  const n = v.getUint16(off + 6, true);
  return Array.from({ length: n }, (_, i) => {
    const b = off + HDR + i * ENT;
    return { index: i, offset: v.getUint32(b, true), size: v.getUint32(b + 4, true), width: v.getUint16(b + 8, true), height: v.getUint16(b + 10, true), format: FMT[v.getUint8(b + 12)] ?? "webp" };
  });
}

export const indexSize = (n: number) => HDR + n * ENT;

/** Generate a white WebP cover image (38 bytes) with given dimensions. */
function makeWebPCover(w: number, h: number): Uint8Array {
  const buf = new Uint8Array(WEBP_1X1);
  const v = new DataView(buf.buffer);
  // VP8L image header at byte 21: 14-bit (w-1), 14-bit (h-1), 1-bit alpha, 3-bit version
  v.setUint32(21, (w - 1) | ((h - 1) << 14), true);
  return buf;
}

function pageBlob(buf: ArrayBuffer, p: PageInfo) {
  return new Blob([new Uint8Array(buf, p.offset, p.size)], { type: MIME[p.format] });
}

// ── ByteWindow: growable buffer that can discard consumed prefix ──

class ByteWindow {
  private buf: Uint8Array;
  pos = 0; // total bytes received (absolute file position)
  private base = 0; // absolute offset of buf[0]

  constructor(hint: number) { this.buf = new Uint8Array(hint || 65536); }

  push(chunk: Uint8Array) {
    const localEnd = this.pos - this.base + chunk.length;
    if (localEnd > this.buf.length) {
      const next = new Uint8Array(Math.max(this.buf.length * 2, localEnd));
      next.set(this.buf.subarray(0, this.pos - this.base));
      this.buf = next;
    }
    this.buf.set(chunk, this.pos - this.base);
    this.pos += chunk.length;
  }

  has(offset: number, size: number) { return this.pos >= offset + size && offset >= this.base; }

  slice(offset: number, size: number) {
    const start = offset - this.base;
    return this.buf.slice(start, start + size);
  }

  /** Discard bytes before `offset` to free memory. */
  discard(offset: number) {
    if (offset <= this.base) return;
    const drop = offset - this.base;
    const keep = this.pos - offset;
    if (keep > 0) {
      this.buf.copyWithin(0, drop, drop + keep);
    }
    this.base = offset;
  }

  view(offset: number, length: number): DataView {
    return new DataView(this.buf.buffer, offset - this.base, length);
  }
}

async function pumpUntil(reader: ReadableStreamDefaultReader<Uint8Array>, win: ByteWindow, n: number) {
  while (win.pos < n) {
    const { value, done } = await reader.read();
    if (done) throw new Error("Unexpected EOF");
    win.push(value);
  }
}

// ── MCZ (immutable archive metadata) ──

export class MCZ {
  readonly pages: readonly PageInfo[];
  readonly pageCount: number;

  private constructor(
    pages: PageInfo[],
    private readonly data: ArrayBuffer | null,
  ) {
    this.pages = pages;
    this.pageCount = pages.length;
  }

  /** Open from local buffer (supports plain MCZ and WebP+MCZ polyglot). */
  static from(buf: ArrayBuffer): MCZ {
    const v = new DataView(buf);
    const off = mczOffset(v);
    return new MCZ(parseIndex(v, off), buf);
  }

  /** Open from URL — fetches only the header + index, returns archive + session for streaming. */
  static async open(url: string): Promise<{ archive: MCZ; session: MCZSession }> {
    const ctrl = new AbortController();
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (!res.body) throw new Error("No response body");

    const total = +(res.headers.get("content-length") || 0);
    const reader = res.body.getReader();
    const win = new ByteWindow(total);

    // Read enough for format detection
    await pumpUntil(reader, win, HDR);
    const off = mczOffset(win.view(0, HDR));

    // If polyglot, pump past WebP cover to MCZ header
    if (off > 0) await pumpUntil(reader, win, off + HDR);

    const n = win.view(off, HDR).getUint16(6, true);
    await pumpUntil(reader, win, off + indexSize(n));

    const pages = parseIndex(win.view(0, win.pos), off);
    const archive = new MCZ(pages, null);
    const session = new MCZSession(archive, reader, win, total, ctrl);
    return { archive, session };
  }

  /** Get page blob from local buffer. */
  blob(i: number): Blob {
    const p = this.pages[i];
    if (!p) throw new RangeError(`Page ${i} out of range`);
    if (!this.data) throw new Error("No local data — use MCZSession.stream() for remote archives");
    return pageBlob(this.data, p);
  }

  /** Pack pages into MCZ buffer. Set cover: true to prepend a WebP cover (polyglot). */
  static async pack(inputs: PackInput[], opts?: PackOptions): Promise<ArrayBuffer> {
    const fid = { webp: 0, jpeg: 1, jxl: 2 } as const;
    const n = inputs.length;
    const cover = opts?.cover ? makeWebPCover(inputs[0]?.width ?? 1, inputs[0]?.height ?? 1) : null;
    const prefix = cover ? cover.length : 0;
    const dOff = prefix + HDR + n * ENT;

    const bufs: Uint8Array[] = [];
    let dLen = 0;
    for (const inp of inputs) {
      const b = inp.data instanceof Uint8Array ? inp.data : new Uint8Array(inp.data instanceof ArrayBuffer ? inp.data : await inp.data.arrayBuffer());
      bufs.push(b); dLen += b.length;
    }

    const out = new Uint8Array(dOff + dLen);
    const v = new DataView(out.buffer);

    // Write WebP cover
    if (cover) out.set(cover, 0);

    // Write MCZ header
    v.setUint32(prefix, MAGIC, true);
    out[prefix + 4] = 1;
    v.setUint16(prefix + 6, n, true);

    // Write index + data
    let off = dOff;
    for (let i = 0; i < n; i++) {
      const b = prefix + HDR + i * ENT;
      v.setUint32(b, off, true);
      v.setUint32(b + 4, bufs[i].length, true);
      v.setUint16(b + 8, inputs[i].width, true);
      v.setUint16(b + 10, inputs[i].height, true);
      out[b + 12] = fid[inputs[i].format];
      out.set(bufs[i], off);
      off += bufs[i].length;
    }

    return out.buffer;
  }
}

// ── MCZSession (one-shot streaming session for remote archives) ──

export class MCZSession {
  private reader: ReadableStreamDefaultReader<Uint8Array> | null;
  private win: ByteWindow | null;
  private readonly total: number;
  private readonly ctrl: AbortController;
  private consumed = false;

  /** @internal — use MCZ.open() to create a session. */
  constructor(
    readonly archive: MCZ,
    reader: ReadableStreamDefaultReader<Uint8Array>,
    win: ByteWindow,
    total: number,
    ctrl: AbortController,
  ) {
    this.reader = reader;
    this.win = win;
    this.total = total;
    this.ctrl = ctrl;
  }

  /** Stream all pages progressively. Can only be called once. */
  async *stream(opts?: StreamOptions): AsyncGenerator<StreamPage> {
    if (this.consumed) throw new Error("Session already consumed — stream() is one-shot");
    this.consumed = true;

    const reader = this.reader!;
    const win = this.win!;
    const pages = this.archive.pages;
    let pi = 0;
    let lastEnd = 0;

    // Yield pages already buffered during open()
    while (pi < pages.length && win.has(pages[pi].offset, pages[pi].size)) {
      const p = pages[pi++];
      yield { index: p.index, blob: new Blob([win.slice(p.offset, p.size)], { type: MIME[p.format] }) };
      lastEnd = p.offset + p.size;
    }

    // Discard consumed prefix
    if (lastEnd > 0) win.discard(lastEnd);

    // Continue reading stream
    while (pi < pages.length) {
      const { value, done } = await reader.read();
      if (done) throw new Error(`Stream ended at page ${pi}/${pages.length}`);
      win.push(value);
      opts?.onProgress?.(win.pos, this.total);

      while (pi < pages.length && win.has(pages[pi].offset, pages[pi].size)) {
        const p = pages[pi++];
        yield { index: p.index, blob: new Blob([win.slice(p.offset, p.size)], { type: MIME[p.format] }) };
        lastEnd = p.offset + p.size;
      }

      // Free memory for consumed pages
      if (lastEnd > 0) win.discard(lastEnd);
    }

    this.cleanup();
  }

  /** Cancel the streaming session and release resources. */
  async close() {
    if (this.reader) {
      try { await this.reader.cancel(); } catch {}
    }
    this.cleanup();
  }

  private cleanup() {
    this.reader = null;
    this.win = null;
  }
}
