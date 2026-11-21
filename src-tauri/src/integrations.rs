//! One-click setup of agent hooks. Every change is explicit (the user clicked Install), idempotent,
//! backed up, and removable. Only entries that mention `wanwanchan-notify` are ever touched on removal.

use serde_json::{json, Map, Value};
use std::{fs, path::{Path, PathBuf}};

const MARK: &str = "wanwanchan-notify";
const ZSH_BEGIN: &str = "# >>> wanwanchan >>>";
const ZSH_END: &str = "# <<< wanwanchan <<<";

fn backup(p: &Path) {
    if p.exists() {
        let ts = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        let name = format!("{}.bak-wanwanchan-{}", p.file_name().unwrap().to_string_lossy(), ts);
        let _ = fs::copy(p, p.with_file_name(name));
    }
}

fn read_json(p: &Path) -> Result<Value, String> {
    if !p.exists() {
        return Ok(json!({}));
    }
    let t = fs::read_to_string(p).map_err(|e| e.to_string())?;
    if t.trim().is_empty() {
        return Ok(json!({}));
    }
    serde_json::from_str(&t).map_err(|e| format!("{} is not valid JSON ({e}); fix it first", p.display()))
}

fn write_json(p: &Path, v: &Value) -> Result<(), String> {
    if let Some(d) = p.parent() {
        fs::create_dir_all(d).map_err(|e| e.to_string())?;
    }
    backup(p);
    fs::write(p, serde_json::to_string_pretty(v).map_err(|e| e.to_string())? + "\n").map_err(|e| e.to_string())
}

fn mentions(v: &Value) -> bool {
    v.to_string().contains(MARK)
}

fn quote(helper: &str) -> String {
    format!("'{}'", helper.replace('\'', "'\\''"))
}

// ---------------------------------------------------------------- Claude Code
const CLAUDE_EVENTS: &[(&str, bool)] = &[
    ("UserPromptSubmit", false), ("PreToolUse", true), ("PostToolUse", true), ("Notification", false),
    ("PermissionRequest", false), ("Stop", false), ("StopFailure", false), ("SessionEnd", false),
];

fn claude_path(home: &Path) -> PathBuf { home.join(".claude/settings.json") }

fn claude(home: &Path, helper: &str, install: bool) -> Result<String, String> {
    let p = claude_path(home);
    let mut root = read_json(&p)?;
    let obj = root.as_object_mut().ok_or("settings.json must be an object")?;
    let hooks = obj.entry("hooks").or_insert_with(|| json!({}));
    let hooks = hooks.as_object_mut().ok_or("\"hooks\" must be an object")?;
    let mut changed = 0;
    if install {
        for (ev, matcher) in CLAUDE_EVENTS {
            let arr = hooks.entry(*ev).or_insert_with(|| json!([]));
            let arr = arr.as_array_mut().ok_or("hook list must be an array")?;
            if arr.iter().any(mentions) { continue; }
            let mut e = json!({"hooks": [{"type": "command", "command": format!("{} claude {}", quote(helper), ev)}]});
            if *matcher { e["matcher"] = json!("*"); }
            arr.push(e);
            changed += 1;
        }
    } else {
        for (_, arr) in hooks.iter_mut() {
            if let Some(a) = arr.as_array_mut() {
                let before = a.len();
                for g in a.iter_mut() {
                    if let Some(hs) = g.get_mut("hooks").and_then(Value::as_array_mut) {
                        hs.retain(|h| !mentions(h));
                    }
                }
                a.retain(|g| g.get("hooks").and_then(Value::as_array).map(|h| !h.is_empty()).unwrap_or(true));
                if a.len() != before { changed += 1; }
            }
        }
        hooks.retain(|_, v| v.as_array().map(|a| !a.is_empty()).unwrap_or(true));
    }
    if changed > 0 { write_json(&p, &root)?; }
    Ok(if install { format!("Claude Code: {} hook(s) added (existing hooks kept)", changed) } else { "Claude Code: WanWan-chan hooks removed".into() })
}

// ---------------------------------------------------------------- Cursor
const CURSOR_EVENTS: &[(&str, &str)] = &[
    ("beforeSubmitPrompt", "beforeSubmitPrompt"), ("beforeShellExecution", "beforeShellExecution"),
    ("afterFileEdit", "afterFileEdit"), ("stop", "stop"),
];

fn cursor(home: &Path, helper: &str, install: bool) -> Result<String, String> {
    let p = home.join(".cursor/hooks.json");
    let mut root = read_json(&p)?;
    let obj = root.as_object_mut().ok_or("hooks.json must be an object")?;
    obj.entry("version").or_insert(json!(1));
    let hooks = obj.entry("hooks").or_insert_with(|| json!({}));
    let hooks = hooks.as_object_mut().ok_or("\"hooks\" must be an object")?;
    let mut changed = 0;
    if install {
        for (ev, arg) in CURSOR_EVENTS {
            let arr = hooks.entry(*ev).or_insert_with(|| json!([]));
            let arr = arr.as_array_mut().ok_or("hook list must be an array")?;
            if arr.iter().any(mentions) { continue; }
            arr.push(json!({"command": format!("{} cursor {}", quote(helper), arg)}));
            changed += 1;
        }
    } else {
        for (_, arr) in hooks.iter_mut() {
            if let Some(a) = arr.as_array_mut() {
                let before = a.len();
                a.retain(|h| !mentions(h));
                if a.len() != before { changed += 1; }
            }
        }
        hooks.retain(|_, v| v.as_array().map(|a| !a.is_empty()).unwrap_or(true));
    }
    if changed > 0 { write_json(&p, &root)?; }
    Ok(if install { format!("Cursor: {} hook(s) added", changed) } else { "Cursor: WanWan-chan hooks removed".into() })
}

// ---------------------------------------------------------------- Codex CLI
fn codex(home: &Path, helper: &str, install: bool) -> Result<String, String> {
    let p = home.join(".codex/config.toml");
    let text = fs::read_to_string(&p).unwrap_or_default();
    let is_ours = |l: &str| l.trim_start().starts_with("notify") && l.contains(MARK);
    if install {
        if text.lines().any(is_ours) { return Ok("Codex: already set up".into()); }
        if text.lines().any(|l| l.trim_start().starts_with("notify")) {
            return Err("Codex already has a `notify` command in config.toml. Chain WanWan-chan in manually (see the snippet below).".into());
        }
        let line = format!("notify = [\"{}\", \"codex\", \"-\"]\n", helper.replace('\\', "\\\\").replace('"', "\\\""));
        // top-level keys must come before the first [table]
        let idx = text.lines().scan(0usize, |pos, l| { let s = *pos; *pos += l.len() + 1; Some((s, l)) })
            .find(|(_, l)| l.trim_start().starts_with('[')).map(|(s, _)| s).unwrap_or(text.len());
        let mut out = String::new();
        out.push_str(&text[..idx]);
        if idx > 0 && !out.ends_with('\n') { out.push('\n'); }
        out.push_str(&line);
        if idx < text.len() { out.push('\n'); }
        out.push_str(&text[idx..]);
        if let Some(d) = p.parent() { fs::create_dir_all(d).map_err(|e| e.to_string())?; }
        backup(&p);
        fs::write(&p, out).map_err(|e| e.to_string())?;
        Ok("Codex: notify command added (reports turn completion; Codex exposes no other events)".into())
    } else {
        let kept: Vec<&str> = text.lines().filter(|l| !is_ours(l)).collect();
        if kept.len() != text.lines().count() {
            backup(&p);
            fs::write(&p, kept.join("\n") + "\n").map_err(|e| e.to_string())?;
        }
        Ok("Codex: WanWan-chan notify removed".into())
    }
}

// ---------------------------------------------------------------- OpenCode
const OPENCODE_PLUGIN: &str = r#"// WanWan-chan: forwards OpenCode events to the desktop pet (installed by WanWan-chan; safe to delete)
const send = (e) => fetch("http://127.0.0.1:__PORT__/event?agent=opencode&event=" + encodeURIComponent(e)).catch(() => {});
export const WanWan-chan = async () => ({
  event: async ({ event }) => send(event.type),
  "tool.execute.before": async () => send("tool.execute.before"),
});
"#;

fn opencode(home: &Path, port: u16, install: bool) -> Result<String, String> {
    let p = home.join(".config/opencode/plugins/wanwanchan.js");
    if install {
        fs::create_dir_all(p.parent().unwrap()).map_err(|e| e.to_string())?;
        fs::write(&p, OPENCODE_PLUGIN.replace("__PORT__", &port.to_string())).map_err(|e| e.to_string())?;
        Ok("OpenCode: plugin installed (restart OpenCode)".into())
    } else {
        let _ = fs::remove_file(&p);
        Ok("OpenCode: plugin removed".into())
    }
}

// ---------------------------------------------------------------- zsh shell integration
fn shell(home: &Path, helper_dir: &Path, install: bool) -> Result<String, String> {
    let p = home.join(".zshrc");
    let text = fs::read_to_string(&p).unwrap_or_default();
    let has = text.contains(ZSH_BEGIN);
    // drop any previous block first (keeps this idempotent and updates a moved path)
    let mut out = String::new();
    let mut skipping = false;
    for l in text.lines() {
        if l.trim() == ZSH_BEGIN { skipping = true; continue; }
        if l.trim() == ZSH_END { skipping = false; continue; }
        if !skipping { out.push_str(l); out.push('\n'); }
    }
    if install {
        let script = helper_dir.join("wanwanchan-shell.zsh");
        out.push_str(&format!("{ZSH_BEGIN}\n[ -f '{0}' ] && source '{0}'\n{ZSH_END}\n", script.display()));
        backup(&p);
        fs::write(&p, out).map_err(|e| e.to_string())?;
        Ok("Terminal: added to ~/.zshrc (open a new terminal tab to activate)".into())
    } else {
        if has { backup(&p); fs::write(&p, out).map_err(|e| e.to_string())?; }
        Ok("Terminal: removed from ~/.zshrc".into())
    }
}

// ---------------------------------------------------------------- public API
pub fn install(home: &Path, helper_dir: &Path, port: u16, agent: &str, on: bool) -> Result<String, String> {
    let helper = helper_dir.join("wanwanchan-notify").to_string_lossy().to_string();
    match agent {
        "claude" => claude(home, &helper, on),
        "cursor" => cursor(home, &helper, on),
        "codex" => codex(home, &helper, on),
        "opencode" => opencode(home, port, on),
        "shell" => shell(home, helper_dir, on),
        _ => Err("This agent has no documented hook mechanism. Use the terminal integration or `wanwanchan-run`.".into()),
    }
}

pub fn status(home: &Path) -> Value {
    let has = |p: PathBuf| fs::read_to_string(p).map(|t| t.contains(MARK)).unwrap_or(false);
    let mut m = Map::new();
    m.insert("claude".into(), json!(has(claude_path(home))));
    m.insert("cursor".into(), json!(has(home.join(".cursor/hooks.json"))));
    m.insert("codex".into(), json!(has(home.join(".codex/config.toml"))));
    m.insert("opencode".into(), json!(home.join(".config/opencode/plugins/wanwanchan.js").exists()));
    m.insert("shell".into(), json!(fs::read_to_string(home.join(".zshrc")).map(|t| t.contains(ZSH_BEGIN)).unwrap_or(false)));
    Value::Object(m)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("pm-test-{}-{}", name, std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn claude_merge_keeps_existing_hooks_and_is_idempotent() {
        let home = tmp("claude");
        fs::create_dir_all(home.join(".claude")).unwrap();
        fs::write(claude_path(&home), r#"{"theme":"dark","hooks":{"Stop":[{"hooks":[{"type":"command","command":"echo other"}]}]}}"#).unwrap();
        claude(&home, "/x/wanwanchan-notify", true).unwrap();
        let v = read_json(&claude_path(&home)).unwrap();
        assert_eq!(v["theme"], "dark");
        assert_eq!(v["hooks"]["Stop"].as_array().unwrap().len(), 2);
        assert!(v["hooks"]["StopFailure"].is_array());
        let before = fs::read_to_string(claude_path(&home)).unwrap();
        claude(&home, "/x/wanwanchan-notify", true).unwrap();
        assert_eq!(before, fs::read_to_string(claude_path(&home)).unwrap());
        claude(&home, "/x/wanwanchan-notify", false).unwrap();
        let v = read_json(&claude_path(&home)).unwrap();
        assert_eq!(v["hooks"]["Stop"].as_array().unwrap().len(), 1);
        assert!(v["hooks"].get("PreToolUse").is_none());
        assert_eq!(v["hooks"]["Stop"][0]["hooks"][0]["command"], "echo other");
    }

    #[test]
    fn codex_inserts_notify_before_first_table_and_refuses_to_clobber() {
        let home = tmp("codex");
        fs::create_dir_all(home.join(".codex")).unwrap();
        let p = home.join(".codex/config.toml");
        fs::write(&p, "model = \"gpt\"\n\n[profiles.a]\nx = 1\n").unwrap();
        codex(&home, "/x/wanwanchan-notify", true).unwrap();
        let t = fs::read_to_string(&p).unwrap();
        assert!(t.find("notify").unwrap() < t.find("[profiles.a]").unwrap());
        assert!(t.contains("model = \"gpt\""));
        codex(&home, "/x/wanwanchan-notify", false).unwrap();
        assert!(!fs::read_to_string(&p).unwrap().contains("notify"));
        fs::write(&p, "notify = [\"other\"]\n").unwrap();
        assert!(codex(&home, "/x/wanwanchan-notify", true).is_err());
    }

    #[test]
    fn shell_block_is_replaced_not_duplicated() {
        let home = tmp("zsh");
        fs::write(home.join(".zshrc"), "export A=1\n").unwrap();
        shell(&home, Path::new("/bin-dir"), true).unwrap();
        shell(&home, Path::new("/bin-dir"), true).unwrap();
        let t = fs::read_to_string(home.join(".zshrc")).unwrap();
        assert_eq!(t.matches(ZSH_BEGIN).count(), 1);
        assert!(t.contains("export A=1"));
        shell(&home, Path::new("/bin-dir"), false).unwrap();
        assert!(!fs::read_to_string(home.join(".zshrc")).unwrap().contains("wanwanchan"));
    }
}
