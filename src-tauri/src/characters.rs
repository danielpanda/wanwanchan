//! User characters live in `<app data>/characters/<id>/{sprite.json,sheet.png}`.
//! Users may also drop folders there by hand; no source changes needed.

use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::{fs, path::PathBuf};
use tauri::{AppHandle, Manager};

const MAX_PNG_BYTES: u64 = 20 * 1024 * 1024;
const MAX_DIM: u32 = 8192;

pub fn dir(app: &AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_data_dir().map_err(|e| e.to_string())?.join("characters");
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

fn valid_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 64 && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn slug(name: &str) -> String {
    let s: String = name
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect();
    let s = s.trim_matches('-').to_string();
    if s.is_empty() { "character".into() } else { s.chars().take(32).collect() }
}

/// Returns (width, height) from a PNG header, or an error if it is not a sane PNG.
pub fn png_size(bytes: &[u8]) -> Result<(u32, u32), String> {
    if bytes.len() < 24 || bytes[..8] != [137, 80, 78, 71, 13, 10, 26, 10] || &bytes[12..16] != b"IHDR" {
        return Err("Not a valid PNG file".into());
    }
    let w = u32::from_be_bytes(bytes[16..20].try_into().unwrap());
    let h = u32::from_be_bytes(bytes[20..24].try_into().unwrap());
    if w == 0 || h == 0 || w > MAX_DIM || h > MAX_DIM {
        return Err(format!("Image size {w}x{h} is not supported (max {MAX_DIM}px)"));
    }
    Ok((w, h))
}

pub fn list(app: &AppHandle) -> Result<Vec<Value>, String> {
    let mut out = vec![json!({"id": "cat", "name": "Pixel Cat", "builtin": true})];
    for entry in fs::read_dir(dir(app)?).map_err(|e| e.to_string())?.flatten() {
        let p = entry.path();
        let id = entry.file_name().to_string_lossy().to_string();
        if !valid_id(&id) || !p.join("sprite.json").is_file() || !p.join("sheet.png").is_file() {
            continue;
        }
        let name = fs::read_to_string(p.join("sprite.json"))
            .ok()
            .and_then(|t| serde_json::from_str::<Value>(&t).ok())
            .and_then(|v| v.get("name").and_then(Value::as_str).map(String::from))
            .unwrap_or_else(|| id.clone());
        out.push(json!({"id": id, "name": name, "builtin": false}));
    }
    Ok(out)
}

pub fn load(app: &AppHandle, id: &str) -> Result<Value, String> {
    if !valid_id(id) {
        return Err("invalid character id".into());
    }
    let p = dir(app)?.join(id);
    let config: Value = serde_json::from_str(&fs::read_to_string(p.join("sprite.json")).map_err(|e| e.to_string())?)
        .map_err(|e| format!("sprite.json: {e}"))?;
    let png = fs::read(p.join("sheet.png")).map_err(|e| e.to_string())?;
    png_size(&png)?;
    Ok(json!({"config": config, "image": format!("data:image/png;base64,{}", STANDARD.encode(png))}))
}

pub fn import(app: &AppHandle, path: &str, name: &str) -> Result<Value, String> {
    let src = PathBuf::from(path);
    let meta = fs::metadata(&src).map_err(|e| e.to_string())?;
    if !meta.is_file() || meta.len() > MAX_PNG_BYTES {
        return Err("File is missing or larger than 20 MB".into());
    }
    let bytes = fs::read(&src).map_err(|e| e.to_string())?;
    let (w, h) = png_size(&bytes)?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() % 100000)
        .unwrap_or(0);
    let id = format!("{}-{}", slug(name), stamp);
    let d = dir(app)?.join(&id);
    fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    fs::write(d.join("sheet.png"), &bytes).map_err(|e| e.to_string())?;
    fs::write(d.join("original.png"), &bytes).map_err(|e| e.to_string())?;
    // Starts as a single-frame sprite; the settings UI lets the user define the grid.
    let config = json!({
        "name": name,
        "frameWidth": w,
        "frameHeight": h,
        "animations": { "idle": { "start": 0, "count": 1, "fps": 4, "loop": true } },
        "states": { "idle": "idle" }
    });
    fs::write(d.join("sprite.json"), serde_json::to_string_pretty(&config).unwrap()).map_err(|e| e.to_string())?;
    Ok(json!({"id": id, "width": w, "height": h}))
}

fn decode_data_url(data_url: &str) -> Result<Vec<u8>, String> {
    let b64 = data_url.split_once("base64,").map(|(_, b)| b).ok_or("expected a base64 data URL")?;
    if b64.len() > 28 * 1024 * 1024 {
        return Err("Image too large".into());
    }
    let bytes = STANDARD.decode(b64).map_err(|e| e.to_string())?;
    png_size(&bytes)?;
    Ok(bytes)
}

/// Replace the processed sheet (after background cleanup / animation generation).
pub fn save_image(app: &AppHandle, id: &str, data_url: &str) -> Result<(), String> {
    if !valid_id(id) || id == "cat" {
        return Err("This character cannot be modified".into());
    }
    let d = dir(app)?.join(id);
    if !d.is_dir() {
        return Err("Character not found".into());
    }
    fs::write(d.join("sheet.png"), decode_data_url(data_url)?).map_err(|e| e.to_string())
}

/// The untouched imported image (for re-running cleanup with different options).
pub fn load_original(app: &AppHandle, id: &str) -> Result<String, String> {
    if !valid_id(id) {
        return Err("invalid character id".into());
    }
    let p = dir(app)?.join(id);
    let bytes = fs::read(p.join("original.png")).or_else(|_| fs::read(p.join("sheet.png"))).map_err(|e| e.to_string())?;
    png_size(&bytes)?;
    Ok(format!("data:image/png;base64,{}", STANDARD.encode(bytes)))
}

pub fn save_config(app: &AppHandle, id: &str, config: &Value) -> Result<(), String> {
    if !valid_id(id) || id == "cat" {
        return Err("This character cannot be modified".into());
    }
    let p = dir(app)?.join(id).join("sprite.json");
    if !p.parent().map(|d| d.is_dir()).unwrap_or(false) {
        return Err("Character not found".into());
    }
    fs::write(p, serde_json::to_string_pretty(config).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

pub fn delete(app: &AppHandle, id: &str) -> Result<(), String> {
    if !valid_id(id) || id == "cat" {
        return Err("This character cannot be deleted".into());
    }
    let p = dir(app)?.join(id);
    if p.is_dir() {
        fs::remove_dir_all(p).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn read_text(path: &str) -> Result<String, String> {
    let p = PathBuf::from(path);
    let meta = fs::metadata(&p).map_err(|e| e.to_string())?;
    if !meta.is_file() || meta.len() > 256 * 1024 {
        return Err("File is missing or too large".into());
    }
    fs::read_to_string(p).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_non_png() {
        assert!(png_size(b"hello world, not a png at all!").is_err());
    }
    #[test]
    fn slug_is_safe() {
        assert_eq!(slug("My Cat!!"), "my-cat");
        assert_eq!(slug("../.."), "character");
        assert!(valid_id("my-cat-123") && !valid_id("../x"));
    }
}
