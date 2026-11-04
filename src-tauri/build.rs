//! Syncs the Hold My Brief app icons into `icons/` at build time so the files
//! `tauri.conf.json` references always exist, even on a fresh checkout.
//!
//! The artwork is the brand system's "Hmb." mark; its renders are checked in
//! under `icons-src/` (exported from `brand/system/icons/`). The previous
//! build script drew the old Float Reader mark procedurally in code; that
//! generator was removed with the rename, so the repository now carries these
//! rendered icon assets directly.

use std::path::{Path, PathBuf};

/// Copies a file into place only when its bytes changed, so the Tauri config
/// fingerprint stays stable across rebuilds.
fn sync(generated: &[u8], target: &Path) {
    if std::fs::read(target).map(|current| current == generated).unwrap_or(false) {
        return;
    }
    if let Some(parent) = target.parent() {
        std::fs::create_dir_all(parent).expect("create icon directory");
    }
    std::fs::write(target, generated).expect("write app icon");
}

fn main() {
    // tauri::generate_context! resolves `bundle.icon` entries relative to the
    // manifest directory and embeds the first .png as the window icon on
    // non-Windows targets, so the checked-in renders are mirrored into
    // `icons/`, which is git-ignored. `icons-src/` is the tracked source.
    // A build script runs on the host, so ask Cargo what it is building for.
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    let manifest = PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let source = manifest.join("icons-src");
    let icons = manifest.join("icons");
    let out = PathBuf::from(std::env::var_os("OUT_DIR").expect("OUT_DIR")).join("icons");
    std::fs::create_dir_all(&out).expect("create generated icon directory");

    let png = std::fs::read(source.join("icon.png")).expect("read icons-src/icon.png");
    sync(&png, &out.join("icon.png"));
    sync(&png, &icons.join("icon.png"));
    if matches!(target_os.as_str(), "macos" | "windows") {
        let icns = std::fs::read(source.join("icon.icns")).expect("read icons-src/icon.icns");
        sync(&icns, &out.join("icon.icns"));
        sync(&icns, &icons.join("icon.icns"));
    }

    let mut attributes = tauri_build::Attributes::new();
    if target_os == "windows" {
        // Windows links the mark into the executable as a resource.
        let ico_path = out.join("icon.ico");
        let bytes = std::fs::read(source.join("icon.ico")).expect("read icons-src/icon.ico");
        std::fs::write(&ico_path, &bytes).expect("write app icon");
        sync(&bytes, &icons.join("icon.ico"));
        attributes = attributes
            .windows_attributes(tauri_build::WindowsAttributes::new().window_icon_path(ico_path));
    }
    tauri_build::try_build(attributes).expect("build desktop resources");
}
