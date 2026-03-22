---
title: "Why I Built MCZ Instead of Using ZIP for Image Streaming"
description: "ZIP puts its index at the end of the file. I needed it at byte 0. Here's why that one decision changes everything for streaming images over HTTP."
date: "2026-03-23"
tags: ["format", "streaming", "comparison"]
---

<aside class="tldr">

<span class="label">Key Takeaway</span> ZIP's index lives at the end of the file, so you can't know what's inside until the full download completes. MCZ puts the index at byte 0, giving you every page's dimensions in the first 400 bytes. That means instant layout, zero CLS, and progressive streaming — none of which are possible with ZIP.

</aside>

I spent weeks trying to make ZIP work for streaming manga chapters before giving up and designing MCZ. Here's the story of why.

## What's wrong with ZIP for serving images?

ZIP was designed in 1989 for archiving files on floppy disks. It's brilliant at that job. But it has a fundamental assumption baked into its structure: **you have the entire file before you start reading it.**

ZIP's "Central Directory" — the table of contents — sits at the *end* of the archive. To know what's inside, you need to:

1. Download the entire file (or at least the final few KB)
2. Search backwards for the End of Central Directory record
3. Parse the Central Directory to get file offsets
4. Seek to each file's position to extract it

For a 50 MB manga chapter on a 3G connection, that means the reader stares at a blank screen for 30+ seconds. No layout, no progress, nothing.

I tried every workaround I could find.

## Can't you just use Range requests with ZIP?

Sort of. You can fetch the end of the ZIP file first to get the Central Directory, then use Range requests for individual files. Some clever implementations do this.

But it still requires **at least two Round trips** before you can display anything — one to get the directory, one to fetch the first image. And you still don't know image dimensions until you actually start downloading each image, which means layout shift.

I tried this approach. It worked, but the user experience was mediocre. Pages popped in one at a time, the layout shifted as each image loaded, and there was always a noticeable delay on the first page.

## What does MCZ do differently?

The core insight is simple: **put the index first**.

```
[Header: 8 bytes] [Index: 16 bytes × pages] [Image data...]
```

One Range request for bytes 0-327 gives you the complete index of a 20-page chapter. Each index entry contains the page's width, height, byte offset, file size, and format. That's everything you need for instant layout.

The reader now knows every page's aspect ratio before a single image pixel has been transmitted. It can create correctly-sized placeholder boxes immediately — zero Cumulative Layout Shift.

## How much faster is it in practice?

I measured both approaches on a 20-page manga chapter (4.2 MB total) over different connections:

| Metric | ZIP + Range | MCZ |
|--------|------------|-----|
| Time to first layout | 1.2s (4G) | 50ms (4G) |
| Time to first image | 1.8s (4G) | 250ms (4G) |
| Layout shifts | 8-12 per chapter | 0 |
| HTTP requests | 22 (directory + 20 images + overhead) | 2 (index + stream) |
| Works on 3G? | Barely | Yes, progressively |

The difference is most dramatic on slow connections. MCZ shows the layout instantly and fills in images progressively. ZIP shows nothing, then everything at once (or one image at a time with significant delays).

## When should you still use ZIP?

I'm not saying ZIP is bad. It's the right tool for many jobs:

- **Archival**: ZIP's compression is useful for non-image files. MCZ doesn't compress because WebP/JPEG/JXL are already compressed.
- **Multi-type archives**: ZIP handles mixed file types. MCZ is images-only.
- **Universal tooling**: Every OS can open ZIP files. MCZ requires a reader that understands the format.
- **Existing ecosystems**: CBZ (Comic Book ZIP) has established reader support.

MCZ solves one specific problem: **streaming sequential images over HTTP with instant layout**. If that's your use case — manga readers, webtoon viewers, photo galleries with known dimensions — MCZ is significantly better.

## What about PDF?

PDF has a different problem. Its cross-reference table can be scattered throughout the file, and extracting individual pages requires parsing a complex object graph. PDF is designed for documents with mixed text, vector graphics, and images — it's overkill for a sequence of full-page images, and its streaming characteristics are poor.

## The trade-off I made

MCZ's simplicity comes from deliberate constraints:

- **No compression**: Images pass through as-is. This means no CPU overhead for decompression, but also no savings on already-uncompressed data.
- **No filenames**: Pages are numbered 0, 1, 2... No ambiguity from filename sorting, but also no metadata.
- **Images only**: No text, no fonts, no vector graphics. Just raster images in WebP, JPEG, or JXL.
- **4 GB limit**: Using 32-bit offsets caps file size at ~4 GB. More than enough for image chapters, but not future-proof for every use case.

Every constraint makes the format simpler to implement and faster to parse. The entire JavaScript SDK is under 250 lines. The Rust implementation is under 200.

---

## Frequently Asked Questions

### Is MCZ a replacement for CBZ?

Not exactly. CBZ (ZIP with images) has wide reader support and is great for local file management. MCZ is designed specifically for web delivery — streaming over HTTP with instant layout. If you're building a web reader, MCZ is better. If you're distributing files for desktop readers, CBZ has more support.

### Can MCZ files be converted to/from ZIP?

Yes. Since MCZ stores images without modification, you can extract pages and re-pack them into a ZIP, or extract images from a CBZ and pack them into MCZ. The `mcz` CLI tool handles both directions.

### Does MCZ support DRM or encryption?

No. MCZ is an open format designed for simplicity. If you need access control, handle it at the HTTP layer (authentication, signed URLs, etc.) rather than in the file format.

### Why not just use a video format for streaming images?

Video codecs (H.264, VP9, AV1) are optimized for temporal compression — exploiting similarities between consecutive frames. Manga pages don't have frame-to-frame similarity, so video codecs don't compress them well. You'd also lose random access and per-page quality control.

### How do I try MCZ?

The fastest way is the [playground](/playground/) — paste a URL or drop a file. For creating MCZ files, install the CLI with `curl -fsSL https://nghyane.github.io/mcz/install.sh | sh` and run `mcz pack ./images -o chapter.mcz`.
