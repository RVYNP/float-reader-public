//! Emits the app mark at build time so the repository never carries a binary
//! image asset. The same artwork is drawn on every platform: a light page with
//! three ink rules on a dark rounded square.

use std::path::{Path, PathBuf};

/// The mark is drawn on this grid and sampled with nearest-neighbour scaling,
/// so every platform icon shows exactly the same silhouettes.
const ART: u32 = 64;
/// Rendering resolution of the PNG that macOS uses as the runtime window icon.
const PNG_SIZE: u32 = 512;

fn art(x: u32, y: u32) -> [u8; 4] {
    const RADIUS: f64 = 13.0;
    let (cx, cy) = (x as f64 + 0.5 - 32.0, y as f64 + 0.5 - 32.0);
    let in_round_square =
        cx.abs() <= 32.0 - RADIUS || cy.abs() <= 32.0 - RADIUS || cx * cx + cy * cy <= RADIUS * RADIUS;
    if !in_round_square {
        // Transparent, so the Dock and Finder compose over their own backdrop.
        return [0, 0, 0, 0];
    }
    let page = (14..50).contains(&x) && (10..54).contains(&y);
    let rule = page && (20..44).contains(&x) && [22, 32, 42].contains(&y);
    if rule {
        [67, 104, 134, 255]
    } else if page {
        [226, 238, 246, 255]
    } else {
        [38, 42, 47, 255]
    }
}

/// Bottom-up RGBA rows, as PNG's filter semantics expect.
fn rgba_rows(size: u32) -> Vec<u8> {
    let mut rows = Vec::with_capacity((size * size * 4) as usize);
    for y in 0..size {
        for x in 0..size {
            rows.extend_from_slice(&art(x * ART / size, y * ART / size));
        }
    }
    rows
}

fn crc32(bytes: &[u8]) -> u32 {
    let mut table = [0_u32; 256];
    for (n, entry) in table.iter_mut().enumerate() {
        let mut c = n as u32;
        for _ in 0..8 {
            c = if c & 1 == 1 { 0xedb88320 ^ (c >> 1) } else { c >> 1 };
        }
        *entry = c;
    }
    let mut crc = 0xffff_ffff_u32;
    for byte in bytes {
        crc = table[((crc ^ u32::from(*byte)) & 0xff) as usize] ^ (crc >> 8);
    }
    crc ^ 0xffff_ffff
}

fn chunk(png: &mut Vec<u8>, kind: &[u8; 4], data: &[u8]) {
    png.extend_from_slice(&(data.len() as u32).to_be_bytes());
    png.extend_from_slice(kind);
    png.extend_from_slice(data);
    let mut body = kind.to_vec();
    body.extend_from_slice(data);
    png.extend_from_slice(&crc32(&body).to_be_bytes());
}

/// An RGBA8 PNG. The bare `png` crate is a transitive dependency of `image`, so
/// encoding by hand keeps the build script free of extra crates.
fn png(size: u32) -> Vec<u8> {
    let mut raw = Vec::with_capacity((size * (size * 4 + 1)) as usize);
    for row in rgba_rows(size).chunks((size * 4) as usize) {
        raw.push(0);
        raw.extend_from_slice(row);
    }
    // Stored (uncompressed) deflate blocks: the artwork is flat colour, so the
    // encoder that matters is the PNG filter byte, not the compressor.
    let blocks = raw.len().div_ceil(65535).max(1);
    let mut deflated = vec![0x78, 0x01];
    for (index, block) in raw.chunks(65535).enumerate() {
        deflated.push(u8::from(index + 1 == blocks));
        deflated.extend_from_slice(&(block.len() as u16).to_le_bytes());
        deflated.extend_from_slice(&(!(block.len() as u16)).to_le_bytes());
        deflated.extend_from_slice(block);
    }
    if raw.is_empty() {
        deflated.push(1);
        deflated.extend_from_slice(&[0, 0, 0xff, 0xff]);
    }
    let (mut a, mut b) = (1_u32, 0_u32);
    for byte in &raw {
        a = (a + *byte as u32) % 65521;
        b = (b + a) % 65521;
    }
    deflated.extend_from_slice(&((b << 16) | a).to_be_bytes());

    let mut ihdr = Vec::new();
    ihdr.extend_from_slice(&size.to_be_bytes());
    ihdr.extend_from_slice(&size.to_be_bytes());
    ihdr.extend_from_slice(&[8, 6, 0, 0, 0]);

    let mut png = b"\x89PNG\r\n\x1a\n".to_vec();
    chunk(&mut png, b"IHDR", &ihdr);
    chunk(&mut png, b"IDAT", &deflated);
    chunk(&mut png, b"IEND", &[]);
    png
}

/// A 32 bpp BGRA `.ico` with the sizes Explorer and the taskbar ask for.
fn ico() -> Vec<u8> {
    const SIZES: [u32; 3] = [16, 32, 48];
    let mut images = Vec::with_capacity(SIZES.len());
    for size in SIZES {
        let pixels = rgba_rows(size);
        let mut dib = Vec::with_capacity((40 + size * size * 4 + size * size / 8) as usize);
        dib.extend_from_slice(&40_u32.to_le_bytes());
        dib.extend_from_slice(&(size as i32).to_le_bytes());
        // Height covers the XOR image plus the AND mask.
        dib.extend_from_slice(&((size * 2) as i32).to_le_bytes());
        dib.extend_from_slice(&1_u16.to_le_bytes());
        dib.extend_from_slice(&32_u16.to_le_bytes());
        dib.extend_from_slice(&0_u32.to_le_bytes());
        dib.extend_from_slice(&(size * size * 4).to_le_bytes());
        dib.extend_from_slice(&[0; 16]);
        for y in (0..size).rev() {
            for x in 0..size {
                let i = ((y * size + x) * 4) as usize;
                dib.extend_from_slice(&[pixels[i + 2], pixels[i + 1], pixels[i], pixels[i + 3]]);
            }
        }
        // A zeroed AND mask: transparency is carried by the alpha channel.
        dib.resize(dib.len() + (size * size / 8) as usize, 0);
        images.push(dib);
    }
    let mut bytes = vec![0, 0, 1, 0];
    bytes.extend_from_slice(&(SIZES.len() as u16).to_le_bytes());
    let mut offset = 6 + 16 * SIZES.len() as u32;
    for (size, dib) in SIZES.iter().zip(&images) {
        bytes.extend_from_slice(&[*size as u8, *size as u8, 0, 0]);
        bytes.extend_from_slice(&1_u16.to_le_bytes());
        bytes.extend_from_slice(&32_u16.to_le_bytes());
        bytes.extend_from_slice(&(dib.len() as u32).to_le_bytes());
        bytes.extend_from_slice(&offset.to_le_bytes());
        offset += dib.len() as u32;
    }
    for dib in &images {
        bytes.extend_from_slice(dib);
    }
    bytes
}

/// An ICNS container. macOS members may carry PNG payloads; these are the
/// retina 512/256 slots macOS bundles read, plus the legacy 128/32 forms.
fn icns() -> Vec<u8> {
    let members: [(&[u8; 4], u32); 4] = [(b"ic10", 512), (b"ic09", 256), (b"ic07", 128), (b"icp4", 16)];
    let mut body = Vec::new();
    for (kind, size) in members {
        let png = png(size);
        body.extend_from_slice(kind);
        body.extend_from_slice(&(png.len() as u32 + 8).to_be_bytes());
        body.extend_from_slice(&png);
    }
    let mut bytes = b"icns".to_vec();
    bytes.extend_from_slice(&(body.len() as u32 + 8).to_be_bytes());
    bytes.extend_from_slice(&body);
    bytes
}

/// Copies a generated file into `icons/` only when its bytes changed, so the
/// Tauri config fingerprint stays stable across rebuilds.
fn sync(generated: &[u8], target: &Path) {
    if std::fs::read(target).map(|current| current == generated).unwrap_or(false) {
        return;
    }
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).expect("create icon directory");
    }
    std::fs::write(target, generated).expect("write generated app icon");
}

fn main() {
    // tauri::generate_context! resolves `bundle.icon` entries relative to the
    // manifest directory and embeds the first .png as the window icon on
    // non-Windows targets, so the generated files are mirrored into `icons/`,
    // which is git-ignored apart from a short explanation. No image asset needs
    // to be checked into the source repository.
    // A build script runs on the host, so ask Cargo what it is building for.
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let out = PathBuf::from(std::env::var_os("OUT_DIR").expect("OUT_DIR")).join("icons");
    std::fs::create_dir_all(&out).expect("create generated icon directory");
    let png = png(PNG_SIZE);
    let icns = icns();
    let icons = PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"))
        .join("icons");
    sync(&png, &out.join("icon.png"));
    sync(&png, &icons.join("icon.png"));
    if matches!(target_os.as_str(), "macos" | "windows") {
        sync(&icns, &out.join("icon.icns"));
        sync(&icns, &icons.join("icon.icns"));
    }

    let mut attributes = tauri_build::Attributes::new();
    if target_os == "windows" {
        // Windows links the mark into the executable as a resource.
        let ico_path = out.join("icon.ico");
        let bytes = ico();
        std::fs::write(&ico_path, &bytes).expect("write generated app icon");
        sync(&bytes, &icons.join("icon.ico"));
        attributes = attributes
            .windows_attributes(tauri_build::WindowsAttributes::new().window_icon_path(ico_path));
    }
    tauri_build::try_build(attributes).expect("build desktop resources");
}
