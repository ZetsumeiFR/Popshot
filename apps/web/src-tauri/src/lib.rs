mod config;
mod ws_client;

use std::path::PathBuf;
use std::sync::Mutex;

use config::{Config, Position};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewUrl,
    WebviewWindowBuilder,
};

use ws_client::{DisplayPayload, MediaInfo};

#[cfg(debug_assertions)]
fn default_relay_url() -> String {
    std::env::var("POPSHOT_RELAY_URL").unwrap_or_else(|_| "ws://localhost:3000/ws".to_string())
}

#[cfg(not(debug_assertions))]
fn default_relay_url() -> String {
    "wss://popshot.zetsumei.xyz/ws".to_string()
}

struct AppState {
    config: Mutex<Config>,
    config_path: PathBuf,
    relay_url: String,
    ws_handle: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
}

#[tauri::command]
fn get_config(state: tauri::State<AppState>) -> Config {
    state.config.lock().unwrap().clone()
}

#[tauri::command]
fn save_config(
    app: AppHandle,
    state: tauri::State<AppState>,
    config: Config,
) -> Result<(), String> {
    config::save(&state.config_path, &config).map_err(|e| e.to_string())?;

    // Only the relay identity/key matter for the connection — restarting the
    // WebSocket on every volume/position tweak would needlessly drop it.
    let creds_changed = {
        let current = state.config.lock().unwrap();
        current.client_id != config.client_id
            || current.shared_key != config.shared_key
    };

    *state.config.lock().unwrap() = config.clone();

    if creds_changed {
        // Reconnect with the new credentials immediately, no app restart needed.
        let mut handle = state.ws_handle.lock().unwrap();
        if let Some(old) = handle.take() {
            old.abort();
        }
        *handle = Some(ws_client::spawn(
            app.clone(),
            state.relay_url.clone(),
            config.client_id.clone(),
            config.shared_key.clone(),
        ));
    }

    let _ = app.emit("popshot://config-updated", &config);
    Ok(())
}

#[tauri::command]
fn open_settings(app: AppHandle) -> Result<(), String> {
    open_settings_window(&app).map_err(|e| e.to_string())
}

#[tauri::command]
fn send_test_display(app: AppHandle) -> Result<(), String> {
    do_test_display(&app).map_err(|e| e.to_string())
}

#[tauri::command]
fn prepare_overlay(
    app: AppHandle,
    state: tauri::State<AppState>,
) -> Result<(), String> {
    let win = app
        .get_webview_window("main")
        .ok_or_else(|| "main window not found".to_string())?;
    let monitor = win
        .current_monitor()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "no current monitor".to_string())?;
    let monitor_size = monitor.size();
    let monitor_pos = monitor.position();
    let cfg = state.config.lock().unwrap().clone();

    let pct = cfg.size.clamp(20, 100) as f64 / 100.0;
    let width = ((monitor_size.width as f64) * pct).round().max(200.0) as u32;
    let height = ((monitor_size.height as f64) * pct).round().max(150.0) as u32;

    let (rel_x, rel_y) = position_offset(cfg.position, *monitor_size, width, height);
    let x = monitor_pos.x + rel_x;
    let y = monitor_pos.y + rel_y;

    win.set_size(PhysicalSize::new(width, height))
        .map_err(|e| e.to_string())?;
    win.set_position(PhysicalPosition::new(x, y))
        .map_err(|e| e.to_string())?;
    Ok(())
}

fn position_offset(
    pos: Position,
    monitor: PhysicalSize<u32>,
    w: u32,
    h: u32,
) -> (i32, i32) {
    let padding: i32 = 24;
    let mw = monitor.width as i32;
    let mh = monitor.height as i32;
    let w = w as i32;
    let h = h as i32;

    let x = match pos {
        Position::TopLeft | Position::MiddleLeft | Position::BottomLeft => padding,
        Position::TopCenter | Position::Center | Position::BottomCenter => {
            ((mw - w) / 2).max(0)
        }
        Position::TopRight | Position::MiddleRight | Position::BottomRight => {
            (mw - w - padding).max(0)
        }
    };
    let y = match pos {
        Position::TopLeft | Position::TopCenter | Position::TopRight => padding,
        Position::MiddleLeft | Position::Center | Position::MiddleRight => {
            ((mh - h) / 2).max(0)
        }
        Position::BottomLeft | Position::BottomCenter | Position::BottomRight => {
            (mh - h - padding).max(0)
        }
    };
    (x, y)
}

fn do_test_display(app: &AppHandle) -> tauri::Result<()> {
    let payload = DisplayPayload {
        id: "tray-test".to_string(),
        media: MediaInfo {
            url: "https://picsum.photos/seed/tray/720/480".to_string(),
            mime: "image/jpeg".to_string(),
            size: 0,
            filename: "tray-test.jpg".to_string(),
        },
        text: Some("Test depuis le tray".to_string()),
        duration: 6,
        from: "tray".to_string(),
        channel_id: "tray".to_string(),
    };
    app.emit("popshot://display", &payload)?;
    Ok(())
}

fn open_settings_window(app: &AppHandle) -> tauri::Result<()> {
    let (width, height) = settings_window_size(app);

    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.set_size(tauri::LogicalSize::new(width, height));
        let _ = window.center();
        window.show()?;
        window.set_focus()?;
        return Ok(());
    }
    WebviewWindowBuilder::new(
        app,
        "settings",
        WebviewUrl::App("?mode=settings".into()),
    )
    .title("Popshot — Settings")
    .inner_size(width, height)
    .min_inner_size(420.0, 480.0)
    .center()
    .resizable(true)
    .decorations(true)
    .visible(true)
    .build()?;
    Ok(())
}

fn settings_window_size(app: &AppHandle) -> (f64, f64) {
    const WIDTH: f64 = 580.0;
    const PREFERRED_HEIGHT: f64 = 920.0;
    const MIN_HEIGHT: f64 = 540.0;

    let monitor = app.primary_monitor().ok().flatten();
    let height = monitor
        .as_ref()
        .map(|m| {
            let scale = m.scale_factor();
            let logical_h = (m.size().height as f64) / scale;
            (logical_h * 0.90).min(PREFERRED_HEIGHT).max(MIN_HEIGHT)
        })
        .unwrap_or(PREFERRED_HEIGHT);
    (WIDTH, height)
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let settings_item =
        MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
    let test_item = MenuItem::with_id(
        app,
        "test",
        "Send test display",
        true,
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(
        app,
        &[&settings_item, &test_item, &separator, &quit_item],
    )?;

    let icon = app
        .default_window_icon()
        .ok_or_else(|| tauri::Error::from(anyhow::anyhow!("no default icon")))?
        .clone();

    TrayIconBuilder::with_id("popshot-tray")
        .menu(&menu)
        .icon(icon)
        .tooltip("Popshot")
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "settings" => {
                if let Err(e) = open_settings_window(app) {
                    log::error!("[tray] open settings: {e}");
                }
            }
            "test" => {
                if let Err(e) = do_test_display(app) {
                    log::error!("[tray] test: {e}");
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                if let Err(e) = open_settings_window(tray.app_handle()) {
                    log::error!("[tray] left click: {e}");
                }
            }
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            open_settings,
            send_test_display,
            prepare_overlay
        ])
        .setup(|app| {
            // rustls 0.23 ships without a process-default CryptoProvider, so
            // the WebSocket client's TLS handshake would panic on first use.
            // Install `ring` before anything spawns a connection.
            let _ = rustls::crypto::ring::default_provider().install_default();

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let config_dir = app.path().app_config_dir()?;
            let config_path = config_dir.join("popshot.json");
            let config_existed = config_path.exists();
            let cfg = config::load(&config_path);

            let relay_url = default_relay_url();
            log::info!(
                "[setup] config path={} existed={} client_id={} relay_url={}",
                config_path.display(),
                config_existed,
                cfg.client_id,
                relay_url
            );

            let ws_handle = ws_client::spawn(
                app.handle().clone(),
                relay_url.clone(),
                cfg.client_id.clone(),
                cfg.shared_key.clone(),
            );

            app.manage(AppState {
                config: Mutex::new(cfg),
                config_path,
                relay_url,
                ws_handle: Mutex::new(Some(ws_handle)),
            });

            build_tray(app.handle())?;

            if !config_existed {
                if let Err(e) = open_settings_window(app.handle()) {
                    log::error!("[setup] open settings on first run: {e}");
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
