fn main() {
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&["read_scripture_chapter"]),
        ),
    )
    .expect("failed to build desktop application context");
}
