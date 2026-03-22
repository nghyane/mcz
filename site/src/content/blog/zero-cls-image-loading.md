---
title: "How I Achieved Zero CLS on a Page With 30 Images"
description: "Layout shift ruins the reading experience. Here's the exact technique I use to get CLS 0.000 on image-heavy pages — no JavaScript required for the layout."
date: "2026-03-15"
tags: ["performance", "cls", "web-vitals"]
---

<aside class="tldr">

<span class="label">Key Takeaway</span> CLS happens because the browser doesn't know image dimensions before loading. MCZ solves this by putting every page's width and height in the first 400 bytes of the file. One tiny request → all dimensions → perfect placeholders → zero layout shift.

</aside>

You're reading a manga chapter. You scroll down, start reading a panel, and the page jumps. An image above finished loading and pushed everything down. You lose your place, scroll back up, and it happens again.

I hated this so much that I redesigned an entire file format to fix it.

## Why does CLS happen on image-heavy pages?

When a browser encounters an `<img>` tag without `width` and `height`, it allocates zero space. As the image downloads and the browser discovers the actual dimensions, it expands the element — pushing everything below it down.

For a page with 30 images, that's potentially 30 layout shifts. Google measures this as Cumulative Layout Shift (CLS), and anything above 0.1 is considered poor. I've measured manga readers with CLS scores above 2.0. That's catastrophic.

The fix sounds simple: just add width and height to every image. But where do you get those dimensions?

## What are the common approaches, and why did they fall short?

### Hardcoded aspect ratio

```css
.page { aspect-ratio: 2 / 3; }
```

This works if every page has the same dimensions. Manga pages don't — covers are wider, double-page spreads are landscape, some pages are taller than others. A single hardcoded ratio means some pages get letterboxed or pillarboxed.

### API-provided dimensions

```javascript
const chapter = await fetch('/api/chapter/1');
// Response includes: [{ url, width, height }, ...]
```

This requires a separate API call, a database storing dimensions, and logic to keep them in sync with the actual images. It works, but it adds a dependency and a round trip before you can render anything.

### Read dimensions from image headers

You could fetch the first few bytes of each image to read its dimensions from the file header (JPEG SOF marker, PNG IHDR, etc.). But that's one Range request per image — 30 requests for 30 images. You're back to the multiple-request problem.

## How does MCZ solve this differently?

The insight is simple: **embed dimensions in the container's index, not in each image.**

MCZ's index is at byte 0. Each entry contains `width` and `height` alongside `offset`, `size`, and `format`. For a 20-page chapter, the entire index is 328 bytes.

```javascript
const mcz = await MCZ.open(url);
// 50ms later: all 20 pages' dimensions available

mcz.pages.forEach(page => {
  const div = document.createElement('div');
  div.style.aspectRatio = `${page.width} / ${page.height}`;
  container.appendChild(div);
});
// CLS = 0.000 — every space reserved before any image loads
```

One request. 328 bytes. Every dimension. No API, no database, no per-image requests.

## Can you actually measure the difference?

I compared three approaches on the same 20-page chapter using Lighthouse:

| Approach | CLS Score | Time to Layout | Requests Before Layout |
|----------|-----------|----------------|----------------------|
| No dimensions | 1.84 | 3.2s (after all load) | 20 |
| API dimensions | 0.000 | 380ms | 1 API + 20 images |
| MCZ index | 0.000 | 52ms | 1 Range request |

Both the API and MCZ approaches achieve zero CLS. But MCZ is 7x faster to layout because it doesn't need a separate API call — the dimensions come from the file itself.

## What mistakes should you avoid?

I made all of these before getting it right:

### Lazy loading without dimensions

```html
<!-- This still causes CLS! -->
<img loading="lazy" src="page-5.webp">
```

`loading="lazy"` defers the network request, but the browser still doesn't know the image's size. When it scrolls into view and loads — CLS.

### JavaScript-inserted images without placeholders

```javascript
// Each insertion shifts content below
data.pages.forEach(url => {
  const img = document.createElement('img');
  img.src = url;
  container.appendChild(img);
});
```

Always create correctly-sized placeholders first, then set `src` to fill them in.

### Using max-width without aspect-ratio

```css
img { max-width: 100%; height: auto; }
```

This prevents overflow but doesn't help with vertical space reservation. The browser still doesn't know the height until the image loads.

## Does this work for webtoons and long strips too?

Yes, and it's arguably more important. Webtoon episodes can have 50+ panels in a single long strip. Without dimensions, the scroll position jumps wildly as panels load above the viewport.

With MCZ, even a 50-panel episode gets its full layout in a single 808-byte request (8-byte header + 50 × 16-byte entries). The reader can scroll smoothly from the start — panels fill in progressively without any position shifts.

---

## Frequently Asked Questions

### Does CSS aspect-ratio work in all browsers?

Yes, as of 2024. `aspect-ratio` is supported in Chrome 88+, Firefox 89+, Safari 15+, and Edge 88+. That covers 97%+ of global browser usage. For the rare older browser, the image simply loads without a placeholder — no crash, just a small layout shift.

### What if I don't know dimensions at build time?

That's exactly the problem MCZ solves. The dimensions are embedded in the MCZ file itself, so you don't need to know them at build time, store them in a database, or compute them from image headers. The MCZ index gives you everything at runtime in one request.

### Can I use this technique with regular images (not MCZ)?

Yes — the principle is the same. If you can get dimensions before rendering (via HTML attributes, CSS, or an API), you can achieve zero CLS. MCZ just makes it easier by bundling dimensions with the images.

### What CLS score should I aim for?

Google's thresholds: Good (< 0.1), Needs improvement (0.1 - 0.25), Poor (> 0.25). With MCZ, I consistently measure 0.000 — literally zero shift. That's the target.
