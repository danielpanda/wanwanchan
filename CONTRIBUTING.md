# Contributing to WanWan-chan

Thanks for wanting to help! This is a small, focused project — the bar is
"works, tested, fits the existing style", not "enterprise-grade".

## Getting set up

```sh
git clone https://github.com/danielpanda/wanwanchan.git
cd wanwanchan
npm install
npm run dev
```

Requirements: Node.js 20+, npm, macOS (the app is macOS-first for now).

## Before you open a PR

```sh
npm test           # must pass
npm run typecheck  # must pass
```

- Keep changes vertical and small — one feature or fix per PR.
- Add or update a test for any behavior you change. Tests are plain
  `node:test` files next to the source (`*.test.ts`) — follow that pattern.
- Match the existing code style: TypeScript strict, standard-library first,
  no new dependencies unless there's a strong reason (say why in the PR if
  you add one).
- Pure state machines live in `src/renderer/` and `src/main/` with unit
  tests; Electron glue stays thin around them.

## Commit style

Conventional commits, same as the repo history:

```
feat: add winking expression
fix: sleep timer resetting on mouse jitter
refactor: extract pupil offset math into eyes.ts
test: cover overheat -> idle cooldown
docs: explain the compose pipeline in skins.md
```

## Reporting bugs

Open an issue with:

- macOS version and chip (Apple Silicon / Intel)
- WanWan-chan version (tray menu → About, or the DMG name)
- What you did, what you expected, what happened
- Console output if you ran from source (`npm run dev`)

## Feature ideas

Animation states, new skins (a skin is a set of sprite sheets + `skin.json`,
see `docs/skins.md`), and tray quality-of-life are all fair game. For bigger
changes, open an issue first so we can align before you build it.

## Legal note

Contributions must be your own work. Don't commit copyrighted sprite art you
don't have the right to redistribute — original pixel art in the existing
style is preferred (see `docs/adr/0001-ai-art-source-plus-compose.md` for the
art pipeline).
