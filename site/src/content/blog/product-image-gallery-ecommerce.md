---
title: "Faster Product Image Galleries for E-commerce Sites"
description: "Product pages with 15+ photos load slowly and shift layout. Here's how to bundle and stream product images for instant, smooth galleries."
date: "2026-03-18"
tags: ["e-commerce", "performance", "tutorial"]
---

<aside class="tldr">

<span class="label">Key Takeaway</span> Bundle all product photos into one MCZ file per product. The gallery loads with one HTTP request instead of 15+, layout is instant (no shift), and images stream progressively. Faster pages = higher conversion.

</aside>

A product page on a typical e-commerce site has 8-20 photos: front, back, sides, detail shots, lifestyle images, size charts. Each photo is a separate HTTP request. Each request carries overhead. And the browser doesn't know image dimensions until they start downloading, so the page jumps as photos load.

This matters more than you might think. Amazon found that every 100ms of additional load time costs 1% in sales. For image-heavy product pages, those milliseconds add up fast.

## The problem with individual image files

For a product with 15 photos:

- **15 HTTP requests** — each with headers, TLS negotiation, connection overhead
- **Unknown dimensions** — the gallery layout shifts as images load (CLS > 0.1)
- **Unpredictable order** — photo 12 might load before photo 1
- **Split bandwidth** — 15 streams sharing one connection, each getting a fraction

I measured a typical Shopify product page: 2.8 seconds to load all product images, CLS score of 0.34, 15 HTTP requests totaling 3.2 MB.

## How MCZ improves this

Same 15 photos, bundled as one MCZ file:

| Metric | 15 × Individual files | 1 × MCZ file |
|--------|----------------------|-------------|
| HTTP requests | 15 | 2 (index + stream) |
| Time to layout | 1.2s | 50ms |
| Time to first image | 400ms | 200ms |
| Layout shift (CLS) | 0.34 | 0.000 |
| Total load time | 2.8s | 1.9s |

The MCZ approach works because:

1. **One request for layout** — the 400-byte index gives you all 15 image dimensions instantly
2. **One stream for images** — single connection, fully saturated bandwidth, sequential delivery
3. **Zero layout shift** — placeholders have correct aspect ratios from the start

## How to integrate MCZ into a product page

```html
<div id="product-gallery"></div>

<script type="module">
  import { MCZ } from 'mcz';

  const mcz = await MCZ.open('/products/shoe-001.mcz');

  // Layout instantly
  const gallery = document.getElementById('product-gallery');
  mcz.pages.forEach(p => {
    const img = document.createElement('img');
    img.style.aspectRatio = `${p.width} / ${p.height}`;
    img.loading = 'lazy';
    gallery.appendChild(img);
  });

  // Stream images
  for await (const { index, blob } of mcz.stream()) {
    gallery.children[index].src = URL.createObjectURL(blob);
  }
</script>
```

## Creating MCZ files in your build pipeline

For e-commerce, you typically generate MCZ files during product upload or as part of your CI/CD:

```bash
# Per product: pack all photos into one MCZ
mcz pack ./products/shoe-001/ -o shoe-001.mcz -q 80

# Upload to your CDN
aws s3 cp shoe-001.mcz s3://product-images/shoe-001.mcz
```

Or use the browser-based Creator for one-off products — drag photos in, download the .mcz file.

## Does this work with existing image CDNs?

Yes. MCZ files are static assets. They work with any CDN that supports Range requests — which is all of them: Cloudflare, CloudFront, Fastly, Akamai, Vercel, Netlify.

No special middleware. No image processing server. Just upload and serve.

## When doesn't this make sense?

- **1-3 images per product**: The overhead of a container format isn't worth it. Use regular `<img>` with `width` and `height`.
- **Dynamically generated images**: If your CDN transforms images per-request (resize, crop, format conversion), individual files are better.
- **A/B testing images**: If you swap product photos frequently, individual files are easier to update than re-packing an MCZ.

The sweet spot is **5+ photos per product** that are served as a set.

---

## Frequently Asked Questions

### Does MCZ work with Shopify / WooCommerce / Magento?

MCZ is a JavaScript SDK — it works in any browser environment. You can integrate it into any e-commerce platform via custom theme code or a widget.

### How does this affect SEO?

Faster load times and zero CLS improve Core Web Vitals, which directly affects Google rankings. Images in MCZ files aren't individually crawlable by Google Images, so if image SEO matters, keep separate `<img>` tags for key photos.

### Can I lazy-load images within an MCZ file?

Yes. Use `MCZ.open()` to get dimensions, create placeholders, then use `mcz.blob(index)` to fetch individual images on scroll via IntersectionObserver.

### What's the SDK size?

Under 3 KB gzipped, zero dependencies.
