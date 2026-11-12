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
        // Desktop notifications when a new booking request arrives.
        .plugin(tauri_plugin_notification::init())
        // Signed auto-updates: the UI checks GitHub Releases for latest.json
        // (endpoint and public key in tauri.conf.json), downloads, installs...
        .plugin(tauri_plugin_updater::Builder::new().build())
        // ...and relaunches the app with the process plugin.
        .plugin(tauri_plugin_process::init())
        .run(tauri::generate_context!())
        .expect("error while running the Woof Bilbao staff app");
}
