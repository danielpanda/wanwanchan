<div align="center">

# WanWan-chan

**An animated Agumon desktop companion for macOS**

It idles. It watches you type. It naps when you go quiet, overheats when you
type too fast — and digivolves when you've earned it.

[Latest release](https://github.com/danielpanda/wanwanchan/releases/latest) · [Contributing](CONTRIBUTING.md) · [MIT License](LICENSE.md)

Electron · TypeScript · Apple Silicon & Intel

⭐ **Like it?** A star on the repo helps a solo project get noticed — it's free
and it means a lot.

</div>

---

## Features

- **Reacts to your typing** — a global keystroke-per-second counter drives the
  animation state: idle → typing → **overheat** (tongue out, steam, rapid
  paw-drumming) as you speed up.
- **Sleeps when you're away** — no input for a while and it dozes off, with a
  transition pose and a wake-up grumble.
- **Eyes follow your cursor** — a separate pupil layer tracks pointer angle in
  real time.
- **Pick it up** — press and drag to lift it; it dangles from the grab point,
  stretches, wobbles, then falls, squashes and goes dizzy on release.
- **Pet it** — click gently and it smiles; expressions include happy, laugh and
  confused.
- **Pomodoro timer** — a tray-driven focus timer with a badge over the sprite,
  plus a stretch reminder that triggers the full-screen
  **Agumon → WarGreymon evolution cutscene** (Agumon skin only).
- **Ghost Mode** — click-through: the pet stays visible but passes all mouse
  events to the apps beneath it.
- **Two skins** — Agumon and Black French Bulldog, switchable from the tray.
- **AI agent status** — a local webhook lets coding agents
  ([Claude Code](https://claude.com/claude-code), Aider, anything that can
  `curl`) show `thinking` / `done` state on the pet.
- Sounds, speech bubbles and steam particles included.

## Download

Grab a `.dmg` from the [releases page](https://github.com/danielpanda/wanwanchan/releases/latest):

| File | Mac |
|---|---|
| `WanWan-chan-<version>-arm64.dmg` | Apple Silicon (M1/M2/M3/M4) |
| `WanWan-chan-<version>-x64.dmg` | Intel |

### First launch

1. Drag **WanWan-chan** to `Applications`.
2. The build is unsigned, so Gatekeeper will complain on first open.
   Easiest fix after the "blocked" dialog:

   ```sh
   xattr -cr /Applications/WanWan-chan.app
   ```

   …or allow it via **System Settings → Privacy & Security → Open Anyway**.
3. Grant **Accessibility** permission when prompted
   (**System Settings → Privacy & Security → Accessibility**). The keystroke
   counter needs it; nothing is logged or sent anywhere — the count is kept in
   memory only.

## Agent webhook & Claude Code Integration

The app listens on `127.0.0.1:3721` (localhost only) for agent status:

```sh
curl -X POST http://127.0.0.1:3721/agent/status \
  -H 'Content-Type: application/json' \
  -d '{"status":"thinking","agent":"claude-code","message":"Running tests..."}'

# status: "idle" | "thinking" | "approval" | "error" | "done"
```

### Automatic Claude Code Hooks

You can automatically connect Agumon to your [Claude Code](https://claude.com/claude-code) terminal sessions so Agumon thinks when Claude runs tools, alerts you with a chime when terminal approval is needed, and does a happy hop on task completion:

```sh
# One-time setup: registers lifecycle hooks in ~/.claude/settings.json
npm run hooks:install

# To uninstall hooks later if needed:
npm run hooks:uninstall
```

Supported Claude Code events:
- `UserPromptSubmit`: Agumon enters thinking gaze and shows a thought bubble.
- `PreToolUse`: Shows the active tool ticker (e.g. `Bash: npm test`, `Edit: file.ts`).
- `PermissionRequest`: Alerts you that Claude Code needs permission/approval in the terminal (`Approval required! ⚠️`).
- `Stop`: Happy hop animation with celebratory completion chime 🎉.
- `StopFailure`: Confused/error alert on failed execution ❌.
- `SessionEnd`: Resets back to idle.

The relay hook script is non-blocking (max 250ms timeout) and fail-safe, so Claude Code is never slowed down even when WanWan-chan is closed.

## Build from source

Requires Node.js 20+ and npm.

```sh
npm install
npm run dev          # run in dev mode
npm test             # unit tests (node:test)
npm run typecheck    # tsc --noEmit
npm run build:mac    # DMGs for arm64 + x64 into dist/
```

## Project layout

```
src/main/       Electron main: window, tray, input hook, AI webhook, settings
src/preload/    Context bridge
src/renderer/   Animation state machines: idle, typing, sleep, drag, petting,
                overheat/steam, evolution cutscene, timer badge
assets/sprites/ Composed sprite sheets (one strip per state, per skin)
scripts/        Sprite composition and asset pipeline
docs/           ADRs, specs, skin docs
```

Domain vocabulary and architecture notes live in [`CONTEXT.md`](CONTEXT.md)
and [`docs/adr/`](docs/adr/).

## Contributing

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Legal

This is an **unofficial fan project**. Agumon and Digimon are trademarks of
their respective owners (Bandai Namco Entertainment / Toei Animation). This
project is not affiliated with or endorsed by them, is free, and is
non-commercial. The sprites are fan art; if you are a rights holder and want
something removed, please [open an issue](https://github.com/danielpanda/wanwanchan/issues)
and it will be taken down promptly.

## License

Code is released under the [MIT License](LICENSE.md). The sprite art in
`assets/` is fan art and not licensed for commercial use — see *Legal* above.
