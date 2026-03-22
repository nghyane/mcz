---
title: "What I Learned Building a Manga Reader That Loads Instantly"
description: "The architecture behind a fast web manga reader — streaming, priority queues, IntersectionObserver, and the mistakes I made along the way."
date: "2026-03-12"
tags: ["manga", "architecture", "performance"]
---

<aside class="tldr">

<span class="label">Key Takeaway</span> A fast manga reader needs three things: instant layout (know dimensions before loading images), smart prioritization (load what's visible first), and progressive streaming (fill in the rest without interrupting reading). Here's how I built each layer.

</aside>

My first manga reader was simple — 20 `<img>` tags, lazy loading, done. It worked, technically. But "works" and "feels instant" are very different things. Readers complained about blank pages while scrolling, layout jumping, and images loading in random order.

I spent months rebuilding it. Here's what actually matters.

## Why can't you just use lazy loading?

I thought `loading="lazy"` would solve everything. It doesn't, for three reasons:

1. **No layout reservation**: The browser doesn't know image dimensions until loading starts, so it can't reserve space. Every image causes layout shift.
2. **Reactive, not predictive**: Lazy loading starts when an element enters the viewport. But scrolling is fast — by the time loading starts, the user is already looking at a blank space.
3. **No priority control**: You can't tell the browser "load this page before that one." It loads whatever enters the viewport first, regardless of reading direction.

Lazy loading is designed for marketing pages with a few images scattered between text. For a page that IS images, you need a different architecture.

## What's the three-layer loading model?

After several iterations, I landed on a pattern that works consistently:

### Layer 1: Layout (instant, before any image loads)

Fetch the MCZ index — one Range request, ~50ms. Create placeholder `<div>` elements with the correct `aspect-ratio` for every page. The reader now has its full layout. Zero CLS.

```javascript
const mcz = await MCZ.open(url);
mcz.pages.forEach(page => {
  const el = document.createElement('div');
  el.style.aspectRatio = `${page.width} / ${page.height}`;
  container.appendChild(el);
});
```

### Layer 2: Visible + nearby (high priority)

Load the pages the reader can actually see, plus 2-3 pages ahead as a scroll buffer. I use an IntersectionObserver with a generous root margin:

```javascript
const observer = new IntersectionObserver(
  entries => entries.forEach(e => {
    if (e.isIntersecting) loadPage(e.target.dataset.index, 'high');
  }),
  { rootMargin: '200% 0px' }
);
```

`200%` means pages start loading when they're within 2 viewport heights. On a phone, that's typically 3-4 pages of buffer — enough that scrolling at normal speed never hits a blank page.

### Layer 3: Background (low priority stream)

Stream the entire file in the background. Pages near the viewport get priority; the rest fill in whenever bandwidth is available:

```javascript
for await (const { index, blob } of mcz.stream()) {
  const priority = isVisible(index) || index < 4;
  enqueue(index, blob, priority);
}
```

## Why do you need an image loading queue?

This was a mistake I made early on. I was calling `URL.createObjectURL()` and setting `img.src` for every page as soon as it arrived from the stream. The result: the browser tried to decode 20 images simultaneously, causing scroll jank on mobile.

The fix is a simple priority queue with limited concurrency:

```javascript
const MAX = 3;
let active = 0;
const queue = [];

function drain() {
  while (active < MAX && queue.length) {
    active++;
    const { page, url } = queue.shift();
    const img = new Image();
    img.src = url;
    img.decode()
      .then(() => { page.src = url; page.loaded = true; })
      .finally(() => { active--; drain(); });
  }
}
```

`Image.decode()` is the key — it ensures the image is fully decoded in a background thread before being displayed. No decode jank during scroll.

## How do you handle memory on mobile?

A 20-page chapter uses 50-100 MB of decoded image memory. On mid-range phones, that's enough to trigger the browser's tab killer.

I learned this the hard way when users reported the reader "randomly refreshing" on older Android devices. The fix:

```javascript
function releaseDistantPages(currentPage) {
  pages.forEach((page, i) => {
    if (Math.abs(i - currentPage) > 5 && page.objectUrl) {
      URL.revokeObjectURL(page.objectUrl);
      page.element.src = '';
      page.objectUrl = null;
    }
  });
}
```

Keep ~10 pages in memory (5 before, 5 after current). Revoke everything else. If the user scrolls back to a released page, the shimmer animation shows briefly while it re-loads from the stream or cache.

## What's the single biggest optimization?

Preloading the next chapter's index. While the reader is on chapter 5, silently fetch chapter 6's index:

```javascript
const nextMcz = MCZ.open(nextChapterUrl); // starts immediately

// When user finishes chapter 5:
const mcz = await nextMcz; // already resolved
// Layout appears instantly, streaming begins
```

This one change eliminated the "loading" screen between chapters. Users reported it felt "like a native app." That's the goal.

## What would I do differently?

Looking back at the mistakes:

- **Started with lazy loading** instead of a proper loading architecture. Wasted two weeks.
- **Didn't limit concurrent decodes** initially. Caused visible scroll jank on mobile.
- **Forgot about memory management** until users reported crashes.
- **Didn't preload next chapter** until v3 of the reader.

The architecture I have now — MCZ index for instant layout, priority queue for smart loading, background streaming for the rest — handles everything I've thrown at it. 30-page chapters, 60-panel webtoons, slow 3G connections. It all works.

---

## Frequently Asked Questions

### Does this work with vertical (webtoon) and paginated (manga) reading modes?

Yes. The three-layer model works for both. For vertical scroll, pages stack naturally. For paginated, you show one page at a time but still pre-load adjacent pages. The priority queue handles both modes — just adjust what counts as "visible."

### How do you handle double-page spreads?

MCZ stores each image as a separate page. A double-page spread is just a page with a wider aspect ratio (e.g., 1600×1200 instead of 800×1200). The reader detects the landscape ratio and displays it full-width. No special format support needed.

### What about offline reading?

Since MCZ is a single file per chapter, Service Worker caching is straightforward — one URL per chapter, easy to cache and evict. I cache the 5 most recently read chapters and evict oldest-first when storage gets tight.

### What framework did you use?

The MCZ playground uses Vue 3 with Astro for SSR. But the loading architecture is framework-agnostic — it's just fetch, IntersectionObserver, and DOM manipulation. You could use it with React, Svelte, vanilla JS, or anything else.
