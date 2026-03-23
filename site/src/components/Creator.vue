<template>
  <div>
    <div class="mx-auto max-w-3xl px-6 py-6">
      <!-- Drop zone -->
      <div
        @dragover.prevent="dragging = true"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
        class="border-2 border-dashed rounded-lg px-6 py-10 text-center transition-colors cursor-pointer"
        :class="dragging ? 'border-accent bg-accent/5' : 'border-border'"
        @click="($refs.fileInput as HTMLInputElement).click()"
      >
        <svg class="mx-auto mb-3 text-fg3" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <p class="text-sm text-fg2 mb-1">Drop images here or click to browse</p>
        <p class="text-xs text-fg3">Supports WebP, JPEG, JXL — images pass through as-is</p>
      </div>
      <input ref="fileInput" type="file" accept="image/webp,image/jpeg,image/jxl,.webp,.jpg,.jpeg,.jxl" multiple @change="onFiles" hidden>
    </div>

    <!-- File list -->
    <div v-if="files.length" class="mx-auto max-w-3xl px-6 pb-4">
      <div class="border border-border rounded-lg overflow-hidden">
        <div class="bg-bg-sub px-4 py-2 flex items-center gap-3 border-b border-border">
          <span class="text-xs font-medium text-fg">{{ files.length }} images</span>
          <span class="text-xs text-fg3">{{ formatSize(totalSize) }}</span>
          <span class="flex-1"></span>
          <button @click="files = []" class="text-xs text-fg3 hover:text-fg bg-transparent border-none cursor-pointer">Clear</button>
        </div>
        <div v-for="(f, i) in files" :key="i" class="flex items-center gap-3 px-4 py-2 border-b border-border last:border-b-0 text-xs">
          <span class="font-mono text-fg3 w-6">{{ i }}</span>
          <span class="flex-1 text-fg truncate">{{ f.name }}</span>
          <span class="font-mono text-fg3">{{ f.w }}×{{ f.h }}</span>
          <span class="font-mono text-fg3">{{ formatSize(f.size) }}</span>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div v-if="files.length" class="mx-auto max-w-3xl px-6 pb-12">
      <button
        @click="create"
        :disabled="creating"
        class="h-9 px-5 font-semibold text-xs leading-9 bg-fg text-white border-none rounded-lg cursor-pointer flex items-center gap-2 transition-colors hover:bg-[#222] disabled:opacity-50"
      >
        <span v-if="creating">Creating...</span>
        <span v-else>Create MCZ ({{ formatSize(totalSize) }})</span>
      </button>
    </div>

    <!-- Empty -->
    <div v-if="!files.length" class="mx-auto max-w-3xl px-6 py-12 text-center">
      <p class="text-fg3 text-[13px] leading-relaxed">Add images to create an MCZ file. All processing happens in your browser.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { MCZ } from '../lib/mcz';
import type { PackInput } from '../lib/mcz';

interface FileEntry {
  name: string;
  data: ArrayBuffer;
  w: number;
  h: number;
  size: number;
  format: 'webp' | 'jpeg' | 'jxl';
}

const files = ref<FileEntry[]>([]);
const creating = ref(false);
const dragging = ref(false);

const totalSize = computed(() => files.value.reduce((s, f) => s + f.size, 0));

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

async function addFiles(fileList: FileList) {
  for (const file of fileList) {
    const data = await file.arrayBuffer();
    const img = new Image();
    const url = URL.createObjectURL(file);
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = url;
    });
    files.value.push({
      name: file.name,
      data,
      w: img.naturalWidth || 800,
      h: img.naturalHeight || 1200,
      size: data.byteLength,
      format: detectFormat(file.name),
    });
    URL.revokeObjectURL(url);
  }
}

function onFiles(e: Event) {
  const fl = (e.target as HTMLInputElement).files;
  if (fl) addFiles(fl);
}

function onDrop(e: DragEvent) {
  dragging.value = false;
  if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
}

async function create() {
  creating.value = true;
  try {
    const inputs: PackInput[] = files.value.map(f => ({
      data: f.data,
      width: f.w,
      height: f.h,
      format: f.format,
    }));
    const buf = await MCZ.pack(inputs);
    const blob = new Blob([buf], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'output.mcz';
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    creating.value = false;
  }
}
</script>
