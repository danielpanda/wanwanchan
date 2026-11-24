//! "Now Playing" detection (music / YouTube / any media app that reports to macOS).
//!
//! Uses the private MediaRemote framework through dlopen, so a missing framework or a macOS
//! version that blocks it (15.4+ for third-party apps) just means "never playing". The check
//! runs on a slow poll and only emits an event when the state flips.

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::AppHandle;

static WANT: AtomicBool = AtomicBool::new(false);

/// Turn detection on/off. The poll thread is started lazily and idles while off.
pub fn configure(app: &AppHandle, on: bool) {
    WANT.store(on, Ordering::Relaxed);
    #[cfg(target_os = "macos")]
    mac::ensure_thread(app);
    #[cfg(not(target_os = "macos"))]
    let _ = app;
}

#[cfg(target_os = "macos")]
mod mac {
    use super::WANT;
    use block2::RcBlock;
    use std::{
        ffi::{c_char, c_int, c_void, CString},
        sync::{
            atomic::Ordering,
            mpsc, Mutex, Once,
        },
        time::Duration,
    };
    use tauri::{AppHandle, Emitter};

    extern "C" {
        fn dlopen(path: *const c_char, mode: c_int) -> *mut c_void;
        fn dlsym(handle: *mut c_void, name: *const c_char) -> *mut c_void;
        fn dispatch_get_global_queue(identifier: isize, flags: usize) -> *mut c_void;
    }

    type IsPlayingFn = unsafe extern "C" fn(*mut c_void, *const block2::Block<dyn Fn(u8)>);

    fn load() -> Option<IsPlayingFn> {
        let path = CString::new("/System/Library/PrivateFrameworks/MediaRemote.framework/MediaRemote").ok()?;
        let name = CString::new("MRMediaRemoteGetNowPlayingApplicationIsPlaying").ok()?;
        unsafe {
            let h = dlopen(path.as_ptr(), 1); // RTLD_LAZY
            if h.is_null() {
                return None;
            }
            let f = dlsym(h, name.as_ptr());
            if f.is_null() {
                None
            } else {
                Some(std::mem::transmute::<*mut c_void, IsPlayingFn>(f))
            }
        }
    }

    pub fn ensure_thread(app: &AppHandle) {
        static START: Once = Once::new();
        let app = app.clone();
        START.call_once(move || {
            std::thread::spawn(move || {
                let Some(f) = load() else { return };
                let mut last = false;
                loop {
                    std::thread::sleep(Duration::from_millis(1000));
                    if !WANT.load(Ordering::Relaxed) {
                        if last {
                            last = false;
                            let _ = app.emit("music", false);
                        }
                        continue;
                    }
                    let (tx, rx) = mpsc::channel::<bool>();
                    let tx = Mutex::new(tx);
                    let block = RcBlock::new(move |v: u8| {
                        let _ = tx.lock().unwrap().send(v != 0);
                    });
                    unsafe { f(dispatch_get_global_queue(0, 0), &*block) };
                    // The callback fires asynchronously; wait for this poll's own answer.
                    let Ok(now) = rx.recv_timeout(Duration::from_millis(800)) else { continue };
                    if now != last {
                        last = now;
                        let _ = app.emit("music", now);
                    }
                }
            });
        });
    }
}
