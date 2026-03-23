---
title: "How to Stream Multiple Images in a Single HTTP Request"
description: "Stop firing 20 HTTP requests for 20 images. Here's how to bundle and stream them progressively from one connection."
date: "2026-03-05"
tags: ["http", "streaming", "performance"]
---

<aside class="tldr">

<span class="label">Key Takeaway</span> Pack multiple images into one file with an index at byte 0. Fetch the index with a Range request for instant layout, then stream the full file — images appear progressively as bytes arrive. One connection, zero overhead.

</aside>

Every image on your page is a separate HTTP request. Headers, TLS negotiation, server round trip — multiplied by every image. For a gallery with 20 photos, that's 20 requests fighting for bandwidth.

HTTP/2 multiplexing helps, but doesn't eliminate the overhead. What if you could serve all 20 images in one request and have them appear progressively?

## What's wrong with many parallel requests?

I profiled a product page with 24 images on 4G:

- **Header overhead**: ~2 KB per request × 24 = 48 KB of headers (more than most of the thumbnails)
- **Connection contention**: 24 streams sharing one TCP connection, each getting a fraction of bandwidth
- **Unpredictable order**: Images 15 and 22 might load before image 1
- **No layout info**: Each image's dimensions unknown until it starts loading

Total time: 4.1 seconds. Lots of layout jumping. Poor user experience.

## The approach: bundle + stream

The idea is simple:

1. **Pack** images into one file with a lightweight index at the start
2. **Fetch** just the index (one Range request) — now you know all dimensions
3. **Stream** the full file — yield each image as its bytes complete

```javascript
// Step 1: Get dimensions (328 bytes for 20 images)
const mcz = await MCZ.open(galleryUrl);

// Step 2: Create placeholders instantly
mcz.pages.forEach(p => {
  const div = document.createElement('div');
  div.style.aspectRatio = `${p.width} / ${p.height}`;
  container.appendChild(div);
});

// Step 3: Stream images into placeholders
for await (const { index, blob } of mcz.stream()) {
  const url = URL.createObjectURL(blob);
  placeholders[index].style.backgroundImage = `url(${url})`;
}
```

## How does progressive streaming actually work?

The `stream()` method does a single `fetch()` and reads the response body as a `ReadableStream`. Internally, it buffers incoming bytes and checks after each chunk whether any image is complete:

```
Bytes 0–327:      Index (dimensions for all 20 images)
Bytes 328–41000:  Image 0 completes → yield
Bytes 41001–85200: Image 1 completes → yield
...
```

Each image appears as soon as its last byte arrives. No waiting for the full download. The browser sees a single, saturated connection — maximum throughput.

## How does this compare to sprites or CSS image sets?

**CSS sprites** pack images into one file but require manual positioning, don't support different sizes well, and can't be progressively loaded.

**`<picture>` / `srcset`** solves responsive sizing but still fires one request per image.

**Image CDN batch APIs** (Cloudinary, imgix) can combine transforms but return separate images per request.

The container approach is different: one file, one connection, progressive delivery, known dimensions upfront.

## When doesn't this approach work?

- **Very few images** (1-3): The overhead of a container format isn't worth it. Just use regular `<img>` tags.
- **Images loaded on interaction**: If images appear based on user actions (tabs, modals), lazy loading individual images is more appropriate.
- **Server-side rendering**: If you're generating HTML server-side with known dimensions, HTML `width`/`height` attributes achieve zero CLS without a container format.

The sweet spot is **5+ sequential images that load together** — galleries, slideshows, product image sets, multi-page documents.

## Creating an image bundle

```bash
# Install MCZ CLI
curl -fsSL https://raw.githubusercontent.com/nghyane/mcz/main/install.sh | sh

# Pack images into one file
mcz pack ./product-photos -o gallery.mcz -q 80

# Inspect the result
mcz info gallery.mcz
# Pages: 24
# Total: 3.2 MB
# Index: 392 bytes
```

Host the `.mcz` file on any static hosting (S3, R2, Cloudflare, Vercel). No special server configuration needed — it's just a static file.

---

## Frequently Asked Questions

### Does this require special server support?

No. MCZ files are static assets. Any server that supports Range requests (basically all of them) works. No middleware, no runtime dependencies.

### What image formats are supported?

WebP, JPEG, and JPEG XL. Images pass through as-is — no re-encoding, no quality loss.

### Can I use this with React/Vue/Svelte?

Yes. The MCZ SDK is framework-agnostic — it returns Blobs that you convert to object URLs. Works with any rendering approach.

### How big is the JavaScript SDK?

Under 3 KB gzipped. Zero dependencies.
