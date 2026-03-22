---
title: "WebP vs JPEG vs JPEG XL — Which Format Works Best for Manga?"
description: "I tested all three formats on the same manga chapter. Here's what I found about file size, quality, encoding speed, and browser support."
date: "2026-03-18"
tags: ["image-formats", "webp", "jpeg", "jxl", "comparison"]
---

<aside class="tldr">

<span class="label">Key Takeaway</span> For manga in 2026, WebP at quality 75-80 is the sweet spot — 30% smaller than JPEG with near-universal browser support. JPEG XL compresses 47% better but browser support is still limited. MCZ supports all three, so you can switch formats without changing your pipeline.

</aside>

I've spent way too many hours encoding the same manga chapter in different formats, squinting at screenshots to spot compression artifacts on screentones. Here's what I learned so you don't have to.

## Why does format choice matter more for manga?

A typical manga chapter has 15-30 pages. A webtoon episode can have 50+ panels. Multiply by hundreds of chapters, and format choice directly impacts your bandwidth bill and your readers' experience.

But manga art isn't like photographs. It has specific characteristics that affect compression differently:

- **High contrast** — sharp black lines on white backgrounds
- **Large flat areas** — solid fills, screentones, white gutters
- **Sharp text** — dialog in bubbles with clean edges
- **Mostly grayscale** — manga is black and white; webtoons use flat colors
- **High resolution** — typically 800-1600px wide

Formats optimized for photos don't always handle these well. Block artifacts on sharp lines are far more visible than on a blurred landscape.

## How did I test this?

I took one 20-page manga chapter and encoded it at **visually equivalent quality** across all three formats. "Visually equivalent" means I adjusted quality settings until I couldn't tell the difference at 100% zoom on a retina display.

| Format | Quality Setting | Avg Page Size | Total Chapter | Encoding Time |
|--------|----------------|--------------|---------------|---------------|
| JPEG | 82 | 245 KB | 4.9 MB | 0.8s |
| WebP | 77 | 168 KB | 3.4 MB | 2.1s |
| JXL | distance 1.5 | 132 KB | 2.6 MB | 5.3s |

WebP is **31% smaller** than JPEG. JXL is **47% smaller**. But encoding time increases significantly — JXL takes 6.6x longer than JPEG.

## Does grayscale change the results?

Dramatically. Since most manga is grayscale, I tested that separately:

| Format | Color Page | Grayscale Page | Grayscale Savings |
|--------|-----------|---------------|-------------------|
| JPEG 80 | 280 KB | 195 KB | 30% |
| WebP 75 | 185 KB | 120 KB | 35% |
| JXL d=1.5 | 145 KB | 88 KB | 39% |

JXL benefits the most from grayscale because its modeling of uniform regions is superior. A grayscale manga page in JXL is **55% smaller** than the same page in color JPEG.

## What about quality — can you actually see the difference?

At the settings I used, honestly no. All three formats produce visually indistinguishable results at normal reading zoom. The differences only appear when you zoom to 400%+ and look at specific areas:

- **JPEG 82**: Faint block artifacts around sharp lines, barely visible on screentones
- **WebP 77**: Cleaner edges than JPEG, slightly softer screentones
- **JXL d=1.5**: Cleanest overall, best preservation of fine line detail

For manga reading — scrolling at normal speed on a phone — none of these artifacts matter. Pick the format based on size and compatibility, not quality.

## What about browser support in 2026?

This is where it gets frustrating:

| Format | Global Support | Notes |
|--------|---------------|-------|
| JPEG | 100% | Works everywhere, always will |
| WebP | 97%+ | Missing only in very old browsers |
| JXL | ~20% | Safari 17+ only. Chrome removed it. Firefox behind flag. |

JXL has the best compression but the worst support. I keep hoping this changes, but Chrome's decision to drop JXL support in 2023 was a significant setback.

## So which format should I actually use?

After all this testing, my recommendations:

**Use WebP** for most manga projects. It's the best balance of size, quality, and support. Quality 75-80 produces clean results at 30%+ savings over JPEG.

**Use JPEG** if you need 100% compatibility or you're working with existing JPEG archives. MCZ stores images as-is, so existing JPEGs pass through without re-encoding — zero quality loss.

**Use JXL** if your audience is primarily Safari users, or if you can serve different formats based on browser support. The compression advantage is real, especially for grayscale manga.

**Don't use PNG** for web delivery. It's lossless, which is great for archival, but a PNG manga page is 500 KB - 2 MB. WebP lossy at quality 80 is visually identical at 5-10x smaller.

## Can I mix formats in one MCZ file?

Yes — this is one of MCZ's design decisions I'm most happy with. Each page's format is stored in the index, so you can have:

- WebP for most pages
- JPEG for a photographic cover
- JXL for devices that support it

The reader doesn't care — the browser handles decoding transparently. This means you can adopt new formats gradually without an all-or-nothing migration.

---

## Frequently Asked Questions

### Will Chrome ever re-add JPEG XL support?

I honestly don't know. Google has their own competing format interests (WebP, AVIF), and they cited insufficient "ecosystem interest" when removing JXL. The JXL community is pushing for it, but as of March 2026, there's no sign of Chrome adding it back.

### What about AVIF for manga?

AVIF compresses well but has two issues for manga: encoding is very slow (slower than JXL), and it has a maximum dimension limit that can be problematic for long webtoon strips. I haven't added AVIF to MCZ yet, but it's on the roadmap.

### What quality setting should I use for webtoons vs manga?

Webtoons can usually go 5-10 quality points lower than manga because the flat-color art style hides compression artifacts better. I use WebP 70-75 for webtoons and 75-80 for manga.

### Does MCZ re-encode my images?

Only if you ask it to. `mcz pack ./images -q 80` will re-encode to WebP. `mcz pack ./images --no-encode` passes images through as-is, preserving the original format and quality.
