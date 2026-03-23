<template>
  <div>
  <!-- Toolbar -->
  <div class="mx-auto max-w-3xl flex items-center gap-2.5 px-6 py-3">
    <div class="flex-1 relative flex items-center min-w-0">
      <span class="absolute left-2.5 text-fg3 pointer-events-none flex">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
      </span>
      <input
        v-model="url"
        @keydown.enter="run(url)"
        class="w-full h-9 pl-8 pr-9 font-mono text-xs leading-9 bg-bg-sub border border-border rounded-lg text-fg outline-none transition-[border] focus:border-fg"
        placeholder=".mcz URL"
      >
      <span class="absolute right-[3px] flex">
        <label for="fp" class="w-7 h-7 flex items-center justify-center rounded-md text-fg3 cursor-pointer transition-all hover:text-fg hover:bg-bg-sub">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        </label>
      </span>
      <input id="fp" type="file" accept=".mcz" @change="handleFile" hidden>
    </div>
    <button
      @click="run(url)"
      class="h-9 px-3.5 font-semibold text-xs leading-9 bg-fg text-white border-none rounded-lg cursor-pointer flex items-center gap-[5px] shrink-0 transition-colors hover:bg-[#222]"
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      <span class="max-[640px]:hidden">Stream</span>
    </button>
  </div>

  <!-- Stats -->
  <div v-if="pages.length" class="mx-auto max-w-3xl flex items-center gap-1.5 px-6 py-1.5 font-mono text-[11px] text-fg3">
    <b class="text-fg2 font-medium">{{ pages.length }}</b> pages
    <span class="text-border">·</span>
    {{ formatsSummary }}
    <span class="text-border">·</span>
    <b class="text-fg2 font-medium">{{ totalMB }}</b> MB
    <span v-if="canExport" class="text-border">·</span>
    <button
      v-if="canExport"
      @click="exportZip"
      :disabled="exporting"
      class="h-5 px-2 text-[10px] font-medium bg-bg-sub text-fg3 border border-border rounded cursor-pointer transition-colors hover:text-fg hover:bg-border disabled:opacity-50"
    >{{ exporting ? '...' : '↓ ZIP' }}</button>
    <span
      v-if="streaming"
      class="ml-auto inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-mono text-[10px] font-medium text-accent"
      :style="{ background: `linear-gradient(90deg,rgba(37,99,235,.1) ${dlPct}%,rgba(37,99,235,.04) ${dlPct}%)` }"
    >
      <svg class="animate-spin" width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
      {{ loaded }}/{{ pages.length }}
    </span>
    <span v-else class="ml-auto inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-mono text-[10px] font-medium text-success bg-success/6">
      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      {{ loaded }}/{{ pages.length }}
    </span>
  </div>

  <!-- Error -->
  <div v-if="error" class="mx-auto max-w-3xl px-6">
    <div class="flex items-center gap-2 p-2 px-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
      <svg class="shrink-0 text-red-600" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <span class="flex-1">{{ error }}</span>
      <button @click="error = ''" class="bg-transparent border-none text-fg3 cursor-pointer p-0.5 flex">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  </div>

  <!-- Reader -->
  <div v-if="pages.length" class="mx-auto max-w-3xl mt-2 px-6 pb-15">
    <div class="border border-border rounded-[10px] overflow-hidden">
      <div
        v-for="(p, i) in pages"
        :key="i"
        :data-idx="i"
        class="pg w-full relative bg-bg-sub overflow-hidden"
        :class="{ ok: p.done }"
        :style="{ aspectRatio: p.width + '/' + p.height }"
      >
        <div v-if="!p.done" class="absolute inset-0 bg-[linear-gradient(90deg,transparent,rgba(0,0,0,.015),transparent)] animate-shimmer"></div>
        <div class="ph absolute inset-0 flex items-center justify-center font-mono text-[10px] text-[#ddd] select-none transition-opacity duration-300">
          {{ p.width }}×{{ p.height }}
        </div>
        <img
          v-if="p.src"
          :src="p.src"
          class="absolute inset-0 w-full h-full object-contain opacity-0 transition-opacity duration-300"
        >
      </div>
    </div>
  </div>

  <!-- Empty -->
  <div v-if="!pages.length && !loading" class="mx-auto max-w-3xl px-6 py-20 text-center">
    <p class="text-fg3 text-[13px] leading-relaxed">Paste a .mcz URL and click Stream, or drop a file.</p>
  </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted, nextTick } from 'vue';
import { MCZ } from '../lib/mcz';
import { createZip } from '../lib/zip';

const EXT: Record<string, string> = { webp: 'webp', jpeg: 'jpg', jxl: 'jxl' };
const MAX_CONCURRENT = 3;

// ── State ──
const url = ref('/demo.mcz');
const pages = ref<any[]>([]);
const loading = ref(false);
const streaming = ref(false);
const dlPct = ref(0);
const loaded = ref(0);
const error = ref('');
const exporting = ref(false);
const sourceName = ref('output');

// ── Blob store (for ZIP export) ──
const blobs = new Map<number, Blob>();

// ── Image decode queue ──
let objectUrls: string[] = [];
const decodeQueue: { pg: any; url: string }[] = [];
let decodeActive = 0;

// ── Computed ──
const totalMB = computed(() =>
  (pages.value.reduce((s, p) => s + p.size, 0) / 1048576).toFixed(1)
);
const formatsSummary = computed(() => {
  const m: Record<string, number> = {};
  pages.value.forEach(p => { m[p.format] = (m[p.format] || 0) + 1; });
  return Object.entries(m).map(([k, v]) => `${v} ${k}`).join(' · ') || '—';
});
const canExport = computed(() => !streaming.value && loaded.value === pages.value.length && loaded.value > 0);

// ── Visibility tracking ──
let visibleSet = new Set<number>();
let observer: IntersectionObserver | null = null;

function setupObserver() {
  observer?.disconnect();
  observer = new IntersectionObserver(
    entries => entries.forEach(e => {
      const i = +(e.target as HTMLElement).dataset.idx!;
      e.isIntersecting ? visibleSet.add(i) : visibleSet.delete(i);
    }),
    { rootMargin: '200% 0px' }
  );
  document.querySelectorAll('.pg').forEach(el => observer!.observe(el));
}

// ── Decode queue ──
function drainQueue() {
  while (decodeActive < MAX_CONCURRENT && decodeQueue.length) {
    decodeActive++;
    const { pg, url } = decodeQueue.shift()!;
    const img = new Image();
    img.src = url;
    img.decode()
      .then(() => { pg.src = url; pg.done = true; })
      .catch(() => { pg.src = url; pg.done = true; })
      .finally(() => { decodeActive--; drainQueue(); });
  }
}

function enqueueImage(pg: any, blob: Blob, priority: boolean) {
  const u = URL.createObjectURL(blob);
  objectUrls.push(u);
  priority ? decodeQueue.unshift({ pg, url: u }) : decodeQueue.push({ pg, url: u });
  drainQueue();
}

// ── Cleanup ──
function cleanup() {
  objectUrls.forEach(u => URL.revokeObjectURL(u));
  objectUrls = [];
  decodeQueue.length = 0;
  decodeActive = 0;
  visibleSet.clear();
  observer?.disconnect();
  blobs.clear();
}

// ── Name extraction ──
function extractName(src: string | File): string {
  const raw = typeof src === 'string'
    ? src.split('/').pop() || 'output'
    : src.name;
  return raw.replace(/\.mcz$/i, '');
}

// ── Core: run ──
async function run(src: string | ArrayBuffer) {
  cleanup();
  error.value = '';
  pages.value = [];
  loaded.value = 0;
  loading.value = true;
  streaming.value = true;
  dlPct.value = 0;

  if (typeof src === 'string') {
    history.replaceState(null, '', '#' + encodeURIComponent(src));
    sourceName.value = extractName(src);
  }

  try {
    const mcz = src instanceof ArrayBuffer ? MCZ.from(src) : await MCZ.open(src);
    pages.value = mcz.pages.map(p => reactive({ ...p, src: null as string | null, done: false }));
    await nextTick();
    setupObserver();

    if (src instanceof ArrayBuffer) {
      streaming.value = false;
      dlPct.value = 100;
      for (const p of mcz.pages) {
        const blob = await mcz.blob(p.index);
        blobs.set(p.index, blob);
        enqueueImage(pages.value[p.index], blob, p.index < 4);
        loaded.value++;
      }
    } else {
      for await (const { index: i, blob } of mcz.stream({
        onProgress: (r, t) => { if (t) dlPct.value = (r / t) * 100; }
      })) {
        blobs.set(i, blob);
        enqueueImage(pages.value[i], blob, visibleSet.has(i) || i < 4);
        loaded.value++;
      }
      streaming.value = false;
    }
  } catch (e: any) {
    error.value = e.message || 'Unknown error';
    streaming.value = false;
  } finally {
    loading.value = false;
  }
}

// ── Export ──
async function exportZip() {
  exporting.value = true;
  try {
    const files = await Promise.all(
      pages.value
        .filter(p => blobs.has(p.index))
        .map(async p => ({
          name: `${String(p.index).padStart(3, '0')}.${EXT[p.format] || 'bin'}`,
          data: new Uint8Array(await blobs.get(p.index)!.arrayBuffer()),
        }))
    );
    const zip = createZip(files);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(zip);
    a.download = `${sourceName.value}.zip`;
    a.click();
    URL.revokeObjectURL(a.href);
  } finally {
    exporting.value = false;
  }
}

// ── File input ──
function handleFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  sourceName.value = extractName(f);
  f.arrayBuffer().then(b => run(b));
}

// ── Init ──
onMounted(() => {
  document.body.addEventListener('dragover', e => e.preventDefault());
  document.body.addEventListener('drop', async e => {
    e.preventDefault();
    const f = e.dataTransfer?.files[0];
    if (!f?.name.endsWith('.mcz')) return;
    sourceName.value = extractName(f);
    run(await f.arrayBuffer());
  });
  const hash = location.hash.slice(1);
  if (hash) { url.value = decodeURIComponent(hash); run(url.value); }
});
</script>

<style>
.pg + .pg { border-top: 1px solid var(--color-border); }
.pg.ok img { opacity: 1; }
.pg.ok .ph { opacity: 0; pointer-events: none; }
</style>
