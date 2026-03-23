---
title: "How to Lazy Load Images Without Causing Layout Shift"
description: "loading='lazy' defers downloads but still causes CLS if you don't reserve space. Here are 4 ways to lazy load images with zero layout shift."
date: "2026-03-23"
tags: ["lazy-loading", "cls", "performance", "tutorial"]
---

<aside class="tldr">

<span class="label">Key Takeaway</span> Lazy loading (`loading="lazy"`) only defers the network request — it doesn't reserve space. You still need image dimensions upfront via HTML attributes, CSS `aspect-ratio`, or a container format's index to prevent layout shift.

</aside>

I added `loading="lazy"` to every image on a product page and thought I was done. Lighthouse still flagged CLS at 1.4. The images were lazy loading perfectly — and still causing layout shift every time they appeared.

Here's what I was missing and how I fixed it.

## Why does lazy loading still cause layout shift?

`loading="lazy"` tells the browser: "don't download this image until it's near the viewport." Great for bandwidth. But the browser still doesn't know the image's dimensions until it starts downloading.

So the sequence is:

1. Image element has zero height (no dimensions provided)
2. User scrolls down
3. Image enters the viewport trigger zone
4. Browser starts downloading
5. Browser discovers the image is 800×600
6. Element expands from 0 to 600px height
7. Everything below shifts down ← **CLS**

Lazy loading made the problem *worse* in some ways — instead of all shifts happening on page load, they happen unpredictably as users scroll.

## Fix 1: Add width and height attributes

The simplest solution. Works everywhere, no JavaScript needed:

```html
<img
  src="product-photo.webp"
  width="800"
  height="600"
  loading="lazy"
  alt="Product front view"
  style="width: 100%; height: auto;"
>
```

The browser reads `width` and `height` before loading, calculates the aspect ratio (4:3), and reserves the correct space. When the image eventually loads, it fills the reserved space — zero shift.

**When this works**: Static sites, CMS-generated pages, any case where you know dimensions at build time.

**When it doesn't**: Dynamic galleries where images come from an API without dimension data.

## Fix 2: CSS aspect-ratio on a wrapper

If you don't have exact dimensions but know the general ratio:

```html
<div style="aspect-ratio: 4/3;">
  <img src="photo.webp" loading="lazy" alt="..."
       style="width: 100%; height: 100%; object-fit: cover;">
</div>
```

For galleries with mixed ratios, set it per-image from your data:

```javascript
photos.forEach(photo => {
  const wrapper = document.createElement('div');
  wrapper.style.aspectRatio = `${photo.width} / ${photo.height}`;

  const img = document.createElement('img');
  img.src = photo.url;
  img.loading = 'lazy';

  wrapper.appendChild(img);
  gallery.appendChild(wrapper);
});
```

**When this works**: Any dynamic content where you have dimensions in your data model.

## Fix 3: Intersection Observer with a loading queue

For maximum control — especially when you want priority-based loading:

```javascript
const observer = new IntersectionObserver(
  entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target.querySelector('img');
        img.src = img.dataset.src;  // start loading
        observer.unobserve(entry.target);
      }
    });
  },
  { rootMargin: '200% 0px' }  // start 2 viewports early
);

// Wrappers already have correct aspect-ratio from data
document.querySelectorAll('.photo-wrapper').forEach(el => {
  observer.observe(el);
});
```

The `200%` rootMargin means images start loading when they're 2 viewport heights away — enough buffer that users never see a loading state during normal scrolling.

**When this works**: Complex apps where you need control over load order and timing.

## Fix 4: Container format with embedded dimensions

When your images come from a single source (a gallery, product photos, a document), a container format eliminates the dimension problem entirely.

MCZ embeds every image's width and height in its index — the first ~400 bytes of the file:

```javascript
const mcz = await MCZ.open('/gallery.mcz');

// All dimensions available in ~50ms
mcz.pages.forEach((page, i) => {
  const wrapper = document.createElement('div');
  wrapper.style.aspectRatio = `${page.width} / ${page.height}`;
  gallery.appendChild(wrapper);
});

// Stream images — they fill reserved spaces with zero shift
for await (const { index, blob } of mcz.stream()) {
  const url = URL.createObjectURL(blob);
  wrappers[index].querySelector('img').src = url;
}
```

No API call for dimensions. No per-image HEAD request. One Range request → all dimensions → perfect layout → progressive streaming.

**When this works**: Image sets that load together — galleries, product photo sets, multi-page documents.

## Which approach should you choose?

| Situation | Best approach |
|-----------|--------------|
| Static site, known images | Fix 1: HTML width/height |
| CMS with image metadata | Fix 2: CSS aspect-ratio |
| SPA with complex loading needs | Fix 3: IntersectionObserver |
| Multiple images from one source | Fix 4: Container format |
| Unknown dimensions, no API | Fallback: fixed aspect-ratio (e.g., 16:9) |

Most sites need Fix 1 or Fix 2. If you're building an image-heavy application with 10+ images loading together, Fix 4 saves the most complexity.

## Measuring your fix

Before and after, run Lighthouse or check Chrome DevTools → Performance:

```
Before: CLS 1.4 (20 images, no dimensions)
After:  CLS 0.0 (same images, width/height added)
```

Google considers CLS < 0.1 as "good." With any of the techniques above, you should hit 0.000 on image-heavy pages.

---

## Frequently Asked Questions

### Does `loading="lazy"` affect SEO?

No. Google's crawler renders JavaScript and handles lazy loading correctly. The `loading="lazy"` attribute is a standard that Googlebot understands. Just make sure the image URL is in the `src` (or `data-src` with proper JS loading).

### Should I lazy load above-the-fold images?

No. Images visible on initial load should use `loading="eager"` (the default) or `fetchpriority="high"`. Only lazy load images below the fold.

### What's the difference between `loading="lazy"` and IntersectionObserver?

`loading="lazy"` is browser-native, zero JavaScript, but gives you no control over timing or priority. IntersectionObserver lets you control rootMargin, load order, and concurrent downloads. Use native lazy loading for simple cases, IntersectionObserver for complex ones.

### Can I combine lazy loading with blur-up placeholders?

Yes. Set the wrapper's `background-image` to a tiny base64 thumbnail, use `aspect-ratio` for sizing, then replace with the full image on load. The blur-up transition makes loading feel smooth without affecting CLS.
