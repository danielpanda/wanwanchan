//! Event-driven global input monitoring (no polling).
//!
//! * Mouse-move monitor: needs no permission. Emits throttled `cursor` events (window-local
//!   logical coordinates) so the pet can look at the cursor and hit-test for click-through.
//! * Key monitor: needs "Input Monitoring". We only *count* key events and emit an empty
//!   `key` event. The event's characters/key codes are never read.

use serde_json::json;
use std::{
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{AppHandle, Emitter, Manager};

#[cfg(target_os = "macos")]
mod mac {
    use super::*;
    use block2::RcBlock;
    use objc2::{rc::Retained, runtime::AnyObject};
    use objc2_app_kit::{NSEvent, NSEventMask};
    use std::{cell::RefCell, ptr::NonNull};

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGPreflightListenEventAccess() -> bool;
        fn CGRequestListenEventAccess() -> bool;
    }

    pub fn key_permission() -> bool {
        unsafe { CGPreflightListenEventAccess() }
    }
    pub fn request_key_permission() -> bool {
        unsafe { CGRequestListenEventAccess() }
    }

    thread_local! {
        static MOUSE: RefCell<Option<Retained<AnyObject>>> = const { RefCell::new(None) };
        static KEY: RefCell<Option<Retained<AnyObject>>> = const { RefCell::new(None) };
    }

    pub fn set_mouse(app: &AppHandle, on: bool) {
        MOUSE.with(|slot| {
            let mut slot = slot.borrow_mut();
            if let Some(m) = slot.take() {
                unsafe { NSEvent::removeMonitor(&m) };
            }
            if on {
                let app = app.clone();
                let block = RcBlock::new(move |_e: NonNull<NSEvent>| emit_cursor(&app));
                *slot = NSEvent::addGlobalMonitorForEventsMatchingMask_handler(
                    NSEventMask::MouseMoved | NSEventMask::LeftMouseDragged,
                    &block,
                );
            }
        });
    }

    pub fn set_key(app: &AppHandle, on: bool) {
        KEY.with(|slot| {
            let mut slot = slot.borrow_mut();
            if let Some(m) = slot.take() {
                unsafe { NSEvent::removeMonitor(&m) };
            }
            if on {
                let app = app.clone();
                // The event itself is intentionally ignored: we only learn *that* a key was pressed.
                let block = RcBlock::new(move |_e: NonNull<NSEvent>| {
                    if let Some(w) = app.get_webview_window("pet") {
                        let _ = w.emit("key", ());
                    }
                });
                *slot = NSEvent::addGlobalMonitorForEventsMatchingMask_handler(NSEventMask::KeyDown, &block);
            }
        });
    }
}

static LAST_EMIT: Mutex<Option<Instant>> = Mutex::new(None);
static TRAILING_PENDING: AtomicBool = AtomicBool::new(false);
const MIN_GAP: Duration = Duration::from_millis(33);

fn send_cursor(app: &AppHandle) {
    let Some(w) = app.get_webview_window("pet") else { return };
    if !w.is_visible().unwrap_or(false) {
        return;
    }
    if let (Ok(c), Ok(o)) = (w.cursor_position(), w.outer_position()) {
        let s = w.scale_factor().unwrap_or(1.0);
        let _ = w.emit("cursor", json!({ "x": (c.x - o.x as f64) / s, "y": (c.y - o.y as f64) / s }));
    }
}

/// Throttled with a trailing edge so the last position is never lost.
fn emit_cursor(app: &AppHandle) {
    let now = Instant::now();
    let mut last = LAST_EMIT.lock().unwrap();
    if last.map(|t| now.duration_since(t) >= MIN_GAP).unwrap_or(true) {
        *last = Some(now);
        drop(last);
        send_cursor(app);
    } else if !TRAILING_PENDING.swap(true, Ordering::SeqCst) {
        let app = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(MIN_GAP);
            TRAILING_PENDING.store(false, Ordering::SeqCst);
            *LAST_EMIT.lock().unwrap() = Some(Instant::now());
            send_cursor(&app);
        });
    }
}

pub fn key_permission() -> bool {
    #[cfg(target_os = "macos")]
    return mac::key_permission();
    #[cfg(not(target_os = "macos"))]
    false
}

pub fn request_key_permission() -> bool {
    #[cfg(target_os = "macos")]
    return mac::request_key_permission();
    #[cfg(not(target_os = "macos"))]
    false
}

/// Install/remove monitors on the main thread. `keys` is only honoured when permission is granted.
pub fn configure(app: &AppHandle, mouse: bool, keys: bool) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        #[cfg(target_os = "macos")]
        {
            mac::set_mouse(&handle, mouse);
            mac::set_key(&handle, keys && key_permission());
        }
        #[cfg(not(target_os = "macos"))]
        let _ = (&handle, mouse, keys);
    });
}
