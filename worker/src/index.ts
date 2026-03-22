interface Env {
  BUCKET: R2Bucket;
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range",
  "Access-Control-Expose-Headers": "Content-Length, Content-Range, Accept-Ranges",
};

const CACHE_TTL = 60 * 60 * 24 * 365; // 1 year

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 });
    }

    const key = new URL(req.url).pathname.slice(1);
    if (!key) return new Response("Not found", { status: 404 });

    // Check edge cache first
    const cache = caches.default;
    const cacheKey = new Request(req.url, req);
    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    // Range support
    const range = req.headers.get("Range");
    const obj = await env.BUCKET.get(key, {
      range: range ? parseRange(range) : undefined,
    });

    if (!obj) return new Response("Not found", { status: 404 });

    const status = range ? 206 : 200;
    const headers = new Headers({
      ...CORS,
      "Content-Type": obj.httpMetadata?.contentType || "application/octet-stream",
      "Accept-Ranges": "bytes",
      "Cache-Control": `public, max-age=${CACHE_TTL}, immutable`,
      "ETag": obj.httpEtag,
    });

    if (obj.size !== undefined) {
      headers.set("Content-Length", String(range ? (obj as R2ObjectBody).body ? getBodySize(obj, range) : obj.size : obj.size));
    }

    if (range && obj.range) {
      const r = obj.range as { offset: number; length: number };
      headers.set("Content-Range", `bytes ${r.offset}-${r.offset + r.length - 1}/${obj.size}`);
      headers.set("Content-Length", String(r.length));
    }

    const response = new Response(req.method === "HEAD" ? null : (obj as R2ObjectBody).body, {
      status,
      headers,
    });

    // Cache full (non-range) responses at edge
    if (!range) {
      req.method === "GET" && cache.put(cacheKey, response.clone());
    }

    return response;
  },
};

function parseRange(header: string): R2Range | undefined {
  const m = header.match(/bytes=(\d+)-(\d*)/);
  if (!m) return undefined;
  const offset = parseInt(m[1]);
  if (m[2]) {
    return { offset, length: parseInt(m[2]) - offset + 1 };
  }
  return { offset };
}

function getBodySize(obj: R2Object, range: string | null): number {
  if (obj.range) {
    const r = obj.range as { offset: number; length: number };
    return r.length;
  }
  return obj.size;
}
