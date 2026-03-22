---
title: "How I Use HTTP Range Requests to Stream Images in a Single Connection"
description: "Range requests let browsers fetch exactly the bytes they need. Here's how MCZ uses them to stream images progressively with zero wasted bandwidth."
date: "2026-03-20"
tags: ["http", "streaming", "performance"]
---

<aside class="tldr">

<span class="label">Key Takeaway</span> Instead of firing 20+ HTTP requests for a manga chapter, MCZ uses one Range request for the index (328 bytes) and one streaming request for all images. The result: instant layout, progressive rendering, and better throughput on every network.

</aside>

I used to think HTTP/2 multiplexing solved the "too many requests" problem. Then I built a manga reader that loaded 30 images per chapter, and watched it struggle on real 3G connections. That's when I discovered Range requests — and realized one smart connection beats thirty parallel ones.

## Why do 30 parallel image requests still feel slow?

When a browser encounters 30 `<img>` tags, it opens multiple connections and starts downloading in parallel. Sounds efficient, right?

In practice, it's not:

- **Connection overhead**: Each request carries HTTP headers. For 30 requests, that's ~60 KB of headers alone — more than the MCZ index for a 3,700-page archive.
- **Bandwidth splitting**: Your 10 Mbps connection gets split across 6 streams (HTTP/1.1 limit). Each image downloads at ~1.7 Mbps instead of 10.
- **Unpredictable order**: Images load in whatever order the network delivers them. Readers see random pages appear while the one they're looking at is still loading.
- **No layout information**: The browser doesn't know image dimensions until each file starts downloading. Every load causes layout shift.

I measured this on a 20-page chapter (4.2 MB total) over simulated 4G. The last image didn't finish until 3.8 seconds. The first page appeared after 400ms, but the layout shifted 12 times during loading.

## What are HTTP Range requests, and why should you care?

Range requests let you ask a server for specific bytes of a file:

```
GET /chapter.mcz HTTP/1.1
Range: bytes=0-327
```

The server responds with `206 Partial Content` and only those 328 bytes. This is the same mechanism behind video seeking, download resumption, and PDF page loading.

The key insight: **if your file format puts the index first, one tiny Range request gives you everything you need to build the layout.**

## How does MCZ use Range requests in practice?

The flow has two steps. That's it.

**Step 1: Fetch the index (one Range request, ~50ms)**

```javascript
const mcz = await MCZ.open(url);
// Sends: Range: bytes=0-4103
// Gets: header + index for up to 256 pages
```

From 328 bytes, I now know every page's width, height, byte offset, size, and format. The reader creates placeholder boxes instantly — zero CLS, even before a single pixel has loaded.

**Step 2: Stream everything (one request, progressive)**

```javascript
for await (const { index, blob } of mcz.stream()) {
  images[index].src = URL.createObjectURL(blob);
}
```

One `GET` for the full file. As bytes arrive, MCZ checks whether any page is complete and yields it immediately. Pages fill in progressively — the user sees content appearing smoothly instead of staring at a loading spinner.

## How does this compare to the traditional approach?

I ran both approaches on the same 20-page chapter:

| Metric | 20 × Individual requests | MCZ (Range + Stream) |
|--------|--------------------------|---------------------|
| HTTP requests | 20 | 2 |
| Header overhead | ~40 KB | ~1 KB |
| Time to layout | 1.2s | 50ms |
| Time to first image | 400ms | 250ms |
| Layout shifts | 12 | 0 |
| Connection utilization | Split across 6 | 1 saturated pipe |

The single-connection approach actually achieves **better throughput** because it saturates the available bandwidth instead of splitting it. On slow connections, the difference is dramatic.

## Does every server support Range requests?

Yes — practically every server and CDN you'd use in production:

- **Nginx**: Supports ranges by default for static files
- **Cloudflare / AWS CloudFront**: Full range support on all plans
- **S3 / R2 / GCS**: Native support
- **Vercel / Netlify**: Works for static assets
- **Apache**: Enabled via `mod_headers`

If the server returns `Accept-Ranges: bytes` in its headers (most do), you're good. MCZ files are static assets — no special server configuration needed.

## Why not just use HTTP/2 Server Push or HTTP/3?

I tried both. Here's what I found:

**HTTP/2 Server Push** was supposed to solve this — the server proactively sends resources before the client asks. In practice, Chrome removed it in 2022 because it was rarely implemented correctly and often wasted bandwidth by pushing resources the client already had cached.

**HTTP/3 with QUIC** does eliminate head-of-line blocking, which helps multiplexing. But it doesn't reduce the fundamental overhead of many small requests. Each request still needs headers, each response requires the server to locate and read a separate file. MCZ's single-file approach means one file open, one sequential read, optimal OS readahead.

Range requests are simpler, universally supported, and give the client full control. No server-side guessing needed.

## What about random access — can I fetch just one page?

Absolutely. That's one of MCZ's strengths. Since the index contains every page's byte offset and size, fetching a single page is one Range request:

```javascript
const blob = await mcz.blob(5);
// Sends: Range: bytes=128400-339271
// Gets: exactly page 5's image data
```

This is perfect for paginated readers where users jump to specific pages, or for thumbnail previews where you only need the first page.

---

## Frequently Asked Questions

### Do Range requests work with CORS?

Yes, but your server must include `Accept-Ranges: bytes` and `Access-Control-Expose-Headers: Content-Range` in CORS responses. Most CDNs handle this automatically.

### What happens if the server doesn't support Range requests?

MCZ falls back gracefully — `MCZ.open()` fetches the whole file instead of just the index. The streaming still works, you just lose the "instant layout" benefit on the initial request.

### Is streaming faster than parallel downloads for small files?

For very small files (under 100 KB total), parallel downloads can be faster because you avoid the serial nature of streaming. But for manga chapters (typically 2-10 MB), streaming wins because of reduced overhead and better bandwidth utilization.

### Can I use Range requests with a CDN cache?

Yes. CDNs like Cloudflare cache the full file and serve Range requests from cache. The origin server only sees one request for the full file; subsequent Range requests are served from the CDN edge.
