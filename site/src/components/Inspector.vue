<template>
  <div>
    <div class="mx-auto max-w-3xl px-6 py-6">
      <div class="flex items-center gap-2.5">
        <div class="flex-1 relative flex items-center min-w-0">
          <input
            v-model="url"
            @keydown.enter="inspect(url)"
            class="w-full h-9 pl-3 pr-9 font-mono text-xs leading-9 bg-bg-sub border border-border rounded-lg text-fg outline-none transition-[border] focus:border-fg"
            placeholder=".mcz URL or drop file"
          >
          <span class="absolute right-[3px] flex">
            <label for="fi" class="w-7 h-7 flex items-center justify-center rounded-md text-fg3 cursor-pointer transition-all hover:text-fg hover:bg-bg-sub">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            </label>
          </span>
          <input id="fi" type="file" accept=".mcz" @change="onFile" hidden>
        </div>
        <button @click="inspect(url)" class="h-9 px-3.5 font-semibold text-xs leading-9 bg-fg text-white border-none rounded-lg cursor-pointer flex items-center gap-[5px] shrink-0 transition-colors hover:bg-[#222]">
          Inspect
        </button>
      </div>
    </div>

    <!-- Error -->
    <div v-if="error" class="mx-auto max-w-3xl px-6 pb-4">
      <div class="flex items-center gap-2 p-2 px-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
        <span class="flex-1">{{ error }}</span>
        <button @click="error = ''" class="bg-transparent border-none text-fg3 cursor-pointer p-0.5 flex">✕</button>
      </div>
    </div>

    <!-- Results -->
    <div v-if="info" class="mx-auto max-w-3xl px-6 pb-12">
      <!-- Header -->
      <div class="border border-border rounded-lg overflow-hidden mb-6">
        <div class="bg-bg-sub px-4 py-2 text-xs font-medium text-fg border-b border-border">File Header</div>
        <div class="grid grid-cols-2 max-[480px]:grid-cols-1 gap-px bg-border">
          <div class="bg-white px-4 py-2.5"><span class="text-[10px] text-fg3 uppercase tracking-wider block">Magic</span><span class="font-mono text-xs text-fg">MCZ\x01</span></div>
          <div class="bg-white px-4 py-2.5"><span class="text-[10px] text-fg3 uppercase tracking-wider block">Version</span><span class="font-mono text-xs text-fg">1</span></div>
          <div class="bg-white px-4 py-2.5"><span class="text-[10px] text-fg3 uppercase tracking-wider block">Pages</span><span class="font-mono text-xs text-fg">{{ info.length }}</span></div>
          <div class="bg-white px-4 py-2.5"><span class="text-[10px] text-fg3 uppercase tracking-wider block">Index Size</span><span class="font-mono text-xs text-fg">{{ 8 + info.length * 16 }} bytes</span></div>
          <div class="bg-white px-4 py-2.5"><span class="text-[10px] text-fg3 uppercase tracking-wider block">Total Size</span><span class="font-mono text-xs text-fg">{{ formatSize(totalSize) }}</span></div>
          <div class="bg-white px-4 py-2.5"><span class="text-[10px] text-fg3 uppercase tracking-wider block">Formats</span><span class="font-mono text-xs text-fg">{{ formatSummary }}</span></div>
        </div>
      </div>

      <!-- Page Index -->
      <div class="border border-border rounded-lg overflow-hidden">
        <div class="bg-bg-sub px-4 py-2 text-xs font-medium text-fg border-b border-border">Page Index</div>
        <table class="w-full border-collapse text-xs">
          <tr class="bg-bg-sub">
            <th class="text-left font-medium text-fg3 px-4 py-2 border-b border-border">#</th>
            <th class="text-left font-medium text-fg3 px-4 py-2 border-b border-border">Dimensions</th>
            <th class="text-left font-medium text-fg3 px-4 py-2 border-b border-border">Format</th>
            <th class="text-left font-medium text-fg3 px-4 py-2 border-b border-border">Size</th>
            <th class="text-left font-medium text-fg3 px-4 py-2 border-b border-border">Offset</th>
          </tr>
          <tr v-for="(p, i) in info" :key="i" class="hover:bg-bg-sub transition-colors">
            <td class="px-4 py-2 border-b border-border font-mono text-fg">{{ i }}</td>
            <td class="px-4 py-2 border-b border-border font-mono text-fg3">{{ p.width }}×{{ p.height }}</td>
            <td class="px-4 py-2 border-b border-border font-mono text-fg3">{{ p.format }}</td>
            <td class="px-4 py-2 border-b border-border font-mono text-fg3">{{ formatSize(p.size) }}</td>
            <td class="px-4 py-2 border-b border-border font-mono text-fg3">{{ p.offset }}</td>
          </tr>
        </table>
      </div>
    </div>

    <!-- Empty -->
    <div v-if="!info && !error" class="mx-auto max-w-3xl px-6 py-20 text-center">
      <p class="text-fg3 text-[13px] leading-relaxed">Paste a .mcz URL or drop a file to inspect its structure.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { MCZ } from '../lib/mcz';

const url = ref('');
const info = ref<any[] | null>(null);
const error = ref('');

const totalSize = computed(() => info.value ? info.value.reduce((s, p) => s + p.size, 0) : 0);
const formatSummary = computed(() => {
  if (!info.value) return '';
  const m: Record<string, number> = {};
  info.value.forEach(p => { m[p.format] = (m[p.format] || 0) + 1; });
  return Object.entries(m).map(([k, v]) => `${v} ${k}`).join(', ');
});

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

async function inspect(src: string | ArrayBuffer) {
  error.value = '';
  info.value = null;
  try {
    const mcz = src instanceof ArrayBuffer ? MCZ.from(src) : await MCZ.open(src);
    info.value = [...mcz.pages];
  } catch (e: any) {
    error.value = e.message || 'Failed to inspect file';
  }
}

function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) f.arrayBuffer().then(b => inspect(b));
}
</script>
