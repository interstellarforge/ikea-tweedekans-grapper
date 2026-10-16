import * as SecureStore from "expo-secure-store";

const KEYS = {
  token: "device-token",
  serverUrl: "server-url",
  haptics: "haptics-enabled",
} as const;

type Key = keyof typeof KEYS;

export async function readValue(key: Key): Promise<string | undefined> {
  return (await SecureStore.getItemAsync(KEYS[key])) ?? undefined;
}

export async function writeValue(key: Key, value: string): Promise<void> {
  await SecureStore.setItemAsync(KEYS[key], value);
}

export async function removeValue(key: Key): Promise<void> {
  await SecureStore.deleteItemAsync(KEYS[key]);
}
