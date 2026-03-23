export function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

export function detectImageFormat(name: string): 'webp' | 'jpeg' | 'jxl' {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'webp') return 'webp';
  if (ext === 'jxl') return 'jxl';
  return 'jpeg';
}

export function loadImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { resolve({ width: 800, height: 1200 }); URL.revokeObjectURL(url); };
    img.src = url;
  });
}
