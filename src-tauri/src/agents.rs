//! Optional local event interface for AI coding agents.
//! A tiny HTTP server bound to 127.0.0.1 receives `POST /event?agent=<id>&event=<name>`
//! (or `state=<name>`) from agent hooks and forwards a *normalized* state to the pet.
//! The server thread blocks on accept(); there is no polling.

use serde_json::{json, Value};
use std::{io::Read, sync::Arc, thread};
use tauri::{AppHandle, Emitter};
use tiny_http::{Response, Server};

pub type ServerHandle = Arc<Server>;

fn squash(raw: &str) -> String {
    raw.chars().filter(|c| !matches!(c, '-' | '_' | '.' | ' ')).collect::<String>().to_lowercase()
}

/// Normalized agent states: idle | thinking | working | waiting | completed | error
pub fn normalize(raw: &str) -> Option<&'static str> {
    let key = squash(raw);
    Some(match key.as_str() {
        "idle" | "reset" | "sessionend" | "sessionstart" | "sessiondeleted" => "idle",
        "thinking" | "userpromptsubmit" | "beforesubmitprompt" | "posttooluse" | "sessionbusy" | "sessionstatusbusy" => "thinking",
        "working" | "pretooluse" | "beforeshellexecution" | "beforemcpexecution" | "afterfileedit" | "toolexecutebefore" => "working",
        "waiting" | "notification" | "permissionasked" | "permissionupdated" | "permissionrequest" | "approvalrequested" | "elicitation" => "waiting",
        "completed" | "complete" | "done" | "stop" | "agentturncomplete" | "sessionidlecompleted" | "sessionidle" => "completed",
        "error" | "failed" | "failure" | "sessionerror" | "stopfailure" => "error",
        _ => return None,
    })
}

fn query_param(url: &str, key: &str) -> Option<String> {
    let q = url.split_once('?')?.1;
    q.split('&').find_map(|kv| {
        let (k, v) = kv.split_once('=')?;
        (k == key).then(|| v.replace('+', " ").chars().take(64).collect())
    })
}

/// One line of context for the bubble: whitespace collapsed, at most `n` chars.
fn short(s: &str, n: usize) -> String {
    let s = s.split_whitespace().collect::<Vec<_>>().join(" ");
    if s.chars().count() <= n { s } else { s.chars().take(n - 1).collect::<String>() + "…" }
}

/// Refines a raw event with its hook payload (Claude Code JSON on stdin) into a state plus an
/// optional bubble detail. `"ignored"` = a known event that should not move the pet.
/// Facts from https://code.claude.com/docs/en/hooks: AskUserQuestion / ExitPlanMode only show up as
/// PreToolUse; Notification carries `notification_type`, most of which are not waiting on the user.
pub fn classify(raw: &str, p: &Value) -> Option<(&'static str, Option<String>)> {
    let get = |k: &str| p.get(k).and_then(Value::as_str);
    let tool = get("tool_name").unwrap_or("");
    let input = p.get("tool_input").unwrap_or(&Value::Null);
    let arg = |k: &str| input.get(k).and_then(Value::as_str);
    match squash(raw).as_str() {
        "pretooluse" if tool == "AskUserQuestion" => {
            let q = input.pointer("/questions/0/question").and_then(Value::as_str).unwrap_or("?");
            return Some(("waiting", Some(short(q, 70))));
        }
        "pretooluse" if tool == "ExitPlanMode" => return Some(("waiting", Some("Plan".into()))),
        "permissionrequest" if !tool.is_empty() => {
            let subject = arg("command")
                .or_else(|| arg("file_path").map(|f| f.rsplit(['/', '\\']).next().unwrap_or(f)))
                .or_else(|| arg("url"))
                .or_else(|| arg("pattern"));
            let d = match subject { Some(x) => format!("{tool}: {}", short(x, 40)), None => tool.to_string() };
            return Some(("waiting", Some(d)));
        }
        "notification" => {
            return match get("notification_type") {
                None | Some("permission_prompt" | "elicitation_dialog" | "elicitation_url_dialog" | "agent_needs_input") => {
                    Some(("waiting", get("message").map(|m| short(m, 70))))
                }
                Some(_) => Some(("ignored", None)), // idle_prompt, auth_success, agent_completed, ...
            };
        }
        _ => {}
    }
    normalize(raw).map(|s| (s, None))
}

pub fn dispatch(app: &AppHandle, agent: &str, raw: &str, payload: &Value) -> Result<&'static str, String> {
    let (state, detail) = classify(raw, payload).ok_or_else(|| format!("unknown event '{raw}'"))?;
    if state == "ignored" {
        return Ok(state);
    }
    let agent: String = agent.chars().filter(|c| c.is_ascii_alphanumeric()).take(24).collect();
    let agent = if agent.is_empty() { "custom".to_string() } else { agent.to_lowercase() };
    let _ = app.emit("agent-event", json!({ "agent": agent, "state": state, "raw": raw, "detail": detail }));
    Ok(state)
}

pub fn start(app: AppHandle, port: u16) -> Result<ServerHandle, String> {
    let server = Arc::new(Server::http(("127.0.0.1", port)).map_err(|e| format!("port {port}: {e}"))?);
    let s = server.clone();
    thread::Builder::new()
        .name("wanwanchan-agent-ipc".into())
        .spawn(move || {
            for mut req in s.incoming_requests() {
                let url = req.url().to_string();
                let path = url.split('?').next().unwrap_or("").to_string();
                if path == "/health" {
                    let _ = req.respond(Response::from_string("ok"));
                    continue;
                }
                if path != "/event" {
                    let _ = req.respond(Response::from_string("not found").with_status_code(404));
                    continue;
                }
                let mut agent = query_param(&url, "agent");
                let mut ev = query_param(&url, "event").or_else(|| query_param(&url, "state"));
                // body: a custom {"agent","event"} call, or the hook payload piped through by the helper
                let mut body = String::new();
                let _ = req.as_reader().take(1 << 20).read_to_string(&mut body);
                let payload = serde_json::from_str::<Value>(&body).unwrap_or(Value::Null);
                agent = agent.or_else(|| payload.get("agent").and_then(Value::as_str).map(String::from));
                ev = ev.or_else(|| {
                    ["event", "state", "hook_event_name", "type"]
                        .iter()
                        .find_map(|k| payload.get(*k).and_then(Value::as_str).map(String::from))
                });
                let res = match ev {
                    Some(e) => dispatch(&app, agent.as_deref().unwrap_or("custom"), &e, &payload),
                    None => Err("missing event".into()),
                };
                let _ = match res {
                    Ok(state) => req.respond(Response::from_string(state)),
                    Err(e) => req.respond(Response::from_string(e).with_status_code(400)),
                };
            }
        })
        .map_err(|e| e.to_string())?;
    Ok(server)
}

pub fn stop(h: &ServerHandle) {
    h.unblock();
}

/// Helper scripts written to `<app data>/bin`.
pub const NOTIFY_SCRIPT: &str = r#"#!/bin/sh
# WanWan-chan helper: tells the pet what an AI agent / command is doing.
# Safe to call when WanWan-chan is not running.
# usage: wanwanchan-notify <agent> <event|state>      (extra args are ignored)
#        wanwanchan-notify codex -                     (Codex passes its JSON payload as the last argument)
# states: idle | thinking | working | waiting | completed | error
PORT="${WANWANCHAN_PORT:-47321}"
AGENT="$1"; EVENT="$2"
if [ "$EVENT" = "-" ]; then
  for last; do :; done
  EVENT=$(printf '%s' "$last" | sed -n 's/.*"type" *: *"\([^"]*\)".*/\1/p')
fi
if [ "$AGENT" = "claude" ]; then
  # Claude Code pipes the hook JSON on stdin; forward it so the pet knows which tool / question.
  head -c 1048576 2>/dev/null | curl -s -m 1 -X POST -H 'Content-Type: application/json' --data-binary @- \
    "http://127.0.0.1:${PORT}/event?agent=claude&event=${EVENT}" >/dev/null 2>&1
  exit 0
fi
if [ "$AGENT" = "cursor" ]; then
  # Cursor hooks may gate actions on a JSON reply; always allow. A failed stop reports an error.
  PAYLOAD=$(head -c 8192 2>/dev/null)
  case "$EVENT" in
    stop) case "$PAYLOAD" in *'"status":"error"'*|*'"status": "error"'*) EVENT=error;; esac;;
  esac
  printf '{"continue":true,"permission":"allow"}\n'
fi
[ -n "$EVENT" ] && curl -s -m 1 -X POST "http://127.0.0.1:${PORT}/event?agent=${AGENT}&event=${EVENT}" >/dev/null 2>&1
exit 0
"#;

pub const RUN_SCRIPT: &str = r#"#!/bin/sh
# Wrap any command so the pet reacts: working while it runs, then happy (exit 0) or sad (non-zero).
# usage: wanwanchan-run [--agent name] <command> [args...]
AGENT="${WANWANCHAN_AGENT:-shell}"
if [ "$1" = "--agent" ]; then AGENT="$2"; shift 2; fi
N="$(dirname "$0")/wanwanchan-notify"
"$N" "$AGENT" working
"$@"
rc=$?
if [ $rc -eq 0 ]; then "$N" "$AGENT" completed; else "$N" "$AGENT" error; fi
exit $rc
"#;

pub const SHELL_ZSH: &str = r#"# WanWan-chan shell integration (zsh): long-running commands make the pet react.
# working after 5s, then happy on success / sad on failure. Short commands stay silent.
zmodload zsh/datetime 2>/dev/null
autoload -Uz add-zsh-hook
_pm_dir=${${(%):-%x}:A:h}
_pm_skip=(vim nvim vi nano emacs less more man top htop btop ssh mosh tail watch fzf claude codex cursor aider opencode gemini tmux screen)
_pm_preexec() {
  _pm_t=$EPOCHSECONDS
  _pm_skipthis=0
  (( ${_pm_skip[(Ie)${${(z)1}[1]}]} )) && _pm_skipthis=1
  (( _pm_skipthis )) && return
  { sleep 5; "$_pm_dir/wanwanchan-notify" shell working; } &!
  _pm_w=$!
}
_pm_precmd() {
  local rc=$?
  [[ -n ${_pm_w-} ]] && kill ${_pm_w} 2>/dev/null
  _pm_w=
  if [[ -n ${_pm_t-} && ${_pm_skipthis-0} -eq 0 ]] && (( EPOCHSECONDS - _pm_t >= 5 )); then
    if (( rc == 0 )); then "$_pm_dir/wanwanchan-notify" shell completed &!; else "$_pm_dir/wanwanchan-notify" shell error &!; fi
  fi
  _pm_t=
}
add-zsh-hook preexec _pm_preexec
add-zsh-hook precmd _pm_precmd
"#;

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn normalizes_known_events() {
        assert_eq!(normalize("UserPromptSubmit"), Some("thinking"));
        assert_eq!(normalize("PreToolUse"), Some("working"));
        assert_eq!(normalize("Stop"), Some("completed"));
        assert_eq!(normalize("agent-turn-complete"), Some("completed"));
        assert_eq!(normalize("session.error"), Some("error"));
        assert_eq!(normalize("PermissionRequest"), Some("waiting"));
        assert_eq!(normalize("StopFailure"), Some("error"));
        assert_eq!(normalize("bogus"), None);
    }
    #[test]
    fn classifies_claude_payloads() {
        let ask = json!({"tool_name": "AskUserQuestion", "tool_input": {"questions": [{"question": "Which  DB\nshould we use?"}]}});
        assert_eq!(classify("PreToolUse", &ask), Some(("waiting", Some("Which DB should we use?".into()))));
        assert_eq!(classify("PreToolUse", &json!({"tool_name": "ExitPlanMode"})).unwrap().0, "waiting");
        assert_eq!(classify("PreToolUse", &json!({"tool_name": "Bash"})), Some(("working", None)));
        let perm = json!({"tool_name": "Bash", "tool_input": {"command": "npm publish --access public"}});
        assert_eq!(classify("PermissionRequest", &perm), Some(("waiting", Some("Bash: npm publish --access public".into()))));
        let edit = json!({"tool_name": "Edit", "tool_input": {"file_path": "/a/b/main.rs"}});
        assert_eq!(classify("PermissionRequest", &edit).unwrap().1.as_deref(), Some("Edit: main.rs"));
        assert_eq!(classify("PermissionRequest", &Value::Null), Some(("waiting", None)));
        let n = |t: &str| json!({"notification_type": t, "message": "Claude needs your permission"});
        assert_eq!(classify("Notification", &n("permission_prompt")).unwrap().0, "waiting");
        assert_eq!(classify("Notification", &n("idle_prompt")), Some(("ignored", None)));
        assert_eq!(classify("Notification", &n("auth_success")), Some(("ignored", None)));
        assert_eq!(classify("Notification", &Value::Null), Some(("waiting", None)));
        assert_eq!(classify("bogus", &Value::Null), None);
        assert_eq!(short(&"x".repeat(100), 10).chars().count(), 10);
    }
    #[test]
    fn parses_query() {
        assert_eq!(query_param("/event?agent=claude&event=Stop", "agent").as_deref(), Some("claude"));
    }
}
