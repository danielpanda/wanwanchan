// Static tray menu labels (spec §11.2): plain text, no emoji in the menu bar.
// Electron-free so the "no emoji" guard stays unit-testable under node --test,
// same as sizes.ts/skins.ts (importing 'electron' outside the app is a no-op).
export const TRAY_LABELS = {
  header: (summary: string): string => `WanWan-chan — ${summary}`,
  companionHub: 'Companion Hub…',
  grantAccessibility: 'Grant Accessibility…',
  clickThrough: 'Click-Through Mode',
  size: 'Size',
  skin: 'Skin',
  resetPosition: 'Reset Position',
  quit: 'Quit WanWan-chan',
}
