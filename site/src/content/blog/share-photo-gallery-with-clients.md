---
title: "How to Share a Photo Gallery With Clients Without Losing Quality"
description: "Sending 50 photos via email or WeTransfer compresses them. Here's how to deliver full-quality galleries that clients can preview instantly and download as ZIP."
date: "2026-03-23"
tags: ["photography", "sharing", "tutorial"]
---

<aside class="tldr">

<span class="label">Key Takeaway</span> Bundle your photos into a single MCZ file, host it anywhere, and send the link. Clients see a streaming preview instantly — no app install, no account, no compression. They download the full set as ZIP when ready.

</aside>

You just finished a shoot. 200 photos, culled down to 50 selects. Now you need to get them to your client for review.

The options aren't great. Email caps out at 25 MB. WeTransfer compresses your files. Google Drive makes clients click through one image at a time. Dropbox links show tiny thumbnails. None of them let clients see the full gallery streaming in real time.

I ran into this problem enough times that I started looking for something better.

## What's wrong with the current tools?

### Email attachments

Most email providers limit attachments to 25 MB. A single full-resolution JPEG from a modern camera is 8-15 MB. You can send maybe 2-3 photos per email. For a 50-photo gallery, that's 20+ emails.

### WeTransfer / Smash

Great for sending large files, but there's no preview. The client downloads a ZIP, extracts it, and browses locally. No streaming, no web preview. And free plans expire links after 7 days.

### Google Drive / Dropbox

File-by-file browsing. Clients see one image at a time or tiny thumbnails. No progressive loading, no full-gallery streaming experience. And you're trusting a third party with your client's photos.

### Pixieset / Pic-Time

Purpose-built for photographers, but they cost $8-20/month. They also re-encode your images for web delivery, which means subtle quality loss on high-end work.

## How MCZ solves this

The workflow is simple:

1. **Drop your selects into the MCZ Creator** — photos pass through as-is, no re-encoding
2. **Host the .mcz file** — on your own server, S3, Cloudflare R2, or any static hosting
3. **Send the link** — clients open it in the MCZ Viewer, photos stream in instantly
4. **Client downloads as ZIP** — one click, all original-quality files

No account needed. No app install. No file size limit. No quality loss.

## What does the client experience look like?

When your client opens the link:

1. **Instant**: The gallery layout appears in under 100ms — correctly sized placeholders for every photo
2. **Progressive**: Photos fill in one by one as data streams, starting from the top
3. **Smooth**: No page jumping, no loading spinners, no waiting for the full download
4. **Download**: A "↓ ZIP" button exports all photos in original quality

On a typical 4G connection, a 50-photo gallery (150 MB total) starts showing images within 500ms and finishes streaming in about 30 seconds. The client can start reviewing immediately — they don't wait for the full download.

## How does quality compare?

| Service | Re-encodes? | Client gets original? |
|---------|------------|----------------------|
| Email | Depends on client | Usually yes |
| WeTransfer | No | Yes (after download) |
| Google Drive | No | Yes (one at a time) |
| Pixieset | Yes (web view) | Depends on plan |
| **MCZ** | **No** | **Yes — streaming + ZIP** |

MCZ stores your WebP, JPEG, or JXL files byte-for-byte. What you put in is exactly what the client sees and downloads. No server-side processing, no re-encoding, no thumbnail generation.

## What does it cost?

The MCZ Creator, Viewer, and Inspector are free and open source. They run entirely in the browser — no account, no limits.

For hosting, you have options:

- **Self-host**: Upload the .mcz file to your existing website or S3 bucket. Cost: whatever you're already paying for hosting.
- **MCZ Cloud** (coming soon): Upload directly from the Creator, get a share link. Starting at $3/month for 10 GB.

A 50-photo gallery is typically 100-200 MB as an MCZ file. 10 GB of storage holds 50-100 galleries.

---

## Frequently Asked Questions

### Can clients download individual photos?

Currently, clients can download all photos as a ZIP. Individual photo download is on the roadmap.

### What formats are supported?

WebP, JPEG, and JPEG XL. Most cameras shoot JPEG. If you export from Lightroom as WebP, you get 30% smaller files with identical visual quality.

### Do I need a website to use this?

No. You can use any file hosting — even a free Cloudflare R2 bucket (10 GB free tier). Upload the .mcz file, share the URL.

### Is there a file size limit?

The MCZ format supports files up to 4 GB. In practice, a 200-photo gallery in high-quality JPEG is about 500 MB — well within limits.
