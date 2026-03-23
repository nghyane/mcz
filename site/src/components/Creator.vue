<template>
  <div>
    <!-- Drop zone -->
    <div class="mx-auto max-w-3xl px-6 pt-4 pb-2">
      <div
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
        @click="fileInput?.click()"
        class="border-2 border-dashed rounded-[10px] px-6 py-8 text-center transition-colors cursor-pointer"
        :class="dragging ? 'border-accent bg-accent/5' : 'border-border hover:border-fg3'"
      >
        <svg class="mx-auto mb-2 text-fg3" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <p class="text-sm text-fg2">Drop images or click to browse</p>
        <p class="text-[11px] text-fg3 mt-1">WebP, JPEG, JXL — no re-encoding</p>
      </div>
      <input ref="fileInput" type="file" accept="image/webp,image/jpeg,image/jxl,.webp,.jpg,.jpeg,.jxl,.png" multiple @change="onFiles" hidden>
    </div>

    <!-- Stats bar -->
    <div v-if="files.length" class="mx-auto max-w-3xl flex items-center gap-1.5 px-6 py-1.5 font-mono text-[11px] text-fg3">
      <b class="text-fg2 font-medium">{{ files.length }}</b> images
      <span class="text-border">·</span>
      {{ formatSummary }}
      <span class="text-border">·</span>
      <b class="text-fg2 font-medium">{{ formatSize(totalInputSize) }}</b>
      <span class="flex-1"></span>
      <button @click="sortByName" class="text-fg3 hover:text-fg bg-transparent border-none cursor-pointer text-[10px] font-mono">A→Z</button>
      <button @click="reverseOrder" class="text-fg3 hover:text-fg bg-transparent border-none cursor-pointer text-[10px] font-mono">Rev</button>
      <button @click="reset" class="text-fg3 hover:text-fg bg-transparent border-none cursor-pointer text-[10px] font-mono">Clear</button>
      <button
        v-if="!result"
        @click="create"
        :disabled="!!progress"
        class="ml-1 h-6 px-3 text-[10px] font-semibold bg-fg text-white rounded-full border-none cursor-pointer transition-colors hover:bg-[#222] disabled:opacity-50"
      >Create</button>
      <a
        v-if="result"
        :href="result.url"
        download="output.mcz"
        class="ml-1 inline-flex items-center gap-1 h-6 px-3 text-[10px] font-semibold bg-success text-white rounded-full no-underline transition-colors hover:bg-success/80"
      >
        <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        {{ formatSize(result.size) }}
      </a>
    </div>

    <!-- Progress -->
    <div v-if="progress" class="mx-auto max-w-3xl px-6 py-1.5">
      <div class="flex items-center gap-2 font-mono text-[11px] text-fg3 mb-1">
        <span>{{ progress.label }}</span>
        <span class="flex-1"></span>
        <span>{{ progress.current }}/{{ progress.total }}</span>
      </div>
      <div class="h-0.5 bg-border rounded-full overflow-hidden">
        <div class="h-full bg-fg rounded-full transition-all duration-200" :style="{ width: progressPct + '%' }"></div>
      </div>
    </div>

    <!-- File list -->
    <div v-if="files.length" class="mx-auto max-w-3xl mt-2 px-6 pb-15">
      <div class="border border-border rounded-[10px] overflow-hidden">
        <div
          v-for="(f, i) in files"
          :key="f.name + i"
          draggable="true"
          @dragstart="dragStart(i)"
          @dragover.prevent="dragOver(i)"
          @dragend="dragEnd"
          class="flex items-center gap-2 px-4 py-2.5 text-xs cursor-grab select-none transition-colors"
          :class="[
            dragIdx === i ? 'bg-accent/5' : 'hover:bg-bg-sub',
            i < files.length - 1 ? 'border-b border-border' : ''
          ]"
        >
          <img :src="f.thumb" class="w-6 h-6 object-cover rounded shrink-0 bg-bg-sub" :alt="f.name">
          <span class="flex-1 text-fg truncate">{{ f.name }}</span>
          <span class="font-mono text-fg3 max-[480px]:hidden">{{ f.width }}×{{ f.height }}</span>
          <span class="font-mono text-fg3">{{ formatSize(f.data.byteLength) }}</span>
          <button @click.stop="removeFile(i)" class="text-fg3 hover:text-fg bg-transparent border-none cursor-pointer p-0.5 flex">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, useTemplateRef } from 'vue';
import { MCZ, type PackInput } from '../lib/mcz';
import { formatSize, detectImageFormat, loadImageDimensions } from '../lib/utils';

// ── Types ──
interface FileEntry {
  name: string;
  data: ArrayBuffer;
  width: number;
  height: number;
  format: 'webp' | 'jpeg' | 'jxl';
  thumb: string;
}

// ── State ──
const fileInput = useTemplateRef<HTMLInputElement>('fileInput');
const files = ref<FileEntry[]>([]);
const progress = ref<{ label: string; current: number; total: number } | null>(null);
const result = ref<{ url: string; size: number } | null>(null);
const dragging = ref(false);
const dragIdx = ref<number | null>(null);

// ── Computed ──
const totalInputSize = computed(() => files.value.reduce((s, f) => s + f.data.byteLength, 0));
const progressPct = computed(() => progress.value ? (progress.value.current / progress.value.total) * 100 : 0);
const formatSummary = computed(() => {
  const m: Record<string, number> = {};
  files.value.forEach(f => { m[f.format] = (m[f.format] || 0) + 1; });
  return Object.entries(m).map(([k, v]) => `${v} ${k}`).join(' · ');
});

// ── Result management ──
function invalidateResult() {
  if (result.value) { URL.revokeObjectURL(result.value.url); result.value = null; }
}

// ── File operations ──
async function addFiles(fileList: FileList) {
  const sorted = [...fileList].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  progress.value = { label: 'Reading', current: 0, total: sorted.length };
  invalidateResult();
  for (const file of sorted) {
    const [data, dims] = await Promise.all([file.arrayBuffer(), loadImageDimensions(file)]);
    const thumb = URL.createObjectURL(file);
    files.value.push({ name: file.name, data, ...dims, format: detectImageFormat(file.name), thumb });
    progress.value!.current++;
  }
  progress.value = null;
}

function removeFile(i: number) {
  URL.revokeObjectURL(files.value[i].thumb);
  files.value.splice(i, 1);
  invalidateResult();
}

function reset() {
  files.value.forEach(f => URL.revokeObjectURL(f.thumb));
  files.value = [];
  progress.value = null;
  invalidateResult();
}

function onFiles(e: Event) { const fl = (e.target as HTMLInputElement).files; if (fl) addFiles(fl); }
function onDrop(e: DragEvent) { dragging.value = false; if (e.dataTransfer?.files) addFiles(e.dataTransfer.files); }

// ── Sorting ──
function sortByName() { files.value.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })); invalidateResult(); }
function reverseOrder() { files.value.reverse(); invalidateResult(); }

// ── Drag reorder ──
function dragStart(i: number) { dragIdx.value = i; }
function dragOver(i: number) {
  if (dragIdx.value === null || dragIdx.value === i) return;
  const item = files.value.splice(dragIdx.value, 1)[0];
  files.value.splice(i, 0, item);
  dragIdx.value = i;
  invalidateResult();
}
function dragEnd() { dragIdx.value = null; }

// ── Pack ──
async function create() {
  progress.value = { label: 'Packing', current: 0, total: files.value.length };
  const inputs: PackInput[] = files.value.map((f, i) => {
    progress.value!.current = i + 1;
    return { data: f.data, width: f.width, height: f.height, format: f.format };
  });
  const buf = await MCZ.pack(inputs);
  progress.value = null;
  const blob = new Blob([buf], { type: 'application/octet-stream' });
  result.value = { url: URL.createObjectURL(blob), size: blob.size };
}
</script>
