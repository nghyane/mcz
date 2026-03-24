<h1 align="center">Bunle</h1>
<p align="center">Image container that streams like video</p>

<p align="center">
  <a href="https://github.com/nghyane/mcz/releases"><img src="https://img.shields.io/github/v/release/nghyane/mcz?style=flat-square&color=000" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/nghyane/mcz?style=flat-square&color=000" alt="License"></a>
</p>

---

ZIP and CBZ require the full file before rendering anything. Bunle doesn't.

- **Instant layout** — page dimensions known before any image downloads
- **Any page, any time** — jump to page 50 without downloading pages 1–49
- **Pages appear as they arrive** — no spinner, no blank screen
- **No re-encoding** — WebP, JPEG, and JXL pass through as-is

## Install

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/nghyane/mcz/main/install.sh | sh
```

```powershell
# Windows
irm https://raw.githubusercontent.com/nghyane/mcz/main/install.ps1 | iex
```

```bash
# or build from source
cargo install bunle
```

## Usage

### CLI

```bash
bunle pack ./images -o gallery.bnl -q 80
bunle info gallery.bnl
bunle extract gallery.bnl 0 -o cover.webp
```

### Rust

```rust
let data = std::fs::read("gallery.bnl")?;
let index = bunle::read_index(&data)?;
let page = bunle::extract_page(&data, &index, 0)?;
```

### TypeScript

```bash
npm i @nghyane/bunle
```

```typescript
import { Bunle } from "@nghyane/bunle";

const bnl = await Bunle.open(url);

const blob = await bnl.blob(0);
document.querySelector("img").src = URL.createObjectURL(blob);

for await (const { index, blob } of bnl.stream()) {
  document.querySelectorAll("img")[index].src = URL.createObjectURL(blob);
}

bnl.close();
```

## Project Structure

```
src/          Rust CLI + library
js/           TypeScript browser SDK
site/         Website (Astro + Tailwind v4)
```

## Documentation

- [Format Spec](SPEC.md)

## License

[MIT](LICENSE)
