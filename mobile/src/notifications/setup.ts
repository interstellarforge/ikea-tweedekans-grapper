import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { send } from "@/api/client.ts";

const BRAND = "#0058A3";

/** Channel ids must match what the server sends (`channelId` in the push payload). */
export const CHANNELS = {
  offers: "offers",
  priceDrops: "price-drops",
  trips: "trips",
} as const;

export function configureNotifications(): void {
  Notifications.setNotificationHandler({
    handleNotification: () =>
      Promise.resolve({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
  });
}

async function ensureChannels(): Promise<void> {
  if (Platform.OS !== "android") return;
  const base = {
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 200, 120, 200],
    lightColor: BRAND,
  };
  await Promise.all([
    Notifications.setNotificationChannelAsync(CHANNELS.offers, {
      ...base,
      name: "Nieuw aanbod",
      description: "Een product van je watchlist ligt in een gevolgd filiaal.",
    }),
    Notifications.setNotificationChannelAsync(CHANNELS.priceDrops, {
      ...base,
      name: "Prijsdalingen",
      description: "Een aanbieding is goedkoper dan eerder gemeten.",
    }),
    Notifications.setNotificationChannelAsync(CHANNELS.trips, {
      ...base,
      importance: Notifications.AndroidImportance.DEFAULT,
      name: "Rit rendabel",
      description: "Een rit of route loont nu.",
    }),
  ]);
}

export type PushState = "enabled" | "denied" | "unavailable";

/** Asks permission, then registers this device's FCM token with the server. */
export async function registerForPush(): Promise<PushState> {
  await ensureChannels();
  if (!Device.isDevice) return "unavailable";
  const current = await Notifications.getPermissionsAsync();
  const granted =
    current.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return "denied";
  try {
    const token = await Notifications.getDevicePushTokenAsync();
    await send("/api/mobile/push-token", "PUT", {
      pushToken: String(token.data),
    });
    return "enabled";
  } catch {
    // Without google-services.json (no Firebase project yet) there is no FCM token.
    return "unavailable";
  }
}

export async function unregisterPush(): Promise<void> {
  await send("/api/mobile/push-token", "PUT", { pushToken: null });
}
