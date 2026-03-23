const HF_REPO = "nghyane/train-lama";
const CACHE_TTL = 60 * 60 * 24 * 365; // 1 year

export const onRequest: PagesFunction = async (ctx) => {
  const cache = caches.default;
  const cacheKey = new Request(ctx.request.url);

  // Cache hit = free, no function invocation cost
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const path = ctx.params.path;
  const file = Array.isArray(path) ? path.join("/") : path;
  const hfUrl = `https://huggingface.co/datasets/${HF_REPO}/resolve/main/${file}`;

  const res = await fetch(hfUrl, { redirect: "follow" });
  if (!res.ok) return new Response("Not found", { status: 404 });

  const response = new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("Content-Type") || "application/octet-stream",
      "Content-Length": res.headers.get("Content-Length") || "",
      "Cache-Control": `public, max-age=${CACHE_TTL}, immutable`,
      "Access-Control-Allow-Origin": "*",
    },
  });

  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};
