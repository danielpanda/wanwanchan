# Security Policy

## Supported versions

WanWan-chan is released as unsigned macOS DMGs. Only the latest release is
supported.

| Version | Supported |
| ------- | --------- |
| 0.1.3   | ✅ |
| < 0.1.3 | ❌ |

## Reporting a vulnerability

Please **do not** open a public issue for security issues — that would disclose
the vulnerability before a fix ships.

Report privately instead:

1. Email **danielvalefor47@gmail.com** with:
   - A description of the issue and its impact
   - Steps to reproduce (a minimal example is ideal)
   - Any relevant version / platform details
2. I'll acknowledge within 48 hours and aim to triage within a week.
3. Once a fix is ready, I'll publish it and credit you in the release notes
   (unless you prefer to stay anonymous).

## Scope

In scope: anything in this repository — the Electron main/preload/renderer
code, the local agent webhook server (`127.0.0.1:3721`), the input-hook usage,
and the build/asset pipeline.

Out of scope: issues that require an attacker to already have local code
execution on your machine.

## Notes for users

- The app is **unsigned**. Verify downloads from the official
  [releases](https://github.com/danielpanda/wanwanchan/releases) page.
- The keystroke counter requires macOS **Accessibility** permission. It is
  counted in memory only and never sent anywhere.
- The agent webhook binds to `127.0.0.1` (localhost only) and does not accept
  connections from the network.
