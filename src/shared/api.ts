import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { withDefaults, type Settings } from "./types";

export const getSettings = async (): Promise<Settings> => withDefaults(await invoke("get_settings"));
export const setSettings = async (patch: Record<string, unknown>): Promise<Settings> =>
  withDefaults(await invoke("set_settings", { patch }));

export function onSettings(cb: (s: Settings) => void): Promise<UnlistenFn> {
  return listen<Settings>("settings-changed", (e) => cb(withDefaults(e.payload)));
}

export interface CharacterInfo { id: string; name: string; builtin: boolean }
export interface LoadedCharacter { config: unknown; image: string }
export const listCharacters = () => invoke<CharacterInfo[]>("list_characters");
export const loadUserCharacter = (id: string) => invoke<LoadedCharacter>("load_character", { id });
export const importCharacter = (path: string, name: string) =>
  invoke<{ id: string; width: number; height: number }>("import_character", { path, name });
export const saveCharacterConfig = (id: string, config: unknown) =>
  invoke<void>("save_character_config", { id, config });
export const deleteCharacter = (id: string) => invoke<void>("delete_character", { id });
export const readTextFile = (path: string) => invoke<string>("read_text_file", { path });
export const openCharactersDir = () => invoke<void>("open_characters_dir");
export const listMonitors = () => invoke<{ name: string; width: number; height: number }[]>("list_monitors");
export const petAction = (name: string) => invoke<void>("pet_action", { name });
export const agentEvent = (agent: string, event: string) => invoke<string>("agent_event", { agent, event });
export const agentHelperPath = () => invoke<string | null>("agent_helper_path");
export const integrationStatus = () => invoke<Record<string, boolean>>("integration_status");
export const integrationSet = (agent: string, install: boolean) => invoke<string>("integration_set", { agent, install });
export const keyboardPermission = () => invoke<boolean>("keyboard_permission");
export const requestKeyboardPermission = () => invoke<boolean>("request_keyboard_permission");
export const openPrivacySettings = () => invoke<void>("open_privacy_settings");
export const saveCharacterImage = (id: string, dataUrl: string) => invoke<void>("save_character_image", { id, dataUrl });
export const loadCharacterOriginal = (id: string) => invoke<string>("load_character_original", { id });
