<template>
  <div>
    <!-- Drop zone -->
    <div class="mx-auto max-w-3xl px-6 py-6">
      <div
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
        class="border-2 border-dashed rounded-lg px-6 py-10 text-center transition-colors cursor-pointer"
        :class="dragging ? 'border-accent bg-accent/5' : 'border-border'"
        @click="fileInput?.click()"
      >
        <svg class="mx-auto mb-3 text-fg3" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <p class="text-sm text-fg2 mb-1">Drop images here or click to browse</p>
        <p class="text-xs text-fg3">WebP, JPEG, JXL — images pass through as-is</p>
      </div>
      <input ref="fileInput" type="file" accept="image/webp,image/jpeg,image/jxl,.webp,.jpg,.jpeg,.jxl,.png" multiple @change="onFiles" hidden>
    </div>

    <!-- File list -->
    <div v-if="files.length" class="mx-auto max-w-3xl px-6 pb-4">
      <div class="border border-border rounded-lg overflow-hidden">
        <div class="bg-bg-sub px-4 py-2 flex items-center gap-3 border-b border-border">
          <span class="text-xs font-medium text-fg">{{ files.length }} images</span>
          <span class="text-xs text-fg3">{{ formatSize(totalInputSize) }}</span>
          <span class="flex-1"></span>
          <button @click="reset" class="text-xs text-fg3 hover:text-fg bg-transparent border-none cursor-pointer">Clear</button>
        </div>
        <div v-for="(f, i) in files" :key="i" class="flex items-center gap-3 px-4 py-2 border-b border-border last:border-b-0 text-xs">
          <span class="font-mono text-fg3 w-6 text-right">{{ i }}</span>
          <span class="flex-1 text-fg truncate">{{ f.name }}</span>
          <span class="font-mono text-fg3">{{ f.width }}×{{ f.height }}</span>
          <span class="font-mono text-fg3">{{ formatSize(f.data.byteLength) }}</span>
          <button @click="files.splice(i, 1)" class="text-fg3 hover:text-fg bg-transparent border-none cursor-pointer text-[10px]">✕</button>
        </div>
      </div>
    </div>

    <!-- Progress -->
    <div v-if="progress" class="mx-auto max-w-3xl px-6 pb-4">
      <div class="bg-bg-sub border border-border rounded-lg px-4 py-3">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-xs font-medium text-fg">{{ progress.label }}</span>
          <span class="flex-1"></span>
          <span class="text-xs font-mono text-fg3">{{ progress.current }}/{{ progress.total }}</span>
        </div>
        <div class="h-1 bg-border rounded-full overflow-hidden">
          <div class="h-full bg-fg rounded-full transition-all duration-200" :style="{ width: progressPct + '%' }"></div>
        </div>
      </div>
    </div>

    <!-- Result -->
    <div v-if="result" class="mx-auto max-w-3xl px-6 pb-4">
      <div class="bg-bg-sub border border-border rounded-lg px-4 py-3 flex items-center gap-3">
        <svg class="text-success shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        <div class="flex-1">
          <span class="text-xs font-medium text-fg">output.mcz</span>
          <span class="text-xs text-fg3 ml-2">{{ formatSize(result.size) }} · {{ files.length }} pages</span>
        </div>
        <a
          :href="result.url"
          download="output.mcz"
          class="h-8 px-4 text-xs font-medium bg-fg text-white rounded-lg inline-flex items-center gap-1.5 no-underline transition-colors hover:bg-[#222]"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Download
        </a>
      </div>
    </div>

    <!-- Actions -->
    <div v-if="files.length && !result" class="mx-auto max-w-3xl px-6 pb-12">
      <button
        @click="create"
        :disabled="!!progress"
        class="h-9 px-5 font-semibold text-xs leading-9 bg-fg text-white border-none rounded-lg cursor-pointer flex items-center gap-2 transition-colors hover:bg-[#222] disabled:opacity-50"
      >
        Create MCZ ({{ formatSize(totalInputSize) }})
      </button>
    </div>

    <!-- Empty -->
    <div v-if="!files.length && !result" class="mx-auto max-w-3xl px-6 py-12 text-center">
      <p class="text-fg3 text-[13px] leading-relaxed">Add images to create an MCZ file. All processing happens in your browser.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, useTemplateRef } from 'vue';
import { MCZ } from '../lib/mcz';
import type { PackInput } from '../lib/mcz';

interface FileEntry {
  name: string;
  data: ArrayBuffer;
  width: number;
  height: number;
  format: 'webp' | 'jpeg' | 'jxl';
}

const fileInput = useTemplateRef<HTMLInputElement>('fileInput');
const files = ref<FileEntry[]>([]);
const progress = ref<{ label: string; current: number; total: number } | null>(null);
const result = ref<{ url: string; size: number } | null>(null);

const totalInputSize = computed(() => files.value.reduce((s, f) => s + f.data.byteLength, 0));
const progressPct = computed(() => progress.value ? (progress.value.current / progress.value.total) * 100 : 0);

function formatSize(bytes: number) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function detectFormat(name: string): 'webp' | 'jpeg' | 'jxl' {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'webp') return 'webp';
  if (ext === 'jxl') return 'jxl';
  return 'jpeg';
}

function loadImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      resolve({ width: 800, height: 1200 });
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

async function addFiles(fileList: FileList) {
  const sorted = [...fileList].sort((a, b) => a.name.localeCompare(b.name));
  progress.value = { label: 'Reading images', current: 0, total: sorted.length };
  result.value = null;

  for (const file of sorted) {
    const [data, dims] = await Promise.all([
      file.arrayBuffer(),
      loadImageDimensions(file),
    ]);
    files.value.push({
      name: file.name,
      data,
      ...dims,
      format: detectFormat(file.name),
    });
    progress.value.current++;
  }
  progress.value = null;
}

function onFiles(e: Event) {
  const fl = (e.target as HTMLInputElement).files;
  if (fl) addFiles(fl);
}

function onDrop(e: DragEvent) {
  dragging.value = false;
  if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
}

function reset() {
  files.value = [];
  progress.value = null;
  if (result.value) {
    URL.revokeObjectURL(result.value.url);
    result.value = null;
  }
}

const dragging = ref(false);

async function create() {
  progress.value = { label: 'Packing MCZ', current: 0, total: files.value.length };

  const inputs: PackInput[] = files.value.map((f, i) => {
    progress.value!.current = i;
    return { data: f.data, width: f.width, height: f.height, format: f.format };
  });

  const buf = await MCZ.pack(inputs);
  progress.value = null;

  const blob = new Blob([buf], { type: 'application/octet-stream' });
  result.value = {
    url: URL.createObjectURL(blob),
    size: blob.size,
  };
}
</script>
