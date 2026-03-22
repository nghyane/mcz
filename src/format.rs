use std::fmt;

pub const MAGIC: [u8; 4] = [b'M', b'C', b'Z', 0x01];
pub const VERSION: u8 = 1;
pub const HEADER_SIZE: usize = 8;
pub const INDEX_ENTRY_SIZE: usize = 16;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum ImageFormat {
    WebP = 0,
    Jpeg = 1,
    Jxl = 2,
}

impl ImageFormat {
    pub fn from_u8(v: u8) -> Option<Self> {
        match v {
            0 => Some(Self::WebP),
            1 => Some(Self::Jpeg),
            2 => Some(Self::Jxl),
            _ => None,
        }
    }

    pub fn extension(&self) -> &'static str {
        match self {
            Self::WebP => "webp",
            Self::Jpeg => "jpg",
            Self::Jxl => "jxl",
        }
    }

    pub fn mime(&self) -> &'static str {
        match self {
            Self::WebP => "image/webp",
            Self::Jpeg => "image/jpeg",
            Self::Jxl => "image/jxl",
        }
    }
}

impl fmt::Display for ImageFormat {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::WebP => write!(f, "WebP"),
            Self::Jpeg => write!(f, "JPEG"),
            Self::Jxl => write!(f, "JXL"),
        }
    }
}

#[derive(Debug, Clone)]
pub struct PageInfo {
    pub index: u16,
    pub offset: u32,
    pub size: u32,
    pub width: u16,
    pub height: u16,
    pub format: ImageFormat,
}

#[derive(Debug, Clone)]
pub struct MCZIndex {
    pub version: u8,
    pub pages: Vec<PageInfo>,
}

impl MCZIndex {
    pub fn data_offset(page_count: u16) -> usize {
        HEADER_SIZE + page_count as usize * INDEX_ENTRY_SIZE
    }
}

// ── Serialize ───────────────────────────────────────────────────────

pub fn write_header(buf: &mut Vec<u8>, page_count: u16) {
    buf.extend_from_slice(&MAGIC);
    buf.push(VERSION);
    buf.push(0); // flags
    buf.extend_from_slice(&page_count.to_le_bytes());
}

pub fn write_index_entry(buf: &mut Vec<u8>, page: &PageInfo) {
    buf.extend_from_slice(&page.offset.to_le_bytes());
    buf.extend_from_slice(&page.size.to_le_bytes());
    buf.extend_from_slice(&page.width.to_le_bytes());
    buf.extend_from_slice(&page.height.to_le_bytes());
    buf.push(page.format as u8);
    buf.extend_from_slice(&[0u8; 3]); // reserved
}

// ── Parse ───────────────────────────────────────────────────────────

pub fn parse_header(data: &[u8]) -> Result<(u8, u16), ParseError> {
    if data.len() < HEADER_SIZE {
        return Err(ParseError::TooShort);
    }
    if data[0..4] != MAGIC {
        return Err(ParseError::BadMagic);
    }
    let version = data[4];
    let page_count = u16::from_le_bytes([data[6], data[7]]);
    Ok((version, page_count))
}

pub fn parse_index(data: &[u8], page_count: u16) -> Result<Vec<PageInfo>, ParseError> {
    let needed = HEADER_SIZE + page_count as usize * INDEX_ENTRY_SIZE;
    if data.len() < needed {
        return Err(ParseError::TooShort);
    }

    let mut pages = Vec::with_capacity(page_count as usize);
    for i in 0..page_count {
        let base = HEADER_SIZE + i as usize * INDEX_ENTRY_SIZE;
        let d = &data[base..base + INDEX_ENTRY_SIZE];

        let format = ImageFormat::from_u8(d[12]).ok_or(ParseError::BadFormat(d[12]))?;
        pages.push(PageInfo {
            index: i,
            offset: u32::from_le_bytes([d[0], d[1], d[2], d[3]]),
            size: u32::from_le_bytes([d[4], d[5], d[6], d[7]]),
            width: u16::from_le_bytes([d[8], d[9]]),
            height: u16::from_le_bytes([d[10], d[11]]),
            format,
        });
    }
    Ok(pages)
}

// ── Errors ──────────────────────────────────────────────────────────

#[derive(Debug)]
pub enum ParseError {
    TooShort,
    BadMagic,
    BadFormat(u8),
}

impl fmt::Display for ParseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::TooShort => write!(f, "data too short"),
            Self::BadMagic => write!(f, "invalid MCZ magic bytes"),
            Self::BadFormat(v) => write!(f, "unknown image format: {v}"),
        }
    }
}

impl std::error::Error for ParseError {}
