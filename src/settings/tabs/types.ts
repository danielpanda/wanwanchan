import type { Settings } from "../../shared/types";
export interface TabProps {
  settings: Settings;
  update: (patch: Record<string, unknown>) => void;
}
