fn main() {
    // Generate the small placeholder app mark into Cargo's ignored output tree.
    // No generated image needs to be checked into the source repository.
    let icon = std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap()).join("reader.ico");
    let mut bytes = vec![0, 0, 1, 0, 1, 0, 32, 32, 0, 0, 1, 0, 32, 0];
    bytes.extend_from_slice(&(40_u32 + 32 * 32 * 4 + 128).to_le_bytes());
    bytes.extend_from_slice(&22_u32.to_le_bytes());
    bytes.extend_from_slice(&40_u32.to_le_bytes());
    bytes.extend_from_slice(&32_i32.to_le_bytes());
    bytes.extend_from_slice(&64_i32.to_le_bytes());
    bytes.extend_from_slice(&1_u16.to_le_bytes());
    bytes.extend_from_slice(&32_u16.to_le_bytes());
    bytes.extend_from_slice(&[0; 24]);
    for y in 0..32 {
        for x in 0..32 {
            let page = (7..25).contains(&x) && (5..27).contains(&y);
            let rule = page && (10..22).contains(&x) && [11, 16, 21].contains(&y);
            bytes.extend_from_slice(if rule {
                &[67, 104, 134, 255]
            } else if page {
                &[226, 238, 246, 255]
            } else {
                &[38, 42, 47, 255]
            });
        }
    }
    bytes.extend_from_slice(&[0; 128]);
    std::fs::write(&icon, bytes).expect("write generated app icon");
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .windows_attributes(tauri_build::WindowsAttributes::new().window_icon_path(icon)),
    )
    .expect("build desktop resources");
}
