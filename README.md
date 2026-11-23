# WanWan-chan

A lightweight pixel french bulldog that lives on your macOS desktop. Transparent, always on top, click-through everywhere except the dog itself. Built with Tauri 2 + Rust, with a React/Tailwind settings window and a plain-TypeScript Canvas 2D renderer. Fully offline.

- Menu bar app (no Dock icon), draggable, remembers its position, multi-monitor aware
- 14 animated states driven by a priority-based state machine (idle, blink, walk, run, sit, sleep, look, typing, jump, happy, thinking, drag, drop, error)
- Reacts to mouse (looks at the cursor, jumps on click, optional cursor-follow) and keyboard (types along, gets excited when you type fast)
- Bring your own sprites (transparent PNG or sprite sheet + JSON), no source edits
- Optional AI-agent awareness through a local-only endpoint

## Install

**From a DMG** – open `WanWan-chan_0.2.2_universal.dmg`, drag WanWan-chan to Applications, launch it.
Builds from this repo are ad-hoc signed, not notarized. If Gatekeeper blocks a *downloaded* copy: right-click → Open, or
`xattr -dr com.apple.quarantine /Applications/WanWan-chan.app`.

**Homebrew (custom tap)** – after you publish a release, see `Casks/wanwanchan.rb`:

```bash
brew tap YOUR_GITHUB_USER/wanwanchan
brew install --cask wanwanchan
```

## Develop

Requirements: macOS 11+, Node 18+, Rust (stable), Xcode Command Line Tools.

```bash
npm install
npm run tauri dev      # run the app
npm test               # vitest: state machine + sprite config
(cd src-tauri && cargo test)
npm run tauri build    # WanWan-chan.app + DMG in src-tauri/target/release/bundle/
npm run release        # same, and prints the sha256 for the Homebrew cask
npm run assets         # regenerate the default dog, app icon and tray icon
```

Relaunching the app (Finder/Spotlight) opens Settings. The menu bar icon has Show/Hide, Always on Top, Jump, Reset Position, Settings and Quit.

## Permissions

| Feature | Permission | Notes |
|---|---|---|
| Mouse look / click-through | none | Event-driven global mouse-move monitor |
| Typing reaction | **Input Monitoring** | Only *that* a key was pressed is observed; key codes and characters are never read, stored or sent. Grant it in Settings → Behavior → Keyboard. If you skip it, everything else still works. |
| Launch at login | none | Uses a LaunchAgent |
| AI integration | none | Listens on `127.0.0.1` only, and only while enabled |

## Speech bubbles & reminders

Settings → **Notifications**. The character talks through pixel-style speech bubbles (Bahasa Indonesia or English):

Bubbles are kept for things that matter; small talk is off by default.

- **Reminders** – drink water and stretch (on by default; for stretch the character grows to fill the screen and stretches with you), eye rest (20-20-20), posture, lunch, bedtime (with a yawn), plus custom ones: repeat every N minutes, daily at a time, or a one-time **message reminder** that switches itself off. Reminders have *Later 10m* / *OK* buttons, wait for a pause while you are typing, and are held back during **quiet hours**.
- **Your name** – reminders and greetings address you by name. **Pinned note** – a short note that always floats above the head.
- **Pomodoro** (Settings → Behavior, or the menu bar) – focus / short break / long break loop with a clock above the head and a bubble at every phase change.
- **Peek mode** (Settings → Behavior, or the menu bar) – the character hides at the right screen edge, stays quiet, and only comes out for reminders.
- **Extras** – one greeting per launch, welcome back after a long break, optional random chatter, "Geli ih!" when poked / "Hehe, enak~" when petted, agent updates (done / error / needs you), a break suggestion after ~45 min of non-stop typing (only key *counts* are used), and a scroll animation while you scroll a page.
- Optional 8-bit blip sound. Everything is driven by a single timer armed for the next due item, so there is no polling.

## Custom characters

**Recommended: build it state by state** (Settings → Character → *New character*). Each state is one PNG with its frames in a single row (for example 4 frames side by side) on a green-screen or magenta background:

1. Rows can be PNG or JPG (Gemini / ChatGPT output works). Open **Row guide & AI prompt** for the rules (one horizontal row, 256×256 px square cells, 4 frames = 1024×256, ~15% margin, flat `#00FF00` / `#FF00FF`) and a copy-paste prompt for any image AI.
2. Pick the **Idle** row to create the character, then *Import row…* for every other state.
3. The background is keyed out everywhere (also between frames and under legs), green spill on outlines is removed, upscaled pixel art is restored, and the frame count is detected from the gaps between sprites (or set it yourself).
4. Rows are packed into one sheet, bottom-aligned so the feet stay on the ground.

A character can't be used until the required states have their own row: Idle, Walk, Sit, Sleep, Jump, Drag, Happy, Typing. Until then the pet keeps showing the default cat. Optional states borrow a related animation (Scroll uses Typing, Peek uses Sit) or fall back to Idle. Generate every row on the same canvas size so the scale stays consistent.

**Quick import** (one PNG or a full sheet) **does the cleanup for you** (Settings → Character → *Import PNG…*; both steps can be switched off):

1. **Clean up** – removes a solid background by flood-filling from the border (white eyes etc. inside the subject are kept, and background trapped between the legs is cleared), detects pixel art that was enlarged by an integer factor and restores the native pixels so it stays crisp, and shrinks other large images smoothly.
2. **Animate** – a single still image gets a full generated animation set (breathing, waddle, run, jump, squash, sleep, hearts, …) using pixel-exact squash/stretch, lean and lift. Sprite sheets are split into frames automatically and left as-is.

The original is kept, so *Re-process* can redo it with different options.

Settings → Character → **Import PNG…** copies your image to
`~/Library/Application Support/com.wanwanchan.app/characters/<id>/` as `sheet.png` + `sprite.json`. Set the frame size, use *Auto-split rows* or define animations, and map them to states. You can also drop your own folder there. `sprite.json`:

```json
{
  "name": "My Pet",
  "frameWidth": 32,
  "frameHeight": 32,
  "animations": {
    "idle": { "start": 0, "count": 2, "fps": 3, "loop": true },
    "walk": { "start": 8, "count": 4, "fps": 8 },
    "peek": { "frames": [3, 2, 3, 4], "fps": 4 }
  },
  "states": { "idle": "idle", "walk": "walk", "look": "peek" }
}
```

Frames are numbered left-to-right, top-to-bottom. Sprites should face **right** (the app mirrors them). Any state without a mapping falls back to the animation with the same name, then `idle`; `blink` is skipped if absent. The default cat is generated by `tools/make-assets.mjs`.

## AI coding agents

**Fastest way:** Settings → AI Integration → *Connect your tools*. One click installs (and removes) the hooks for Claude Code, Cursor, Codex and OpenCode, and a zsh integration for **any command** (builds, tests, scripts, and agents without hooks such as Antigravity). Config files are backed up (`*.bak-wanwanchan-<time>`), existing hooks are kept, and installing twice never duplicates entries.

| Pet reaction | Meaning |
|---|---|
| thinking pose | agent got your prompt |
| typing on a laptop | running tools / commands |
| looking around + bubble | waiting for your permission / input |
| happy + hearts + bubble "(2m 14s)" | finished |
| sad + sweat drop | failed |

Wrap any command by hand with `wanwanchan-run npm test` (it keeps the command's exit code). The terminal integration stays silent for commands under 5 s and for interactive programs (vim, ssh, claude, …).

Manual setup details:

Enable Settings → AI Integration. WanWan-chan then listens on `127.0.0.1:47321` for events and maps normalized states to animations: thinking → thinking, working → typing, waiting → looking around, completed → happy, error → sad. Settings has copy-paste setup snippets and a **Test animation** simulator.

Send events with the helper (written to `~/Library/Application Support/com.wanwanchan.app/bin/wanwanchan-notify`) or plain HTTP:

```bash
curl -X POST "http://127.0.0.1:47321/event?agent=custom&state=thinking"
```

The integrations are **not equivalent**, because the tools expose different things:

| Agent | Mechanism | What you get |
|---|---|---|
| Claude Code | [hooks](https://docs.claude.com/en/docs/claude-code/hooks) in `~/.claude/settings.json` | thinking, working, waiting, completed |
| OpenAI Codex CLI | `notify` in `~/.codex/config.toml` | completion only |
| Cursor | [hooks.json](https://cursor.com/docs/agent/hooks) | prompt submitted, file edited, stop; behavior varies by version |
| OpenCode | plugin in `~/.config/opencode/plugins/` | session idle/error and tool use (event names from its plugin docs) |
| Google Antigravity | none that I could verify | use the generic endpoint or simulator |

Snippets for Cursor, OpenCode and Codex were written from documentation, not tested against live installs of those tools; check each tool's current docs if something doesn't fire.

## Architecture

```
src-tauri/src
  lib.rs         windows, tray, commands, applying settings
  input.rs       NSEvent global monitors (mouse, key count) + Input Monitoring check
  agents.rs      127.0.0.1 listener, event normalization
  characters.rs  user sprite storage and validation
  settings.rs    JSON settings (settings.json in the app config dir)
src/pet          renderer: fsm.ts (priority state machine), sprite.ts, pet.ts
src/settings     React settings UI
```

The pet window covers one monitor, is transparent, and ignores the mouse except while the cursor is over an opaque sprite pixel. Movement is a CSS transform snapped to device pixels, so the sprite is never smoothed. Timers wake only for the next sprite frame or state expiry; a render loop only runs while moving, jumping or dragging; hiding the character stops everything.
