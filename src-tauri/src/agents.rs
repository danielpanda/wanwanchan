//! Optional local event interface for AI coding agents.
//! A tiny HTTP server bound to 127.0.0.1 receives `POST /event?agent=<id>&event=<name>`
//! (or `state=<name>`) from agent hooks and forwards a *normalized* state to the pet.
//! The server thread blocks on accept(); there is no polling.

use serde_json::{json, Value};
use std::{io::Read, sync::Arc, thread};
use tauri::{AppHandle, Emitter};
use tiny_http::{Response, Server};

pub type ServerHandle = Arc<Server>;

/// Normalized agent states: idle | thinking | working | waiting | completed | error
pub fn normalize(raw: &str) -> Option<&'static str> {
    let key: String = raw.chars().filter(|c| !matches!(c, '-' | '_' | '.' | ' ')).collect::<String>().to_lowercase();
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

pub fn dispatch(app: &AppHandle, agent: &str, raw: &str) -> Result<&'static str, String> {
    let state = normalize(raw).ok_or_else(|| format!("unknown event '{raw}'"))?;
    let agent: String = agent.chars().filter(|c| c.is_ascii_alphanumeric()).take(24).collect();
    let agent = if agent.is_empty() { "custom".to_string() } else { agent.to_lowercase() };
    let _ = app.emit("agent-event", json!({ "agent": agent, "state": state, "raw": raw }));
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
                if ev.is_none() {
                    let mut body = String::new();
                    let _ = req.as_reader().take(4096).read_to_string(&mut body);
                    if let Ok(v) = serde_json::from_str::<Value>(&body) {
                        agent = agent.or_else(|| v.get("agent").and_then(Value::as_str).map(String::from));
                        ev = ["event", "state", "hook_event_name", "type"]
                            .iter()
                            .find_map(|k| v.get(*k).and_then(Value::as_str).map(String::from));
                    }
                }
                let res = match ev {
                    Some(e) => dispatch(&app, agent.as_deref().unwrap_or("custom"), &e),
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
    fn parses_query() {
        assert_eq!(query_param("/event?agent=claude&event=Stop", "agent").as_deref(), Some("claude"));
    }
}
