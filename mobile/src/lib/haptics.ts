import * as Haptics from "expo-haptics";

import { readValue, writeValue } from "./storage.ts";

let enabled = true;

/** Loads the user's preference once at startup. */
export async function loadHapticsPreference(): Promise<boolean> {
  enabled = (await readValue("haptics")) !== "0";
  return enabled;
}

export async function setHapticsEnabled(value: boolean): Promise<void> {
  enabled = value;
  await writeValue("haptics", value ? "1" : "0");
}

const run = (action: () => Promise<void>): void => {
  if (enabled) void action().catch(() => undefined);
};

/** Short, purposeful feedback: tick for small changes, success/warning for outcomes. */
export const haptic = {
  tick: () => {
    run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },
  select: () => {
    run(() => Haptics.selectionAsync());
  },
  success: () => {
    run(() =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    );
  },
  warning: () => {
    run(() =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning),
    );
  },
  error: () => {
    run(() =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
    );
  },
};
