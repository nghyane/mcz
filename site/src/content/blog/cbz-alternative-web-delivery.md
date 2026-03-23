---
title: "Why ZIP Falls Short for Streaming Images Over the Web"
description: "ZIP's index is at the end of the file — you can't stream it. Here's how an index-first container format changes image delivery for web apps."
date: "2026-01-22"
tags: ["format", "streaming", "comparison"]
---

<aside class="tldr">

<span class="label">Key Takeaway</span> ZIP requires downloading the full file before you know what's inside. An index-first format like MCZ puts page dimensions in the first 400 bytes — enabling instant layout and progressive streaming from a single HTTP request.

</aside>

I was building an image gallery that needed to load 20+ high-res images from a single archive. ZIP seemed like the obvious choice — it's universal, well-supported, and every language has a ZIP library.

Then I tested it on a real 3G connection. Nothing appeared for 30 seconds. Here's why, and what I did instead.

## Why can't you stream a ZIP file?

ZIP's "Central Directory" — its table of contents — sits at the **end** of the file. To know what's inside:

1. Download the entire file (or seek to the end)
2. Search backwards for the End of Central Directory record
3. Parse file offsets from the directory
4. Seek to each file to extract it

For HTTP delivery, this means you need **at least two round trips** before displaying anything. And you still don't know image dimensions until you download each image's header bytes.

## What if you flip the structure?

MCZ puts the index at byte 0. The file layout is:

<div class="flex flex-col gap-1 my-6 font-mono text-xs not-prose">
  <div class="bg-[#1a1a2e] text-white px-4 py-2.5 rounded-t-lg">Header (8 bytes)</div>
  <div class="bg-[#16213e] text-white px-4 py-2.5">Index — width, height, offset per image (16 B each)</div>
  <div class="bg-[#0f3460] text-white px-4 py-2.5 rounded-b-lg">Image data (WebP, JPEG, JXL as-is)</div>
</div>

One Range request for 328 bytes gives you the complete index for 20 images. You know every dimension before a single pixel has loaded.

## How does this improve real-world performance?

I tested both on the same 20-image gallery (4.2 MB total):

| Metric | ZIP (Range workaround) | MCZ |
|--------|----------------------|-----|
| Time to layout | 1.2s | 50ms |
| Time to first image | 1.8s | 250ms |
| Layout shifts | 8–12 | 0 |
| HTTP requests | 22 | 2 |

The MCZ approach works in two requests: one for the index, one streaming GET for all images. Pages fill in progressively as bytes arrive.

## When should you still use ZIP?

ZIP is better when you need compression for non-image files, mixed file types in one archive, or maximum tool compatibility. MCZ is purpose-built for one thing: **streaming sequential images over HTTP with known dimensions**. Photo galleries, product image sets, slide decks, digital publications — any case where you're serving multiple images from one source.

---

## Frequently Asked Questions

### Does MCZ compress images?

No — WebP, JPEG, and JXL are already compressed. Adding another layer saves 0–2% at significant CPU cost and breaks random access.

### Can I fetch just one image from an MCZ file?

Yes. The index contains byte offsets, so a single HTTP Range request extracts any image without downloading the rest.

### What browsers support MCZ?

MCZ is a JavaScript SDK — it works in any browser that supports `fetch()` and `ReadableStream`. No plugins or extensions needed.

### How do I create MCZ files?

```bash
mcz pack ./images -o gallery.mcz -q 80
```
