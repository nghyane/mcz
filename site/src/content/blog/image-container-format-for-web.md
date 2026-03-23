---
title: "Why Your Image Gallery Needs a Container Format"
description: "Individual image files mean individual requests, unknown dimensions, and no streaming. A container format solves all three with one file."
date: "2026-01-06"
tags: ["architecture", "format", "web-performance"]
---

<aside class="tldr">

<span class="label">Key Takeaway</span> A container format bundles images with a lightweight index. One file replaces 20+ HTTP requests, dimensions are known instantly, and images stream progressively. Think of it as MP4 for images — sequential content in a streamable wrapper.

</aside>

We have container formats for video (MP4, WebM), audio (OGG), and documents (PDF). But for image sequences — galleries, product shots, portfolios, slide decks — we still serve individual files. Each image is a separate request with no relationship to the others.

This works fine for a blog post with 3 images. It falls apart for a gallery with 20.

## What problems does an image container solve?

### Problem 1: Too many HTTP requests

20 images = 20 requests. Each carries ~2 KB of headers. On HTTP/1.1, only 6 run in parallel. On HTTP/2, they share bandwidth. Either way, the overhead adds up.

A container sends **one file**. One DNS lookup, one TCP connection, one TLS handshake.

### Problem 2: Unknown dimensions

The browser doesn't know an image's width and height until it starts downloading. Without dimensions, it can't reserve space — causing layout shift (CLS) when images load.

A container **embeds dimensions in its index**. Before any image data loads, you know every image's size.

### Problem 3: No progressive loading

Individual images load in arbitrary order based on network conditions. There's no way to guarantee that image 1 loads before image 15.

A container **streams sequentially**. Images appear in order as bytes arrive.

## What does an image container look like?

MCZ is a minimal container I built to solve these problems:

<div class="flex flex-col gap-1 my-6 font-mono text-xs not-prose">
  <div class="bg-[#1a1a2e] text-white px-4 py-2.5 rounded-t-lg">Header — magic bytes, version, image count (8 B)</div>
  <div class="bg-[#16213e] text-white px-4 py-2.5">Index — width, height, offset, size per image (16 B each)</div>
  <div class="bg-[#0f3460] text-white px-4 py-2.5 rounded-b-lg">Image data — WebP, JPEG, JXL stored as-is</div>
</div>

The entire spec fits on one page. A reader can be implemented in under 100 lines. Images aren't re-encoded — they pass through untouched.

## How does it work in practice?

```javascript
// 1. Open the container — fetches just the index (~400 bytes)
const mcz = await MCZ.open('/gallery.mcz');

// 2. Dimensions available instantly — create layout
mcz.pages.forEach(img => {
  const el = document.createElement('div');
  el.style.aspectRatio = `${img.width} / ${img.height}`;
  gallery.appendChild(el);
});

// 3. Stream images — they appear as data arrives
for await (const { index, blob } of mcz.stream()) {
  elements[index].style.backgroundImage =
    `url(${URL.createObjectURL(blob)})`;
}
```

Two HTTP requests total. Zero layout shift. Progressive rendering.

## How is this different from ZIP?

ZIP is a container, but its index is at the **end** of the file. You can't read the table of contents until the entire file downloads. That makes streaming impossible and layout planning impractical.

MCZ puts the index at **byte 0** — specifically designed for HTTP streaming with Range requests.

## When should you use this?

**Good fit:**
- Photo galleries (portfolio, real estate, product pages)
- Multi-page documents (slide decks, digital catalogs)
- Any UI showing 5+ images that load together

**Not needed:**
- Single hero images
- Images loaded on user interaction (modals, tabs)
- Content where images are interspersed with text

## Real-world use cases

- **E-commerce**: Product pages with 10-30 photos. One MCZ file per product, instant layout, progressive loading as users scroll.
- **Digital publishing**: Multi-page documents delivered as image sequences. Known dimensions mean perfect layout before content loads.
- **Photography portfolios**: High-res gallery sets served from a CDN. One file per gallery, smooth streaming experience.

---

## Frequently Asked Questions

### Doesn't HTTP/2 solve the multiple request problem?

Partially. HTTP/2 multiplexes requests over one connection, but each request still carries headers, and the server reads each file separately. A container gives you sequential read (optimal for disk I/O) and eliminates per-image overhead entirely.

### How do I create MCZ files in my build pipeline?

```bash
mcz pack ./images -o output.mcz -q 80
```

Or use the JavaScript SDK to pack images programmatically — useful for server-side generation from user uploads.

### What's the file size overhead?

8 bytes header + 16 bytes per image for the index. For 20 images, that's 328 bytes — negligible compared to the image data.

### Can I lazy-load individual images from a container?

Yes. The index contains byte offsets for each image. You can fetch any single image with an HTTP Range request without downloading the others.
