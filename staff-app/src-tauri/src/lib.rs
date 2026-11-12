// The whole app is the web UI in ../src talking to Supabase; there are no
// custom Rust commands. Rust only hosts the window and the plugins.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Logs to stdout and to the OS log folder; the UI sends its errors here too.
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Info)
                .build(),
        )
        // Remembers window size and position between runs.
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .run(tauri::generate_context!())
        .expect("error while running the Woof Bilbao staff app");
}
