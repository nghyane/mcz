#!/usr/bin/env python3
"""
polyglot.py — Create MCZ files that are also valid WebP images.

Layout:
  [RIFF/WEBP — 38-byte white cover] [MCZ\x01 header + index + page data]

Usage:
  python polyglot.py output.mcz page1.webp page2.jpg page3.jxl
  python polyglot.py --cover 800x1200 output.mcz *.webp
"""

from __future__ import annotations
import struct
import sys
import io
from pathlib import Path

MCZ_MAGIC = 0x015A434D
HDR = 8
ENT = 16
FMT_ID = {"webp": 0, "jpeg": 1, "jpg": 1, "jxl": 2}

# Minimal 1×1 white VP8L WebP (38 bytes). Width/height patched at runtime.
WEBP_1X1 = bytes.fromhex(
    "524946461e000000574542505650384c"
    "110000002f0000000007d0fffef7bfff"
    "8188e87f0000"
)


def detect_fmt(path: Path) -> tuple[int, str]:
    ext = path.suffix.lower().lstrip(".")
    return FMT_ID.get(ext, 0), "jpeg" if ext == "jpg" else ext


def image_dims(data: bytes) -> tuple[int, int]:
    from PIL import Image
    img = Image.open(io.BytesIO(data))
    return img.size


def make_cover(w: int, h: int) -> bytearray:
    """38-byte white WebP with patched dimensions."""
    buf = bytearray(WEBP_1X1)
    struct.pack_into("<I", buf, 21, (w - 1) | ((h - 1) << 14))
    return buf


def pack(image_paths: list[Path], output: Path, cover_size: tuple[int, int] | None = None):
    pages = []
    for p in image_paths:
        data = p.read_bytes()
        fid, fname = detect_fmt(p)
        w, h = image_dims(data)
        pages.append({"data": data, "w": w, "h": h, "fid": fid})

    cw, ch = cover_size or (pages[0]["w"], pages[0]["h"])
    cover = make_cover(cw, ch)
    cover_len = len(cover)

    n = len(pages)
    mcz_hdr_size = HDR + n * ENT
    data_start = cover_len + mcz_hdr_size

    mcz = bytearray(mcz_hdr_size)
    struct.pack_into("<I", mcz, 0, MCZ_MAGIC)
    mcz[4] = 1
    struct.pack_into("<H", mcz, 6, n)

    off = data_start
    for i, pg in enumerate(pages):
        b = HDR + i * ENT
        struct.pack_into("<I", mcz, b, off)
        struct.pack_into("<I", mcz, b + 4, len(pg["data"]))
        struct.pack_into("<H", mcz, b + 8, pg["w"])
        struct.pack_into("<H", mcz, b + 10, pg["h"])
        mcz[b + 12] = pg["fid"]
        off += len(pg["data"])

    with open(output, "wb") as f:
        f.write(cover)
        f.write(mcz)
        for pg in pages:
            f.write(pg["data"])

    total = output.stat().st_size
    print(f"✓ {output.name}")
    print(f"  cover:  {cover_len} B  ({cw}×{ch} white WebP)")
    print(f"  mcz at: byte {cover_len}")
    print(f"  pages:  {n}")
    print(f"  total:  {total:,} B  ({total / 1048576:.1f} MB)")


def parse_cover_arg(s: str) -> tuple[int, int]:
    w, h = s.lower().split("x")
    return int(w), int(h)


if __name__ == "__main__":
    args = sys.argv[1:]
    cover_size = None

    if "--cover" in args:
        idx = args.index("--cover")
        cover_size = parse_cover_arg(args[idx + 1])
        args = args[:idx] + args[idx + 2:]

    if len(args) < 2:
        print(f"Usage: {sys.argv[0]} [--cover WxH] output.mcz img1 [img2 ...]")
        sys.exit(1)

    output = Path(args[0])
    images = [Path(p) for p in args[1:]]
    pack(images, output)
