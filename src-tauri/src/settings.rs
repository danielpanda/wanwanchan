//! Settings are stored as plain JSON (`settings.json` in the app config dir).
//! The frontend owns the schema and defaults; Rust only reads a few keys.

use serde_json::{json, Map, Value};
use std::{fs, path::PathBuf, sync::Mutex};
use tauri::{AppHandle, Manager};

pub struct SettingsStore {
    pub value: Mutex<Value>,
    path: PathBuf,
}

pub fn defaults() -> Value {
    json!({
        "enabled": true,
        "launchAtLogin": false,
        "alwaysOnTop": true,
        "monitor": "",
        "character": "cat",
        "scale": 3,
        "fps": null,
        "speed": 60,
        "position": { "x": 0.5, "y": 0.92 },
        "mouseInteraction": true,
        "followCursor": false,
        "keyboardInteraction": true,
        "randomMotion": true,
        "sleepMode": true,
        "wanderEvery": 15,
        "sitAfter": 45,
        "sleepAfter": 180,
        "agent": {
            "enabled": false,
            "port": 47321,
            "agents": { "claude": true, "codex": true, "cursor": true, "antigravity": true, "opencode": true, "custom": true }
        }
    })
}

/// Recursively merge `patch` into `base` (objects merge, everything else replaces).
pub fn merge(base: &mut Value, patch: &Value) {
    match (base, patch) {
        (Value::Object(b), Value::Object(p)) => {
            for (k, v) in p {
                match b.get_mut(k) {
                    Some(existing) if existing.is_object() && v.is_object() => merge(existing, v),
                    _ => {
                        b.insert(k.clone(), v.clone());
                    }
                }
            }
        }
        (b, p) => *b = p.clone(),
    }
}

impl SettingsStore {
    pub fn load(app: &AppHandle) -> Self {
        let dir = app.path().app_config_dir().expect("config dir");
        let _ = fs::create_dir_all(&dir);
        let path = dir.join("settings.json");
        let mut value = defaults();
        if let Ok(text) = fs::read_to_string(&path) {
            if let Ok(saved) = serde_json::from_str::<Value>(&text) {
                merge(&mut value, &saved);
            }
        }
        Self { value: Mutex::new(value), path }
    }

    pub fn get(&self) -> Value {
        self.value.lock().unwrap().clone()
    }

    pub fn patch(&self, patch: &Value) -> Value {
        let mut v = self.value.lock().unwrap();
        merge(&mut v, patch);
        let snapshot = v.clone();
        drop(v);
        self.save(&snapshot);
        snapshot
    }

    fn save(&self, v: &Value) {
        let tmp = self.path.with_extension("json.tmp");
        if let Ok(text) = serde_json::to_string_pretty(v) {
            if fs::write(&tmp, text).is_ok() {
                let _ = fs::rename(&tmp, &self.path);
            }
        }
    }
}

pub fn str_of<'a>(v: &'a Value, k: &str) -> &'a str {
    v.get(k).and_then(Value::as_str).unwrap_or("")
}
pub fn bool_of(v: &Value, k: &str, d: bool) -> bool {
    v.get(k).and_then(Value::as_bool).unwrap_or(d)
}

#[allow(dead_code)]
pub fn empty_object() -> Value {
    Value::Object(Map::new())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn merge_is_deep() {
        let mut a = defaults();
        merge(&mut a, &json!({"agent": {"enabled": true}, "scale": 4}));
        assert_eq!(a["agent"]["enabled"], true);
        assert_eq!(a["agent"]["port"], 47321);
        assert_eq!(a["scale"], 4);
    }
}
