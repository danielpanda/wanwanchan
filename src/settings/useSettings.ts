import { useCallback, useEffect, useRef, useState } from "react";
import { getSettings, onSettings, setSettings } from "../shared/api";
import { DEFAULT_SETTINGS, withDefaults, type Settings } from "../shared/types";

type Patch = Record<string, unknown>;

function deepMerge<T>(base: T, patch: Patch): T {
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object"
      ? deepMerge(out[k], v as Patch) : v;
  }
  return out;
}

/** Local state updates immediately; changes are sent to Rust in small batches (slider-friendly). */
export function useSettings() {
  const [settings, setLocal] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const pending = useRef<Patch>({});
  const timer = useRef<number | undefined>();

  useEffect(() => {
    let un: (() => void) | undefined;
    getSettings().then((s) => { setLocal(s); setReady(true); });
    onSettings((s) => setLocal(s)).then((u) => (un = u));
    return () => un?.();
  }, []);

  const update = useCallback((patch: Patch) => {
    setLocal((s) => withDefaults(deepMerge(s, patch) as Settings));
    pending.current = deepMerge(pending.current, patch);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const p = pending.current;
      pending.current = {};
      void setSettings(p);
    }, 70);
  }, []);

  return { settings, update, ready };
}
