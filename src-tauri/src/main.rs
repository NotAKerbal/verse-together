#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod scriptures;
mod server;

use std::sync::Mutex;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
async fn read_scripture_chapter(volume: String, book: String, chapter: u32) -> Result<Option<scriptures::Chapter>, String> {
    // Parsing/indexing a first volume never blocks the webview or the UI thread.
    tauri::async_runtime::spawn_blocking(move || scriptures::read(&volume, &book, chapter))
        .await.map_err(|e| e.to_string())?
}

fn main() {
    let app = tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![read_scripture_chapter])
        .setup(|app| {
            if !tauri::is_dev() {
                let server = server::start(&app.path().resource_dir()?, &app.path().app_log_dir()?)?;
                app.manage(Mutex::new(Some(server)));
            }
            // Grant just this read-only command, only to our window and exact loopback origin.
            app.add_capability(serde_json::json!({
                "identifier": "desktop-scriptures",
                "windows": ["main"],
                "remote": { "urls": [server::ORIGIN] },
                "permissions": ["allow-read-scripture-chapter"]
            }).to_string())?;
            let origin: tauri::Url = server::ORIGIN.parse()?;
            let allowed = origin.clone();
            WebviewWindowBuilder::new(app, "main", WebviewUrl::External(origin))
                .title("Verse Together")
                .inner_size(1440.0, 960.0)
                .min_inner_size(800.0, 600.0)
                .on_navigation(move |url| {
                    if url.origin() == allowed.origin() { return true; }
                    open_external(url);
                    false
                })
                .on_new_window(|url, _| {
                    open_external(&url);
                    tauri::webview::NewWindowResponse::Deny
                })
                .build()?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("Could not start Verse Together desktop");
    app.run(|app, event| {
        if matches!(event, tauri::RunEvent::Exit) {
            if let Some(server) = app.try_state::<Mutex<Option<server::LocalServer>>>() {
                if let Ok(mut server) = server.lock() { server.take(); }
            }
        }
    });
}

fn open_external(url: &tauri::Url) {
    if matches!(url.scheme(), "http" | "https") {
        if let Err(error) = webbrowser::open(url.as_str()) {
            eprintln!("Could not open external link: {error}");
        }
    }
}
