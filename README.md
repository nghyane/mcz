<h1 align="center">MCZ</h1>
<p align="center">Image container that streams like video</p>

<p align="center">
  <a href="https://github.com/nghyane/mcz/releases"><img src="https://img.shields.io/github/v/release/nghyane/mcz?style=flat-square&color=000" alt="Release"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/nghyane/mcz?style=flat-square&color=000" alt="License"></a>
  <a href="https://mcz.pages.dev"><img src="https://img.shields.io/badge/site-mcz.pages.dev-blue?style=flat-square" alt="Website"></a>
</p>

---

ZIP and CBZ require the full file before rendering anything. MCZ doesn't.

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
cargo install mcz
```

## Usage

### CLI

```bash
mcz pack ./images -o chapter.mcz -q 80
mcz info chapter.mcz
mcz extract chapter.mcz 0 -o cover.webp
```

### Rust

```rust
let data = std::fs::read("chapter.mcz")?;
let index = mcz::read_index(&data)?;
let page = mcz::extract_page(&data, &index, 0)?;
```

### TypeScript

```typescript
import { MCZ } from "mcz";

const mcz = await MCZ.open(url);

const blob = await mcz.blob(0);
document.querySelector("img").src = URL.createObjectURL(blob);

for await (const { index, blob } of mcz.stream()) {
  document.querySelectorAll("img")[index].src = URL.createObjectURL(blob);
}

mcz.close();
```

## Project Structure

```
src/          Rust CLI + library
js/           TypeScript browser SDK
site/         Website (Astro + Vue + Tailwind v4)
```

## Documentation

- [Format Spec](SPEC.md)
- [Website](https://mcz.pages.dev)
- [Playground](https://mcz.pages.dev/playground/)
- [Blog](https://mcz.pages.dev/blog/)

## License

[MIT](LICENSE)
