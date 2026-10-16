import * as Notifications from "expo-notifications";
import { useRouter } from "expo-router";
import { useEffect, useRef } from "react";

import { registerForPush } from "./setup.ts";

type PushData = { articleNumber?: string };

/** Registers for push once signed in and opens the product when a notification is tapped. */
export function useNotificationRouting(enabled: boolean): void {
  const router = useRouter();
  const last = Notifications.useLastNotificationResponse();
  const handled = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!enabled) return;
    void registerForPush();
    const sub = Notifications.addPushTokenListener(() => {
      void registerForPush();
    });
    return () => {
      sub.remove();
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !last) return;
    const id = last.notification.request.identifier;
    if (handled.current === id) return;
    handled.current = id;
    const data = last.notification.request.content.data as PushData;
    if (data.articleNumber) {
      router.push({
        pathname: "/product/[article]",
        params: { article: data.articleNumber },
      });
    } else {
      router.push("/meldingen");
    }
  }, [enabled, last, router]);
}
