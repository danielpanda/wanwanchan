# WanWan-chan

A tiny macOS desktop companion: an animated Agumon that sits on your screen,
breathes, watches your cursor, reacts to your typing, overheats, dozes off when
you idle, and plays an evolution cutscene when it is time to stretch.
Electron + 2D canvas; all sprites ship with the repo.

> **Fan-art notice:** Agumon and Digimon are © Bandai / Toei Animation. This is a
> non-commercial fan project, not affiliated with or endorsed by the rights
> holders.

## Features

- Idle breathing, blinking, cursor-tracking eyes
- Typing detection (global input hooks) with paw animation
- Overheat steam, sleep mode, drag-me-anywhere with dizzy reaction
- Petting, speech bubbles, pomodoro timer badge, sound effects
- Agumon evolution cutscene on stretch reminders

## Run

```sh
npm install
npm run dev
```

## Verify

```sh
npm test && npm run typecheck
```

## Build (macOS arm64 dmg)

```sh
npm run build:mac
```
