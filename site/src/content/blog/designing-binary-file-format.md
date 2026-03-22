---
title: "What I Got Right (and Wrong) Designing the MCZ Binary Format"
description: "Lessons from designing a binary container format — header layout, index placement, endianness, versioning, and the trade-offs that keep me up at night."
date: "2026-03-08"
tags: ["format-design", "binary", "engineering"]
---

<aside class="tldr">

<span class="label">Key Takeaway</span> The entire MCZ format spec fits on one page. A reader can be implemented in under 100 lines in any language. That simplicity is the result of deliberate constraints — no compression, no filenames, fixed-size records, index at byte 0. Every feature you leave out is a feature every implementation doesn't have to support.

</aside>

I never planned to design a file format. I just needed a way to stream manga pages over HTTP, tried ZIP and PDF, got frustrated by their limitations, and ended up sketching a format on a napkin. That napkin sketch is now MCZ.

Here's what I learned — the decisions that worked, and the ones I'd reconsider.

## Why did I put the index at byte 0?

This is the most important decision in MCZ, and it was the easiest to make. ZIP puts its index at the end. PDF scatters its cross-references throughout the file. Both are terrible for streaming.

If the index is at byte 0:

- One Range request gives you the complete table of contents
- Streaming delivers the index first, before any data
- `mmap()` gives you the index at a known offset

If the index is at the end:

- You need the full file (or two round trips) before you know what's inside
- Streaming is useless — you can't parse content without the index
- Random access requires downloading metadata you don't need

I didn't invent this idea. It's how video containers (MP4 with `moov` at start) and database files work. But for image containers, it was surprisingly uncommon. ZIP chose end-of-file because it was designed for sequential writing to tapes. MCZ chose start-of-file because it was designed for HTTP reading.

## Why are all records exactly 16 bytes?

Each index entry is fixed-size:

```
offset:   4 bytes (u32 LE)
size:     4 bytes (u32 LE)  
width:    2 bytes (u16 LE)
height:   2 bytes (u16 LE)
format:   1 byte
reserved: 3 bytes
```

This means page N is at `8 + N × 16`. O(1) random access. No scanning, no variable-length parsing.

I considered including filenames (like ZIP does). Variable-length strings would have required either a string table or length-prefixed records. Both add complexity. Both break O(1) access.

For manga pages, sequential numbering is natural. You don't need "page_042_final_v2.webp" — you need page 42. So I dropped filenames entirely.

## Why little-endian everywhere?

Every multi-byte integer in MCZ is little-endian. No exceptions. This is boring on purpose.

- x86/x64 is little-endian. ARM runs little-endian by default. That's 99% of hardware.
- JavaScript: `view.getUint32(offset, true)` — the `true` means little-endian.
- Rust: `u32::from_le_bytes()` — explicit and clear.
- No per-field endianness decisions. No "this field is big-endian because network byte order."

TIFF allows both endiannesses. That means every TIFF reader needs to handle both. Every TIFF field access checks a flag. It's a constant source of bugs. MCZ doesn't have this problem.

## Why no compression at the container level?

MCZ stores image data as-is. No gzip, no zstd, no deflate.

This feels wrong at first. "Shouldn't you compress everything?" No. Here's why:

- **WebP, JPEG, and JXL are already compressed.** Applying another compression layer achieves 0-2% additional savings at significant CPU cost.
- **Compression kills random access.** To read page 15 in a compressed stream, you'd need to decompress pages 1-14. ZIP has this exact problem.
- **Compression kills streaming.** You can't yield individual pages from a compressed stream unless each page is independently compressed (which negates most savings).

By not compressing, MCZ can yield complete pages as soon as their bytes arrive. No decompression step. No buffering. No dependencies between pages.

## What are the 3 reserved bytes for?

Each index entry has 3 unused bytes (positions 13-15). The header has a flags byte. These are insurance:

```
byte 12: format (0=WebP, 1=JPEG, 2=JXL)
byte 13-15: reserved (must be 0)
```

Possible future uses: BlurHash preview data, color space indicators, DPI metadata, encryption flags. I don't know yet which I'll need. But if I hadn't reserved the space, adding anything later would require a format version bump.

The rule: current writers set reserved bytes to 0. Current readers ignore them. Future versions can use them without breaking existing files.

## What would I change?

### The 4 GB limit

Using u32 for offsets caps file size at ~4 GB. For manga chapters (typically 2-10 MB), this is way more than enough. But I sometimes wonder about edge cases — a massive artbook, a very high-resolution archive.

A version 2 with u64 offsets would fix this. But it would double the index entry size from 16 to 24 bytes, breaking the clean powers-of-two alignment. I haven't needed it yet.

### No checksum

MCZ doesn't include integrity verification. A corrupted file might parse successfully but display garbled images. A CRC32 per page would catch this. I opted against it to keep parsing simple, relying instead on transport-level integrity (HTTPS, filesystem checksums).

In practice, I haven't seen corruption issues. But it bothers me that I can't detect them.

### Format enumeration

The format byte supports 256 values, but only 3 are defined. When AVIF support arrives, it gets value 3. But what about formats that don't exist yet? A MIME-type approach would be more extensible, but it requires variable-length strings in the index — which I explicitly avoided.

## How do you know a format is good?

I have four tests:

1. **Can you implement a reader in under 100 lines?** MCZ: yes, in any language.
2. **Does the spec fit on one page?** MCZ: 66 lines of Markdown.
3. **Can you explain the layout in 60 seconds?** MCZ: "header, index, data."
4. **Will files created today be readable in 10 years?** MCZ: it's just bytes in a documented order.

The hardest part of format design isn't deciding what to include. It's deciding what to leave out. Every feature you add is a feature every implementation must support forever.

---

## Frequently Asked Questions

### Can MCZ be extended without breaking existing files?

Yes. The reserved bytes in each index entry and the version/flags fields in the header provide extension points. A reader that understands version 1 can safely skip unknown fields in future versions.

### Why not use Protocol Buffers or MessagePack for the index?

They add dependencies. MCZ's index is simple enough to parse with raw byte operations — `DataView` in JavaScript, `read_exact` in Rust. No schema files, no code generation, no library dependencies.

### Is MCZ influenced by any existing formats?

MP4's `moov` atom (index at start for streaming), PNG's chunk-based structure (fixed-size headers), and HTTP byte-range semantics all influenced the design. The combination of index-first layout with raw image passthrough is what makes MCZ unique.

### How many pages can an MCZ file contain?

The `page_count` field is u16, so the theoretical maximum is 65,535 pages. The practical limit depends on the u32 offset field — with a 4 GB file size limit, you'd hit that before reaching 65K pages for any reasonable image size.
