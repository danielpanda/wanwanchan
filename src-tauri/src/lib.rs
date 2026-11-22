mod agents;
mod characters;
mod input;
mod integrations;
mod settings;

use serde_json::{json, Value};
use settings::{bool_of, str_of, SettingsStore};
use std::{fs, sync::Mutex};
use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

struct Tray {
    show: CheckMenuItem<tauri::Wry>,
    on_top: CheckMenuItem<tauri::Wry>,
}

#[derive(Default)]
struct Runtime {
    agent_server: Mutex<Option<(u16, agents::ServerHandle)>>,
    tray: Mutex<Option<Tray>>,
}

// ---------------------------------------------------------------- windows

fn pick_monitor(app: &AppHandle, name: &str) -> Option<tauri::Monitor> {
    let list = app.available_monitors().ok()?;
    if !name.is_empty() {
        if let Some(m) = list.iter().find(|m| m.name().map(|n| n.as_str()) == Some(name)) {
            return Some(m.clone());
        }
    }
    app.primary_monitor().ok().flatten().or_else(|| list.into_iter().next())
}

/// The pet window covers one whole monitor and is click-through except over the character.
fn fit_pet(app: &AppHandle, pet: &WebviewWindow, s: &Value) {
    if let Some(m) = pick_monitor(app, str_of(s, "monitor")) {
        let _ = pet.set_position(PhysicalPosition::new(m.position().x, m.position().y));
        let _ = pet.set_size(PhysicalSize::new(m.size().width, m.size().height));
        let _ = pet.emit("pet-refit", ());
    }
}

fn create_pet(app: &AppHandle, s: &Value) -> tauri::Result<()> {
    let pet = WebviewWindowBuilder::new(app, "pet", WebviewUrl::App("index.html?view=pet".into()))
        .title("WanWan-chan")
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .resizable(false)
        .skip_taskbar(true)
        .focused(false)
        .visible(false)
        .always_on_top(bool_of(s, "alwaysOnTop", true))
        .visible_on_all_workspaces(true)
        .accept_first_mouse(true)
        .build()?;
    let _ = pet.set_ignore_cursor_events(true);
    fit_pet(app, &pet, s);
    if bool_of(s, "enabled", true) {
        let _ = pet.show();
    }
    Ok(())
}

fn open_settings_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.show();
        let _ = w.set_focus();
        return;
    }
    let built = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("index.html?view=settings".into()))
        .title("WanWan-chan")
        .inner_size(760.0, 560.0)
        .min_inner_size(680.0, 480.0)
        .resizable(true)
        .center()
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true)
        .build();
    if let Ok(w) = built {
        let _ = w.set_focus();
    }
}

// ---------------------------------------------------------------- settings side effects

/// Writes the helper scripts and returns the bin directory.
fn write_helpers(app: &AppHandle) -> Option<std::path::PathBuf> {
    let dir = app.path().app_data_dir().ok()?.join("bin");
    fs::create_dir_all(&dir).ok()?;
    for (name, body) in [
        ("wanwanchan-notify", agents::NOTIFY_SCRIPT),
        ("wanwanchan-run", agents::RUN_SCRIPT),
        ("wanwanchan-shell.zsh", agents::SHELL_ZSH),
    ] {
        let path = dir.join(name);
        if fs::read_to_string(&path).ok().as_deref() != Some(body) {
            fs::write(&path, body).ok()?;
        }
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o755));
        }
    }
    Some(dir)
}

fn write_notify_script(app: &AppHandle) -> Option<String> {
    write_helpers(app).map(|d| d.join("wanwanchan-notify").to_string_lossy().to_string())
}

fn apply(app: &AppHandle, s: &Value) {
    let rt = app.state::<Runtime>();
    let enabled = bool_of(s, "enabled", true);
    if let Some(pet) = app.get_webview_window("pet") {
        let _ = pet.set_always_on_top(bool_of(s, "alwaysOnTop", true));
        if enabled {
            fit_pet(app, &pet, s);
            let _ = pet.show();
        } else {
            let _ = pet.hide();
        }
    }
    // Global monitors only exist while the pet is visible.
    let want_keys = enabled && bool_of(s, "keyboardInteraction", true);
    input::configure(app, enabled, want_keys);

    // Launch at login
    let al = app.autolaunch();
    let want = bool_of(s, "launchAtLogin", false);
    if al.is_enabled().unwrap_or(false) != want {
        let _ = if want { al.enable() } else { al.disable() };
    }

    // Agent IPC server
    let agent = s.get("agent").cloned().unwrap_or(json!({}));
    let want_agent = enabled && bool_of(&agent, "enabled", false);
    let port = agent.get("port").and_then(Value::as_u64).unwrap_or(47321) as u16;
    let mut slot = rt.agent_server.lock().unwrap();
    if let Some((p, h)) = slot.as_ref() {
        if !want_agent || *p != port {
            agents::stop(h);
            *slot = None;
        }
    }
    if want_agent && slot.is_none() {
        write_notify_script(app);
        match agents::start(app.clone(), port) {
            Ok(h) => {
                *slot = Some((port, h));
                let _ = app.emit("agent-server", json!({"running": true, "port": port}));
            }
            Err(e) => {
                let _ = app.emit("agent-server", json!({"running": false, "port": port, "error": e}));
            }
        }
    } else if !want_agent {
        let _ = app.emit("agent-server", json!({"running": false, "port": port}));
    }
    drop(slot);

    if let Some(t) = rt.tray.lock().unwrap().as_ref() {
        let _ = t.show.set_checked(enabled);
        let _ = t.on_top.set_checked(bool_of(s, "alwaysOnTop", true));
    };
}

fn update_settings(app: &AppHandle, patch: &Value) -> Value {
    let store = app.state::<SettingsStore>();
    let next = store.patch(patch);
    apply(app, &next);
    let _ = app.emit("settings-changed", &next);
    next
}

// ---------------------------------------------------------------- commands

#[tauri::command]
fn get_settings(store: State<SettingsStore>) -> Value {
    store.get()
}

#[tauri::command]
fn set_settings(app: AppHandle, patch: Value) -> Value {
    update_settings(&app, &patch)
}

/// Position changes come from the pet itself; persist without echoing back to it.
#[tauri::command]
fn save_position(store: State<SettingsStore>, x: f64, y: f64) {
    if x.is_finite() && y.is_finite() {
        store.patch(&json!({"position": {"x": x.clamp(-0.2, 1.2), "y": y.clamp(-0.2, 1.2)}}));
    }
}

#[tauri::command]
fn set_ignore_cursor(app: AppHandle, ignore: bool) {
    if let Some(w) = app.get_webview_window("pet") {
        let _ = w.set_ignore_cursor_events(ignore);
    }
}

#[tauri::command]
fn list_monitors(app: AppHandle) -> Vec<Value> {
    app.available_monitors()
        .unwrap_or_default()
        .iter()
        .enumerate()
        .map(|(i, m)| {
            let s = m.scale_factor();
            json!({
                "name": m.name().cloned().unwrap_or_else(|| format!("Display {}", i + 1)),
                "width": (m.size().width as f64 / s).round(),
                "height": (m.size().height as f64 / s).round(),
            })
        })
        .collect()
}

#[tauri::command]
fn pet_action(app: AppHandle, name: String) {
    let _ = app.emit("pet-action", name);
}

#[tauri::command]
fn agent_event(app: AppHandle, agent: String, event: String) -> Result<String, String> {
    agents::dispatch(&app, &agent, &event, &Value::Null).map(String::from)
}

#[tauri::command]
fn agent_helper_path(app: AppHandle) -> Option<String> {
    write_notify_script(&app)
}

#[tauri::command]
fn integration_status(app: AppHandle) -> Result<Value, String> {
    let home = app.path().home_dir().map_err(|e| e.to_string())?;
    Ok(integrations::status(&home))
}

#[tauri::command]
fn integration_set(app: AppHandle, agent: String, install: bool) -> Result<String, String> {
    let home = app.path().home_dir().map_err(|e| e.to_string())?;
    let dir = write_helpers(&app).ok_or("could not write helper scripts")?;
    let port = app.state::<SettingsStore>().get()["agent"]["port"].as_u64().unwrap_or(47321) as u16;
    let msg = integrations::install(&home, &dir, port, &agent, install)?;
    if install {
        // make sure the listener is up so the first event is not lost
        update_settings(&app, &json!({"agent": {"enabled": true}}));
    }
    Ok(msg)
}

#[tauri::command]
fn keyboard_permission() -> bool {
    input::key_permission()
}

#[tauri::command]
fn request_keyboard_permission(app: AppHandle) -> bool {
    let granted = input::request_key_permission();
    let s = app.state::<SettingsStore>().get();
    apply(&app, &s);
    granted
}

#[tauri::command]
fn open_privacy_settings() {
    let _ = std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent")
        .spawn();
}

#[tauri::command]
fn open_settings(app: AppHandle) {
    open_settings_window(&app);
}

#[tauri::command]
fn js_log(msg: String) {
    #[cfg(debug_assertions)]
    eprintln!("[js] {msg}");
    #[cfg(not(debug_assertions))]
    let _ = msg;
}

#[tauri::command]
fn quit(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn list_characters(app: AppHandle) -> Result<Vec<Value>, String> {
    characters::list(&app)
}
#[tauri::command]
fn load_character(app: AppHandle, id: String) -> Result<Value, String> {
    characters::load(&app, &id)
}
#[tauri::command]
fn import_character(app: AppHandle, path: String, name: String) -> Result<Value, String> {
    characters::import(&app, &path, &name)
}
#[tauri::command]
fn save_character_image(app: AppHandle, id: String, data_url: String) -> Result<(), String> {
    characters::save_image(&app, &id, &data_url)
}
#[tauri::command]
fn load_character_original(app: AppHandle, id: String) -> Result<String, String> {
    characters::load_original(&app, &id)
}
#[tauri::command]
fn save_character_config(app: AppHandle, id: String, config: Value) -> Result<(), String> {
    characters::save_config(&app, &id, &config)?;
    let _ = app.emit("character-changed", id);
    Ok(())
}
#[tauri::command]
fn delete_character(app: AppHandle, id: String) -> Result<(), String> {
    characters::delete(&app, &id)?;
    let current = app.state::<SettingsStore>().get();
    if str_of(&current, "character") == id {
        update_settings(&app, &json!({"character": "cat"}));
    }
    Ok(())
}
#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    characters::read_text(&path)
}
#[tauri::command]
fn read_image_file(path: String) -> Result<String, String> {
    characters::read_image(&path)
}
#[tauri::command]
fn create_character(app: AppHandle, name: String, data_url: String, config: Value) -> Result<String, String> {
    characters::create(&app, &name, &data_url, &config)
}
#[tauri::command]
fn open_characters_dir(app: AppHandle) -> Result<(), String> {
    let d = characters::dir(&app)?;
    std::process::Command::new("open").arg(d).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------- tray

fn build_tray(app: &AppHandle, s: &Value) -> tauri::Result<()> {
    let show = CheckMenuItem::with_id(app, "toggle", "Show Character", true, bool_of(s, "enabled", true), None::<&str>)?;
    let on_top = CheckMenuItem::with_id(app, "ontop", "Always on Top", true, bool_of(s, "alwaysOnTop", true), None::<&str>)?;
    let jump = MenuItem::with_id(app, "jump", "Say Hi (Jump)", true, None::<&str>)?;
    let sit = MenuItem::with_id(app, "sit", "Sit / Stand Up", true, None::<&str>)?;
    let peek = MenuItem::with_id(app, "peek", "Peek Mode On / Off", true, None::<&str>)?;
    let pomo = MenuItem::with_id(app, "pomodoro", "Pomodoro Start / Stop", true, None::<&str>)?;
    let reset = MenuItem::with_id(app, "reset", "Reset Position", true, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, Some("Cmd+,"))?;
    let quit = MenuItem::with_id(app, "quit", "Quit WanWan-chan", true, Some("Cmd+Q"))?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let sep2 = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&show, &on_top, &jump, &sit, &peek, &pomo, &reset, &sep1, &settings, &sep2, &quit])?;

    TrayIconBuilder::with_id("tray")
        .icon(tauri::include_image!("icons/tray.png"))
        .icon_as_template(true)
        .tooltip("WanWan-chan")
        .menu(&menu)
        .on_menu_event(|app, ev| match ev.id().as_ref() {
            "toggle" => {
                let cur = bool_of(&app.state::<SettingsStore>().get(), "enabled", true);
                update_settings(app, &json!({"enabled": !cur}));
            }
            "ontop" => {
                let cur = bool_of(&app.state::<SettingsStore>().get(), "alwaysOnTop", true);
                update_settings(app, &json!({"alwaysOnTop": !cur}));
            }
            "jump" => {
                let _ = app.emit("pet-action", "jump");
            }
            "sit" => {
                let _ = app.emit("pet-action", "toggle-sit");
            }
            "peek" => {
                let cur = bool_of(&app.state::<SettingsStore>().get(), "peekMode", false);
                update_settings(app, &json!({"peekMode": !cur}));
            }
            "pomodoro" => {
                let _ = app.emit("pet-action", "pomodoro:toggle");
            }
            "reset" => {
                update_settings(app, &json!({"position": settings::defaults()["position"].clone(), "enabled": true}));
                let _ = app.emit("pet-action", "reset-position");
            }
            "settings" => open_settings_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    *app.state::<Runtime>().tray.lock().unwrap() = Some(Tray { show, on_top });
    Ok(())
}

// ---------------------------------------------------------------- entry

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .manage(Runtime::default())
        .invoke_handler(tauri::generate_handler![
            get_settings,
            set_settings,
            save_position,
            set_ignore_cursor,
            list_monitors,
            pet_action,
            agent_event,
            agent_helper_path,
            integration_status,
            integration_set,
            keyboard_permission,
            request_keyboard_permission,
            open_privacy_settings,
            open_settings,
            quit,
            js_log,
            list_characters,
            load_character,
            import_character,
            save_character_config,
            save_character_image,
            load_character_original,
            delete_character,
            read_text_file,
            read_image_file,
            create_character,
            open_characters_dir,
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let handle = app.handle().clone();
            let store = SettingsStore::load(&handle);
            let s = store.get();
            app.manage(store);
            build_tray(&handle, &s)?;
            create_pet(&handle, &s)?;
            apply(&handle, &s);
            #[cfg(debug_assertions)]
            if std::env::var("WANWANCHAN_OPEN_SETTINGS").is_ok() {
                open_settings_window(&handle);
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building WanWan-chan")
        .run(|app, event| {
            // Launching the app again (Finder / Spotlight) opens Settings.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                open_settings_window(app);
                return;
            }
            let _ = &app;
            // Menu-bar app: keep running when the settings window closes.
            if let tauri::RunEvent::ExitRequested { api, code, .. } = event {
                if code.is_none() {
                    api.prevent_exit();
                }
            }
        });
}
