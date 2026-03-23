use std::io::{self, Write};

use crate::format::{self, ImageFormat, MCZIndex, PageInfo, HEADER_SIZE, INDEX_ENTRY_SIZE, VERSION, COVER_PREFIX};

pub struct EncodedPage {
    pub data: Vec<u8>,
    pub width: u16,
    pub height: u16,
    pub format: ImageFormat,
}

/// Pack pre-encoded pages into MCZ format.
/// cover=true wraps in RIFF/WebP container with MCZd chunk (polyglot).
pub fn pack(pages: &[EncodedPage], out: &mut impl Write, cover: bool) -> io::Result<MCZIndex> {
    let page_count = pages.len() as u16;
    let mcz_size = HEADER_SIZE + pages.len() * INDEX_ENTRY_SIZE
        + pages.iter().map(|p| p.data.len()).sum::<usize>();
    let prefix = if cover { COVER_PREFIX } else { 0 };
    let data_start = (prefix + HEADER_SIZE + pages.len() * INDEX_ENTRY_SIZE) as u32;

    if cover {
        let (w, h) = pages.first().map_or((1u16, 1u16), |p| (p.width, p.height));

        // RIFF header: "RIFF" + size + "WEBP"
        let riff_body_size = 4 + 26 + 8 + mcz_size + (mcz_size % 2); // WEBP + VP8L chunk(26) + MCZd header(8) + data + pad
        out.write_all(b"RIFF")?;
        out.write_all(&(riff_body_size as u32).to_le_bytes())?;
        out.write_all(b"WEBP")?;

        // VP8L chunk: "VP8L" + size(17) + data(17) + 1 pad byte
        out.write_all(b"VP8L")?;
        out.write_all(&17u32.to_le_bytes())?;
        let mut vp8l = format::VP8L_DATA;
        let val = (w as u32 - 1) | ((h as u32 - 1) << 14);
        vp8l[1..5].copy_from_slice(&val.to_le_bytes());
        out.write_all(&vp8l)?;
        out.write_all(&[0u8])?; // pad to even

        // MCZd chunk header
        out.write_all(b"MCZd")?;
        out.write_all(&(mcz_size as u32).to_le_bytes())?;
    }

    let mut index_pages = Vec::with_capacity(pages.len());
    let mut offset = data_start;
    for (i, page) in pages.iter().enumerate() {
        index_pages.push(PageInfo {
            index: i as u16,
            offset,
            size: page.data.len() as u32,
            width: page.width,
            height: page.height,
            format: page.format,
        });
        offset += page.data.len() as u32;
    }

    let mut header = Vec::with_capacity(HEADER_SIZE + pages.len() * INDEX_ENTRY_SIZE);
    format::write_header(&mut header, page_count);
    for p in &index_pages {
        format::write_index_entry(&mut header, p);
    }
    out.write_all(&header)?;

    for page in pages {
        out.write_all(&page.data)?;
    }

    // RIFF pad byte if MCZd chunk data is odd
    if cover && mcz_size % 2 != 0 {
        out.write_all(&[0u8])?;
    }

    Ok(MCZIndex {
        version: VERSION,
        pages: index_pages,
    })
}

// ── CLI-only: encode + pack from directory ──────────────────────────

#[cfg(feature = "cli")]
pub use cli::*;

#[cfg(feature = "cli")]
mod cli {
    use super::*;
    use rayon::prelude::*;
    use std::fmt;
    use std::path::Path;

    /// Pack images from a directory into MCZ.
    /// Compressed formats (WebP/JPEG/JXL) → passthrough (zero quality loss).
    /// Uncompressed formats (PNG/BMP/TIFF) → encode to WebP at `quality`.
    pub fn pack_dir(dir: &Path, output: &Path, quality: u8, cover: bool) -> Result<MCZIndex, PackError> {
        let mut entries: Vec<_> = std::fs::read_dir(dir)
            .map_err(PackError::Io)?
            .filter_map(|e| e.ok())
            .filter(|e| {
                matches!(
                    e.path().extension().and_then(|s| s.to_str()),
                    Some("png" | "jpg" | "jpeg" | "webp" | "jxl" | "bmp" | "tiff")
                )
            })
            .collect();
        entries.sort_by_key(|e| e.file_name());

        if entries.is_empty() {
            return Err(PackError::NoImages);
        }

        let pages: Vec<EncodedPage> = entries
            .par_iter()
            .map(|entry| {
                let path = entry.path();
                encode_page(&path, quality)
                    .map_err(|e| PackError::Image(path.display().to_string(), e))
            })
            .collect::<Result<Vec<_>, _>>()?;

        let mut file = std::fs::File::create(output).map_err(PackError::Io)?;
        super::pack(&pages, &mut file, cover).map_err(PackError::Io)
    }

    fn encode_page(path: &Path, quality: u8) -> Result<EncodedPage, String> {
        let raw = std::fs::read(path).map_err(|e| e.to_string())?;

        let reader = image::ImageReader::new(std::io::Cursor::new(&raw))
            .with_guessed_format()
            .map_err(|e| e.to_string())?;
        let detected = reader.format();

        // Already compressed → passthrough (no quality loss)
        match detected {
            Some(image::ImageFormat::WebP) | Some(image::ImageFormat::Jpeg) => {
                let (width, height) = reader.into_dimensions().map_err(|e| e.to_string())?;
                let fmt = if matches!(detected, Some(image::ImageFormat::WebP)) {
                    ImageFormat::WebP
                } else {
                    ImageFormat::Jpeg
                };
                return Ok(EncodedPage {
                    data: raw,
                    width: width as u16,
                    height: height as u16,
                    format: fmt,
                });
            }
            _ => {}
        }

        // Uncompressed (PNG/BMP/etc) → decode and encode to WebP
        let img = image::load_from_memory(&raw).map_err(|e| e.to_string())?;
        let (width, height) = (img.width(), img.height());
        let rgb = img.to_rgb8();
        let encoder = webp::Encoder::new(rgb.as_raw(), webp::PixelLayout::Rgb, width, height);
        let data = encoder.encode(quality as f32).to_vec();

        Ok(EncodedPage {
            data,
            width: width as u16,
            height: height as u16,
            format: ImageFormat::WebP,
        })
    }

    #[derive(Debug)]
    pub enum PackError {
        Io(io::Error),
        NoImages,
        Image(String, String),
    }

    impl fmt::Display for PackError {
        fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
            match self {
                Self::Io(e) => write!(f, "io error: {e}"),
                Self::NoImages => write!(f, "no images found in directory"),
                Self::Image(path, e) => write!(f, "failed to process {path}: {e}"),
            }
        }
    }

    impl std::error::Error for PackError {}
}
