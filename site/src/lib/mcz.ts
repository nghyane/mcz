// MCZ — zero-dependency TypeScript SDK

const MAGIC = 0x015a434d;
const RIFF = 0x46464952;
const MCZD = 0x644a434d; // "MCZd" little-endian
const HDR = 8;
const ENT = 16;
const FMT = ["webp", "jpeg", "jxl"] as const;
const MIME: Record<string, string> = { webp: "image/webp", jpeg: "image/jpeg", jxl: "image/jxl" };

// VP8L 1×1 white data (17 bytes). Width/height patched at pack time.
const VP8L_DATA = new Uint8Array([
  0x2f, 0x00,0x00,0x00,0x00,
  0x07,0xd0,0xff,0xfe,0xf7,0xbf,0xff,0x81,0x88,0xe8,0x7f,0x00,0x00,
]);
const VP8L_PADDED = VP8L_DATA.length + (VP8L_DATA.length % 2); // 18 (pad to even)
// Cover overhead: RIFF(12) + VP8L chunk(8 + 18) + MCZd tag+size(8) = 46 bytes before MCZ data
const COVER_PREFIX = 12 + 8 + VP8L_PADDED + 8;

export type Format = "webp" | "jpeg" | "jxl";
export interface PageInfo { readonly index: number; readonly offset: number; readonly size: number; readonly width: number; readonly height: number; readonly format: Format }
export interface StreamPage { readonly index: number; readonly blob: Blob }
export interface StreamOptions { onProgress?: (received: number, total: number) => void }
export interface PackInput { data: ArrayBuffer | Uint8Array | Blob; width: number; height: number; format: Format }
export interface PackOptions { cover?: boolean }

// ── Helpers ──

/** Scan RIFF chunks to find MCZd, return offset of MCZ data within MCZd chunk. */
export function mczOffset(v: DataView): number {
  if (v.getUint32(0, true) === MAGIC) return 0;
  if (v.getUint32(0, true) !== RIFF) throw new Error("Invalid MCZ");

  // Scan RIFF chunks after "WEBP" tag
  let pos = 12;
  const end = 8 + v.getUint32(4, true);
  while (pos + 8 <= end && pos + 8 <= v.byteLength) {
    const tag = v.getUint32(pos, true);
    const size = v.getUint32(pos + 4, true);
    if (tag === MCZD) return pos + 8; // MCZ data starts after MCZd tag + size
    pos += 8 + size + (size % 2); // skip chunk + padding
  }
  throw new Error("MCZd chunk not found");
}

/** Minimum bytes needed to locate MCZd chunk (RIFF header + VP8L chunk + MCZd header). */
function minScanBytes(v: DataView): number {
  if (v.getUint32(0, true) === MAGIC) return HDR;
  // RIFF: skip to after first chunk (VP8L) + MCZd header
  let pos = 12;
  const end = Math.min(8 + v.getUint32(4, true), v.byteLength);
  while (pos + 8 <= end) {
    const tag = v.getUint32(pos, true);
    const size = v.getUint32(pos + 4, true);
    if (tag === MCZD) return pos + 8 + HDR; // need MCZd header + MCZ header
    pos += 8 + size + (size % 2);
  }
  return pos + 8; // need more data
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

function pageBlob(buf: ArrayBuffer, p: PageInfo) {
  return new Blob([new Uint8Array(buf, p.offset, p.size)], { type: MIME[p.format] });
}

// ── ByteWindow: growable buffer that can discard consumed prefix ──

class ByteWindow {
  private buf: Uint8Array;
  pos = 0;
  private base = 0;

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

  discard(offset: number) {
    if (offset <= this.base) return;
    const drop = offset - this.base;
    const keep = this.pos - offset;
    if (keep > 0) this.buf.copyWithin(0, drop, drop + keep);
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

  /** Open from local buffer (plain MCZ or RIFF/WebP polyglot with MCZd chunk). */
  static from(buf: ArrayBuffer): MCZ {
    const v = new DataView(buf);
    const off = mczOffset(v);
    return new MCZ(parseIndex(v, off), buf);
  }

  /** Open from URL — stream header, return archive + session. */
  static async open(url: string): Promise<{ archive: MCZ; session: MCZSession }> {
    const ctrl = new AbortController();
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (!res.body) throw new Error("No response body");

    const total = +(res.headers.get("content-length") || 0);
    const reader = res.body.getReader();
    const win = new ByteWindow(total);

    // Read enough to detect format and find MCZd
    await pumpUntil(reader, win, 12);
    const needed = minScanBytes(win.view(0, win.pos));
    await pumpUntil(reader, win, needed);

    const off = mczOffset(win.view(0, win.pos));
    await pumpUntil(reader, win, off + HDR);

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

  /** Pack pages into MCZ. cover=true wraps in RIFF/WebP with MCZd chunk. */
  static async pack(inputs: PackInput[], opts?: PackOptions): Promise<ArrayBuffer> {
    const fid = { webp: 0, jpeg: 1, jxl: 2 } as const;
    const n = inputs.length;
    const useCover = opts?.cover ?? false;

    const bufs: Uint8Array[] = [];
    let dLen = 0;
    for (const inp of inputs) {
      const b = inp.data instanceof Uint8Array ? inp.data : new Uint8Array(inp.data instanceof ArrayBuffer ? inp.data : await inp.data.arrayBuffer());
      bufs.push(b); dLen += b.length;
    }

    const mczSize = HDR + n * ENT + dLen;
    const prefix = useCover ? COVER_PREFIX : 0;
    const fileSize = prefix + mczSize;
    const out = new Uint8Array(fileSize);
    const v = new DataView(out.buffer);

    if (useCover) {
      // RIFF header
      v.setUint32(0, RIFF, true);
      v.setUint32(4, fileSize - 8, true); // RIFF size = everything after first 8 bytes
      out[8] = 0x57; out[9] = 0x45; out[10] = 0x42; out[11] = 0x50; // "WEBP"

      // VP8L chunk (tag + size + data + pad)
      out[12] = 0x56; out[13] = 0x50; out[14] = 0x38; out[15] = 0x4c; // "VP8L"
      v.setUint32(16, VP8L_DATA.length, true);
      const vp8l = new Uint8Array(VP8L_DATA);
      // Patch dimensions
      const w = inputs[0]?.width ?? 1, h = inputs[0]?.height ?? 1;
      const dv = new DataView(vp8l.buffer);
      dv.setUint32(1, (w - 1) | ((h - 1) << 14), true);
      out.set(vp8l, 20);
      // pad byte at 20 + 17 = 37 (already zero)

      // MCZd chunk header
      const mczd_off = 12 + 8 + VP8L_PADDED; // 38
      out[mczd_off] = 0x4d; out[mczd_off+1] = 0x43; out[mczd_off+2] = 0x5a; out[mczd_off+3] = 0x64; // "MCZd"
      v.setUint32(mczd_off + 4, mczSize, true);
    }

    // MCZ header
    const mOff = prefix;
    v.setUint32(mOff, MAGIC, true);
    out[mOff + 4] = 1;
    v.setUint16(mOff + 6, n, true);

    // Index + data
    let dataOff = prefix + HDR + n * ENT;
    for (let i = 0; i < n; i++) {
      const b = mOff + HDR + i * ENT;
      v.setUint32(b, dataOff, true);
      v.setUint32(b + 4, bufs[i].length, true);
      v.setUint16(b + 8, inputs[i].width, true);
      v.setUint16(b + 10, inputs[i].height, true);
      out[b + 12] = fid[inputs[i].format];
      out.set(bufs[i], dataOff);
      dataOff += bufs[i].length;
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

    while (pi < pages.length && win.has(pages[pi].offset, pages[pi].size)) {
      const p = pages[pi++];
      yield { index: p.index, blob: new Blob([win.slice(p.offset, p.size)], { type: MIME[p.format] }) };
      lastEnd = p.offset + p.size;
    }
    if (lastEnd > 0) win.discard(lastEnd);

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
      if (lastEnd > 0) win.discard(lastEnd);
    }

    this.cleanup();
  }

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
