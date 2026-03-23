<template>
  <div>
    <!-- Toolbar (same as Playground) -->
    <div class="mx-auto max-w-3xl flex items-center gap-2.5 px-6 py-3">
      <div class="flex-1 relative flex items-center min-w-0">
        <span class="absolute left-2.5 text-fg3 pointer-events-none flex">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>
        </span>
        <input
          v-model="url"
          @keydown.enter="inspect(url)"
          class="w-full h-9 pl-8 pr-9 font-mono text-xs leading-9 bg-bg-sub border border-border rounded-lg text-fg outline-none transition-[border] focus:border-fg"
          placeholder=".mcz URL"
        >
        <span class="absolute right-[3px] flex">
          <label for="fi" class="w-7 h-7 flex items-center justify-center rounded-md text-fg3 cursor-pointer transition-all hover:text-fg hover:bg-bg-sub">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          </label>
        </span>
        <input id="fi" type="file" accept=".mcz" @change="onFile" hidden>
      </div>
      <button
        @click="inspect(url)"
        class="h-9 px-3.5 font-semibold text-xs leading-9 bg-fg text-white border-none rounded-lg cursor-pointer flex items-center gap-[5px] shrink-0 transition-colors hover:bg-[#222]"
      >
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <span class="max-[640px]:hidden">Inspect</span>
      </button>
    </div>

    <!-- Stats bar (like Playground) -->
    <div v-if="info" class="mx-auto max-w-3xl flex items-center gap-1.5 px-6 py-1.5 font-mono text-[11px] text-fg3">
      <b class="text-fg2 font-medium">{{ info.length }}</b> pages
      <span class="text-border">·</span>
      {{ formatSummary }}
      <span class="text-border">·</span>
      <b class="text-fg2 font-medium">{{ formatSize(totalSize) }}</b>
      <span class="ml-auto inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full font-mono text-[10px] font-medium text-success bg-success/6">
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        parsed
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

    <!-- Results -->
    <div v-if="info" class="mx-auto max-w-3xl mt-2 px-6 pb-15">
      <!-- Header card -->
      <div class="border border-border rounded-[10px] overflow-hidden mb-4">
        <div class="grid grid-cols-3 max-[480px]:grid-cols-2 gap-px bg-border">
          <div class="bg-white px-4 py-3">
            <span class="text-[10px] text-fg3 uppercase tracking-wider block mb-0.5">Magic</span>
            <span class="font-mono text-xs text-fg">MCZ\x01</span>
          </div>
          <div class="bg-white px-4 py-3">
            <span class="text-[10px] text-fg3 uppercase tracking-wider block mb-0.5">Version</span>
            <span class="font-mono text-xs text-fg">1</span>
          </div>
          <div class="bg-white px-4 py-3">
            <span class="text-[10px] text-fg3 uppercase tracking-wider block mb-0.5">Pages</span>
            <span class="font-mono text-xs text-fg">{{ info.length }}</span>
          </div>
          <div class="bg-white px-4 py-3">
            <span class="text-[10px] text-fg3 uppercase tracking-wider block mb-0.5">Index Size</span>
            <span class="font-mono text-xs text-fg">{{ 8 + info.length * 16 }} B</span>
          </div>
          <div class="bg-white px-4 py-3">
            <span class="text-[10px] text-fg3 uppercase tracking-wider block mb-0.5">Data Size</span>
            <span class="font-mono text-xs text-fg">{{ formatSize(totalSize) }}</span>
          </div>
          <div class="bg-white px-4 py-3">
            <span class="text-[10px] text-fg3 uppercase tracking-wider block mb-0.5">Formats</span>
            <span class="font-mono text-xs text-fg">{{ formatSummary }}</span>
          </div>
        </div>
      </div>

      <!-- Page index table -->
      <div class="border border-border rounded-[10px] overflow-hidden">
        <table class="w-full border-collapse text-xs">
          <tr class="bg-bg-sub">
            <th class="text-left font-medium text-fg3 px-4 py-2 border-b border-border w-10">#</th>
            <th class="text-left font-medium text-fg3 px-4 py-2 border-b border-border">Dimensions</th>
            <th class="text-left font-medium text-fg3 px-4 py-2 border-b border-border">Format</th>
            <th class="text-right font-medium text-fg3 px-4 py-2 border-b border-border">Size</th>
            <th class="text-right font-medium text-fg3 px-4 py-2 border-b border-border max-[480px]:hidden">Offset</th>
          </tr>
          <tr v-for="(p, i) in info" :key="i">
            <td class="px-4 py-2 font-mono text-fg" :class="i < info.length - 1 ? 'border-b border-border' : ''">{{ i }}</td>
            <td class="px-4 py-2 font-mono text-fg3" :class="i < info.length - 1 ? 'border-b border-border' : ''">{{ p.width }}×{{ p.height }}</td>
            <td class="px-4 py-2 font-mono text-fg3" :class="i < info.length - 1 ? 'border-b border-border' : ''">{{ p.format }}</td>
            <td class="px-4 py-2 font-mono text-fg3 text-right" :class="i < info.length - 1 ? 'border-b border-border' : ''">{{ formatSize(p.size) }}</td>
            <td class="px-4 py-2 font-mono text-fg3 text-right max-[480px]:hidden" :class="i < info.length - 1 ? 'border-b border-border' : ''">{{ p.offset }}</td>
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
import { formatSize } from '../lib/utils';

const url = ref('');
const info = ref<any[] | null>(null);
const error = ref('');

const totalSize = computed(() => info.value?.reduce((s, p) => s + p.size, 0) ?? 0);
const formatSummary = computed(() => {
  if (!info.value) return '';
  const m: Record<string, number> = {};
  info.value.forEach(p => { m[p.format] = (m[p.format] || 0) + 1; });
  return Object.entries(m).map(([k, v]) => `${v} ${k}`).join(' · ');
});

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
