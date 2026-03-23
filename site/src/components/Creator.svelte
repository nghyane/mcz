<script lang="ts">
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
  let fileInput: HTMLInputElement | undefined = $state();
  let files: FileEntry[] = $state([]);
  let progress: { label: string; current: number; total: number } | null = $state(null);
  let result: { url: string; size: number } | null = $state(null);
  let dragging = $state(false);
  let dragIdx: number | null = $state(null);

  // ── Computed ──
  let totalInputSize = $derived(files.reduce((s, f) => s + f.data.byteLength, 0));
  let progressPct = $derived(progress ? (progress.current / progress.total) * 100 : 0);
  let formatSummary = $derived(() => {
    const m: Record<string, number> = {};
    files.forEach(f => { m[f.format] = (m[f.format] || 0) + 1; });
    return Object.entries(m).map(([k, v]) => `${v} ${k}`).join(' · ');
  });

  // ── Result management ──
  function invalidateResult() {
    if (result) { URL.revokeObjectURL(result.url); result = null; }
  }

  // ── File operations ──
  async function addFiles(fileList: FileList) {
    const sorted = [...fileList].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    progress = { label: 'Reading', current: 0, total: sorted.length };
    invalidateResult();
    for (const file of sorted) {
      const [data, dims] = await Promise.all([file.arrayBuffer(), loadImageDimensions(file)]);
      const thumb = URL.createObjectURL(file);
      files.push({ name: file.name, data, ...dims, format: detectImageFormat(file.name), thumb });
      progress!.current++;
    }
    progress = null;
  }

  function removeFile(i: number) {
    URL.revokeObjectURL(files[i].thumb);
    files.splice(i, 1);
    invalidateResult();
  }

  function reset() {
    files.forEach(f => URL.revokeObjectURL(f.thumb));
    files = [];
    progress = null;
    invalidateResult();
  }

  function onFiles(e: Event) {
    const fl = (e.target as HTMLInputElement).files;
    if (fl) addFiles(fl);
  }

  function onDrop(e: DragEvent) {
    dragging = false;
    if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
  }

  // ── Sorting ──
  function sortByName() {
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    invalidateResult();
  }

  function reverseOrder() {
    files.reverse();
    invalidateResult();
  }

  // ── Drag reorder ──
  function dragStart(i: number) { dragIdx = i; }
  function dragOver(i: number) {
    if (dragIdx === null || dragIdx === i) return;
    const item = files.splice(dragIdx, 1)[0];
    files.splice(i, 0, item);
    dragIdx = i;
    invalidateResult();
  }
  function dragEnd() { dragIdx = null; }

  // ── Pack ──
  async function create() {
    progress = { label: 'Packing', current: 0, total: files.length };
    const inputs: PackInput[] = files.map((f, i) => {
      progress!.current = i + 1;
      return { data: f.data, width: f.width, height: f.height, format: f.format };
    });
    const buf = await MCZ.pack(inputs);
    progress = null;
    const blob = new Blob([buf], { type: 'application/octet-stream' });
    result = { url: URL.createObjectURL(blob), size: blob.size };
  }
</script>

<div>
  <!-- Drop zone -->
  <div class="mx-auto max-w-3xl px-6 pt-4 pb-2">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      ondragover={(e) => { e.preventDefault(); dragging = true; }}
      ondragleave={() => dragging = false}
      ondrop={(e) => { e.preventDefault(); onDrop(e); }}
      onclick={() => fileInput?.click()}
      class="border-2 border-dashed rounded-[10px] px-6 py-8 text-center transition-colors cursor-pointer {dragging ? 'border-accent bg-accent/5' : 'border-border hover:border-fg3'}"
      role="button"
      tabindex="0"
      onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInput?.click(); }}
    >
      <svg class="mx-auto mb-2 text-fg3" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
      <p class="text-sm text-fg2">Drop images or click to browse</p>
      <p class="text-[11px] text-fg3 mt-1">WebP, JPEG, JXL — no re-encoding</p>
    </div>
    <input bind:this={fileInput} type="file" accept="image/webp,image/jpeg,image/jxl,.webp,.jpg,.jpeg,.jxl,.png" multiple onchange={onFiles} hidden>
  </div>

  <!-- Stats bar -->
  {#if files.length}
    <div class="mx-auto max-w-3xl flex items-center gap-1.5 px-6 py-1.5 font-mono text-[11px] text-fg3">
      <b class="text-fg2 font-medium">{files.length}</b> images
      <span class="text-border">·</span>
      {formatSummary()}
      <span class="text-border">·</span>
      <b class="text-fg2 font-medium">{formatSize(totalInputSize)}</b>
      <span class="flex-1"></span>
      <button onclick={sortByName} class="text-fg3 hover:text-fg bg-transparent border-none cursor-pointer text-[10px] font-mono">A→Z</button>
      <button onclick={reverseOrder} class="text-fg3 hover:text-fg bg-transparent border-none cursor-pointer text-[10px] font-mono">Rev</button>
      <button onclick={reset} class="text-fg3 hover:text-fg bg-transparent border-none cursor-pointer text-[10px] font-mono">Clear</button>
      {#if !result}
        <button
          onclick={create}
          disabled={!!progress}
          class="ml-1 h-6 px-3 text-[10px] font-semibold bg-fg text-white rounded-full border-none cursor-pointer transition-colors hover:bg-[#222] disabled:opacity-50"
        >Create</button>
      {/if}
      {#if result}
        <a
          href={result.url}
          download="output.mcz"
          class="ml-1 inline-flex items-center gap-1 h-6 px-3 text-[10px] font-semibold bg-success text-white rounded-full no-underline transition-colors hover:bg-success/80"
        >
          <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          {formatSize(result.size)}
        </a>
      {/if}
    </div>
  {/if}

  <!-- Progress -->
  {#if progress}
    <div class="mx-auto max-w-3xl px-6 py-1.5">
      <div class="flex items-center gap-2 font-mono text-[11px] text-fg3 mb-1">
        <span>{progress.label}</span>
        <span class="flex-1"></span>
        <span>{progress.current}/{progress.total}</span>
      </div>
      <div class="h-0.5 bg-border rounded-full overflow-hidden">
        <div class="h-full bg-fg rounded-full transition-all duration-200" style="width: {progressPct}%"></div>
      </div>
    </div>
  {/if}

  <!-- File list -->
  {#if files.length}
    <div class="mx-auto max-w-3xl mt-2 px-6 pb-15">
      <div class="border border-border rounded-[10px] overflow-hidden">
        {#each files as f, i}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            draggable="true"
            ondragstart={() => dragStart(i)}
            ondragover={(e) => { e.preventDefault(); dragOver(i); }}
            ondragend={dragEnd}
            class="flex items-center gap-2 px-4 py-2.5 text-xs cursor-grab select-none transition-colors {dragIdx === i ? 'bg-accent/5' : 'hover:bg-bg-sub'} {i < files.length - 1 ? 'border-b border-border' : ''}"
            role="listitem"
          >
            <img src={f.thumb} class="w-6 h-6 object-cover rounded shrink-0 bg-bg-sub" alt={f.name}>
            <span class="flex-1 text-fg truncate">{f.name}</span>
            <span class="font-mono text-fg3 max-[480px]:hidden">{f.width}×{f.height}</span>
            <span class="font-mono text-fg3">{formatSize(f.data.byteLength)}</span>
            <button onclick={() => removeFile(i)} class="text-fg3 hover:text-fg bg-transparent border-none cursor-pointer p-0.5 flex">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
