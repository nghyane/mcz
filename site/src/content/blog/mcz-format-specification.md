---
title: "MCZ Format Specification — A Complete Technical Reference"
description: "The full MCZ binary format spec: 8-byte header, 16-byte index entries, streaming protocol, and implementation guide. Everything you need to build an MCZ reader."
date: "2025-12-10"
tags: ["specification", "reference", "binary"]
---

<aside class="tldr">

<span class="label">Key Takeaway</span> MCZ is an 8-byte header + 16 bytes per page index + raw image data. All little-endian. The entire spec fits in this single post — that's by design.

</aside>

I wanted MCZ to be the kind of format a developer could implement during a lunch break. No 200-page PDF specification. No ambiguous edge cases. Just bytes in a documented order.

Here's the complete specification.

## What does an MCZ file look like?

Three sections, always in this order:

<div class="flex flex-col gap-1 my-6 font-mono text-xs not-prose">
  <div class="bg-[#1a1a2e] text-white px-4 py-2.5 rounded-t-lg">Header (8 bytes)</div>
  <div class="bg-[#16213e] text-white px-4 py-2.5">Page Index (page_count × 16 bytes)</div>
  <div class="bg-[#0f3460] text-white px-4 py-2.5 rounded-b-lg">Page 0 .. Page N (raw image bytes)</div>
</div>

That's it. No optional chunks, no compression wrappers, no metadata sections.

## What's in the header?

8 bytes. Every MCZ file starts with these:

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| 0 | 4 | `magic` | `MCZ\x01` (`4d 43 5a 01`) |
| 4 | 1 | `version` | Format version (`1`) |
| 5 | 1 | `flags` | Reserved, must be `0` |
| 6 | 2 | `page_count` | Number of pages, u16 LE |

The magic bytes serve double duty — they identify the file as MCZ and confirm it's not truncated or byte-swapped. If bytes 0-3 aren't `4d 43 5a 01`, it's not a valid MCZ file.

## What's in each index entry?

Each page gets exactly 16 bytes in the index:

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| 0 | 4 | `offset` | Byte position of image data, u32 LE |
| 4 | 4 | `size` | Encoded image byte size, u32 LE |
| 8 | 2 | `width` | Image width in pixels, u16 LE |
| 10 | 2 | `height` | Image height in pixels, u16 LE |
| 12 | 1 | `format` | `0` = WebP, `1` = JPEG, `2` = JXL |
| 13 | 3 | `reserved` | Must be `0` |

Page N's entry starts at byte `8 + N × 16`. No scanning needed — O(1) random access.

The `offset` field points to the absolute byte position of the image data within the file. The `size` field is the exact number of bytes for that image. Together, they define the byte range `[offset, offset + size)` for extracting any page.

## What are the format's limits?

- **Max pages**: 65,535 (u16 `page_count`)
- **Max page size**: ~4 GB (u32 `size`)
- **Max file offset**: ~4 GB (u32 `offset`)
- **Supported formats**: WebP (0), JPEG (1), JPEG XL (2)

For manga chapters (typically 15-30 pages, 2-10 MB total), these limits are orders of magnitude beyond what's needed.

## How does streaming work in practice?

Two patterns — pick whichever fits your use case.

### Pattern 1: Index + Random Access

Fetch just the index, then request individual pages by byte range. Best for paginated readers.

<div class="bg-bg-sub border border-border rounded-lg p-4 my-6 font-mono text-xs leading-relaxed overflow-x-auto not-prose">
  <div class="flex items-center gap-3 mb-3 text-fg3">
    <span class="font-semibold text-fg">Client</span>
    <span>→</span>
    <span class="font-semibold text-fg">Server</span>
  </div>
  <div class="space-y-2">
    <div><span class="text-syn-kw">GET</span> <span class="text-syn-str">Range: bytes=0-327</span></div>
    <div class="text-fg3">← <span class="text-syn-fn">206</span> — header + index (328 B for 20 pages)</div>
    <div class="text-fg3 italic">Layout all 20 pages instantly (zero CLS)</div>
    <div class="border-t border-border my-3"></div>
    <div><span class="text-syn-kw">GET</span> <span class="text-syn-str">Range: bytes=328-210759</span></div>
    <div class="text-fg3">← <span class="text-syn-fn">206</span> — page 0 (WebP, 210 KB)</div>
  </div>
</div>

### Pattern 2: Index + Full Stream

Fetch the index first, then stream the entire file. Best for vertical scroll readers.

<div class="bg-bg-sub border border-border rounded-lg p-4 my-6 font-mono text-xs leading-relaxed overflow-x-auto not-prose">
  <div class="flex items-center gap-3 mb-3 text-fg3">
    <span class="font-semibold text-fg">Client</span>
    <span>→</span>
    <span class="font-semibold text-fg">Server</span>
  </div>
  <div class="space-y-2">
    <div><span class="text-syn-kw">GET</span> <span class="text-syn-str">Range: bytes=0-327</span></div>
    <div class="text-fg3">← <span class="text-syn-fn">206</span> — header + index</div>
    <div class="text-fg3 italic">Layout all pages</div>
    <div class="border-t border-border my-3"></div>
    <div><span class="text-syn-kw">GET</span> <span class="text-syn-str">(full file)</span></div>
    <div class="text-fg3">← <span class="text-syn-fn">200</span> — streaming response, render pages as data arrives</div>
  </div>
</div>

## How do you implement a reader?

Here's a minimal JavaScript reader in ~30 lines:

```javascript
const MAGIC = 0x015a434d;
const HEADER = 8;
const ENTRY = 16;
const FORMATS = ['webp', 'jpeg', 'jxl'];

function parseIndex(buf) {
  const view = new DataView(buf);
  if (view.getUint32(0, true) !== MAGIC) throw new Error('Not MCZ');
  const count = view.getUint16(6, true);
  const pages = [];
  for (let i = 0; i < count; i++) {
    const b = HEADER + i * ENTRY;
    pages.push({
      offset: view.getUint32(b, true),
      size:   view.getUint32(b + 4, true),
      width:  view.getUint16(b + 8, true),
      height: view.getUint16(b + 10, true),
      format: FORMATS[view.getUint8(b + 12)]
    });
  }
  return pages;
}
```

That's a complete index parser. Extracting a page is one line:

```javascript
const pageBlob = new Blob(
  [new Uint8Array(buffer, page.offset, page.size)],
  { type: `image/${page.format}` }
);
```

## How do you create an MCZ file?

Writing is equally simple — concatenate the header, index, and image data:

```javascript
function pack(images) {
  const count = images.length;
  const headerSize = 8 + count * 16;
  
  // Calculate offsets
  let offset = headerSize;
  const entries = images.map(img => {
    const entry = { ...img, offset };
    offset += img.data.length;
    return entry;
  });

  // Write
  const buf = new ArrayBuffer(offset);
  const view = new DataView(buf);
  view.setUint32(0, 0x015a434d, true); // magic
  view.setUint8(4, 1);                  // version
  view.setUint16(6, count, true);       // page_count

  entries.forEach((e, i) => {
    const b = 8 + i * 16;
    view.setUint32(b, e.offset, true);
    view.setUint32(b + 4, e.data.length, true);
    view.setUint16(b + 8, e.width, true);
    view.setUint16(b + 10, e.height, true);
    view.setUint8(b + 12, e.formatId);
    new Uint8Array(buf, e.offset).set(new Uint8Array(e.data));
  });

  return buf;
}
```

Or just use the CLI:

```bash
mcz pack ./images -o chapter.mcz -q 80
mcz info chapter.mcz
mcz extract chapter.mcz 0 -o cover.webp
```

---

## Frequently Asked Questions

### Can MCZ files contain non-image data?

No. MCZ is purpose-built for sequential images. If you need to include metadata, chapter titles, or text, store them alongside the MCZ file (in a database, JSON sidecar, etc.) rather than inside it.

### How do I validate an MCZ file?

Check that bytes 0-3 equal `4d 43 5a 01`, version is `1`, and each index entry's `offset + size` doesn't exceed the file size. The `mcz info` command does this automatically.

### Is the format stable? Will it change?

Version 1 is final. Any future changes would use version 2+ with a different version byte, so existing v1 readers will never misparse a newer file — they'll reject it with a clear version error.

### Where can I find implementations?

- **Rust** (CLI + library): [github.com/nghyane/mcz](https://github.com/nghyane/mcz)
- **JavaScript/TypeScript** (browser SDK): same repo, `js/` directory
- **Try it live**: [MCZ Playground](/playground/)
