# MCZ Format Specification

8-byte header + 16 bytes per page index + raw image data. All **little-endian**.

## Layout

```mermaid
block-beta
  columns 1
  h["Header (8 bytes)"]
  i["Page Index (page_count × 16 bytes)"]
  d["Page 0 .. Page N (raw image bytes)"]

  style h fill:#1a1a2e,stroke:#444,color:#fff
  style i fill:#16213e,stroke:#444,color:#fff
  style d fill:#0f3460,stroke:#444,color:#fff
```

## Header (8 bytes)

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| 0 | 4 | `magic` | `MCZ\x01` (`4d 43 5a 01`) |
| 4 | 1 | `version` | Format version (`1`) |
| 5 | 1 | `flags` | Reserved, must be `0` |
| 6 | 2 | `page_count` | Number of pages, u16 LE |

## Page Index Entry (16 bytes × page_count)

| Offset | Size | Field | Description |
|--------|------|-------|-------------|
| 0 | 4 | `offset` | Byte position of image data, u32 LE |
| 4 | 4 | `size` | Encoded image byte size, u32 LE |
| 8 | 2 | `width` | Image width in pixels, u16 LE |
| 10 | 2 | `height` | Image height in pixels, u16 LE |
| 12 | 1 | `format` | `0` = WebP, `1` = JPEG, `2` = JXL |
| 13 | 3 | `reserved` | Must be `0` |

## Limits

- Max pages: 65,535 (u16)
- Max page size: ~4 GB (u32)
- Max file offset: ~4 GB (u32)
- Supported formats: WebP, JPEG, JPEG XL

## Streaming

```mermaid
sequenceDiagram
    participant C as Client
    participant S as Server

    C->>S: GET Range: 0-327
    S-->>C: 206 — header + index (328 B)
    Note over C: Layout 20 pages instantly<br>(dimensions from index, zero CLS)

    alt Random access
        C->>S: GET Range: 328-210759
        S-->>C: 206 — page 0 (WebP)
        Note over C: Render page 0
    else Progressive stream
        C->>S: GET (full file)
        S-->>C: 200 — streaming response
        Note over C: Render pages as data arrives
    end
```
