---
title: "How to Reduce Layout Shift on Pages With Many Images"
description: "CLS above 0.1 hurts rankings and UX. Here are practical techniques to eliminate layout shift on image galleries, portfolios, and product pages."
date: "2026-02-12"
tags: ["performance", "cls", "web-vitals"]
---

<aside class="tldr">

<span class="label">Key Takeaway</span> Layout shift happens because the browser doesn't know image dimensions before loading. Fix it by providing width/height upfront — via HTML attributes, CSS aspect-ratio, or a container format that embeds dimensions in its index.

</aside>

Google's Core Web Vitals treat CLS (Cumulative Layout Shift) as a ranking signal. Anything above 0.1 is "needs improvement." Above 0.25 is "poor." On pages with 10+ images — galleries, portfolios, e-commerce product grids — I've measured CLS scores above 2.0.

Here's every technique I've used to bring that to zero.

## Why do images cause layout shift?

When the browser encounters `<img src="photo.webp">` without width and height, it allocates zero vertical space. As the image downloads and dimensions are discovered, the element expands — pushing everything below it down.

For a page with 20 images, that's 20 potential shifts. Users lose their scroll position, buttons move, text jumps. It's the most common UX complaint on image-heavy sites.

## Technique 1: HTML width and height attributes

The simplest fix — tell the browser the dimensions upfront:

```html
<img src="photo.webp" width="800" height="600"
     style="width: 100%; height: auto;">
```

Modern browsers calculate the aspect ratio from these attributes and reserve the correct space before loading. Works everywhere, zero JavaScript.

**Limitation**: You need to know dimensions at build time or have them in your CMS/database.

## Technique 2: CSS aspect-ratio

More flexible for dynamic content:

```css
.gallery-item {
  width: 100%;
  aspect-ratio: 4 / 3;
}
```

You can set it dynamically per image if your API returns dimensions:

```javascript
images.forEach(img => {
  const el = document.createElement('div');
  el.style.aspectRatio = `${img.width} / ${img.height}`;
  gallery.appendChild(el);
});
```

**Limitation**: Still requires a separate source of dimensions — your API, database, or image processing pipeline.

## Technique 3: Container formats with embedded dimensions

This is where image containers shine. Instead of storing dimensions separately, embed them alongside the images.

MCZ's index contains every image's width and height in the first few hundred bytes:

```javascript
const mcz = await MCZ.open(url);
// 50ms: all 20 images' dimensions available

mcz.pages.forEach(page => {
  const div = document.createElement('div');
  div.style.aspectRatio = `${page.width} / ${page.height}`;
  container.appendChild(div);
});
// CLS = 0.000 — all spaces reserved instantly
```

No API call, no database query, no per-image header parsing. One request, all dimensions.

## Technique 4: Dominant color placeholders

While not a CLS fix (the placeholder already reserves space), showing a background color matching the image improves perceived performance:

```css
.gallery-item {
  background-color: #e8d5b7; /* dominant color */
  aspect-ratio: 4 / 3;
}
```

Tools like [sharp](https://sharp.pixelplumbing.com/) can extract dominant colors during build. For runtime, BlurHash encodes a blurred preview in ~30 bytes.

## Common mistakes

**Lazy loading without dimensions** — `loading="lazy"` defers the network request but doesn't reserve space. CLS still happens when the image scrolls into view and loads.

**Using max-width without aspect-ratio** — `max-width: 100%` prevents overflow but doesn't tell the browser the height. Space isn't reserved.

**JavaScript-inserted images without placeholders** — Dynamically adding `<img>` elements pushes content below. Always create sized containers first, then set `src`.

## Measuring CLS

Use Chrome DevTools → Performance tab → record while scrolling. Look for "Layout Shift" entries. Or run Lighthouse for a summary score.

Google's thresholds:
- **Good**: < 0.1
- **Needs improvement**: 0.1 – 0.25
- **Poor**: > 0.25

With proper dimension handling, image-heavy pages consistently hit **0.000**.

---

## Frequently Asked Questions

### Does CSS aspect-ratio work in all browsers?

Yes — Chrome 88+, Firefox 89+, Safari 15+, Edge 88+. Over 97% global coverage. For older browsers, the image loads normally with a minor layout shift.

### What if images have different aspect ratios?

Each image needs its own aspect ratio. HTML `width`/`height` attributes handle this automatically. For dynamic content, store per-image dimensions and set `aspect-ratio` individually.

### Does CLS affect SEO rankings?

Yes. CLS is one of Google's three Core Web Vitals (alongside LCP and INP). It directly influences search rankings, especially on mobile.

### Can I fix CLS on existing sites without redesigning?

Often yes. Adding `width` and `height` attributes to existing `<img>` tags is a non-breaking change that immediately improves CLS. No redesign needed.
