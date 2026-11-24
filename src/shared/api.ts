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
export interface LoadedCharacter { config: unknown; image: string; sound?: string | null }
export const listCharacters = () => invoke<CharacterInfo[]>("list_characters");
export const loadUserCharacter = (id: string) => invoke<LoadedCharacter>("load_character", { id });
export const importCharacter = (path: string, name: string) =>
  invoke<{ id: string; width: number; height: number }>("import_character", { path, name });
export const saveCharacterConfig = (id: string, config: unknown) =>
  invoke<void>("save_character_config", { id, config });
/** Copy an audio file in as the character's bubble sound; null removes it. */
export const setCharacterSound = (id: string, path: string | null) => invoke<void>("set_character_sound", { id, path });
export const deleteCharacter = (id: string) => invoke<void>("delete_character", { id });
export const readTextFile = (path: string) => invoke<string>("read_text_file", { path });
export const openCharactersDir = () => invoke<void>("open_characters_dir");
export const listMonitors = () => invoke<{ name: string; width: number; height: number }[]>("list_monitors");
export const petAction = (name: string) => invoke<void>("pet_action", { name });
export const agentEvent = (agent: string, event: string) => invoke<string>("agent_event", { agent, event });
export const agentHelperPath = () => invoke<string | null>("agent_helper_path");
export const exportCharacterPack = (id: string, path: string) => invoke<void>("export_character_pack", { id, path });
export const importCharacterPack = (path: string) => invoke<{ id: string; name: string }>("import_character_pack", { path });
export const focusApp = (bid: string) => invoke<void>("focus_app", { bid });
export const fetchUrlText = (url: string) => invoke<string>("fetch_url_text", { url });
export const openUrl = (url: string) => invoke<void>("open_url", { url });
export const listApps = () => invoke<string[]>("list_apps");
export const openApp = (name: string) => invoke<void>("open_app", { name });
export const focusPet = () => invoke<void>("focus_pet");
export const integrationStatus = () => invoke<Record<string, boolean>>("integration_status");
export const integrationSet = (agent: string, install: boolean) => invoke<string>("integration_set", { agent, install });
export const keyboardPermission = () => invoke<boolean>("keyboard_permission");
export const requestKeyboardPermission = () => invoke<boolean>("request_keyboard_permission");
export const openPrivacySettings = () => invoke<void>("open_privacy_settings");
export const saveCharacterImage = (id: string, dataUrl: string) => invoke<void>("save_character_image", { id, dataUrl });
export const loadCharacterOriginal = (id: string) => invoke<string>("load_character_original", { id });
export const readImageFile = (path: string) => invoke<string>("read_image_file", { path });
export const createCharacter = (name: string, dataUrl: string, config: unknown) =>
  invoke<string>("create_character", { name, dataUrl, config });
