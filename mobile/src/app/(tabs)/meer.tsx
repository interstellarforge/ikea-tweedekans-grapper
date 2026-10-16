import { MaterialIcons } from "@expo/vector-icons";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, Switch, View } from "react-native";

import { serverUrl } from "@/api/client.ts";
import { useAlerts } from "@/api/hooks.ts";
import { useAuth } from "@/auth/AuthContext.tsx";
import { Button, Card, Chip, Muted, Text } from "@/components/ui.tsx";
import { haptic, setHapticsEnabled } from "@/lib/haptics.ts";
import { readValue } from "@/lib/storage.ts";
import { registerForPush, unregisterPush } from "@/notifications/setup.ts";
import { space, useTheme } from "@/theme.ts";

export default function MoreScreen() {
  const t = useTheme();
  const router = useRouter();
  const { session, signOut } = useAuth();
  const alerts = useAlerts();
  const [haptics, setHaptics] = useState(true);
  const [pushOn, setPushOn] = useState(false);
  const [push, setPush] = useState("");
  const [server, setServer] = useState("");

  useEffect(() => {
    void readValue("haptics").then((v) => {
      setHaptics(v !== "0");
    });
    void serverUrl().then(setServer);
  }, []);

  const togglePush = async (on: boolean) => {
    if (on) {
      const state = await registerForPush();
      setPush(
        state === "enabled"
          ? "Meldingen staan aan op dit apparaat."
          : state === "denied"
            ? "Geef de app toestemming voor meldingen in de Android-instellingen."
            : "Pushmeldingen zijn op dit toestel of deze build niet beschikbaar.",
      );
      setPushOn(state === "enabled");
      if (state === "enabled") haptic.success();
      else haptic.warning();
    } else {
      await unregisterPush();
      setPushOn(false);
      setPush("Meldingen staan uit voor dit apparaat.");
    }
  };

  const row = {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    paddingVertical: space.sm,
  } as const;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ padding: space.md, gap: space.md }}
    >
      <Pressable
        onPress={() => {
          router.push("/meldingen");
        }}
      >
        <Card style={row}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: space.md,
            }}
          >
            <MaterialIcons name="notifications" size={22} color={t.brand} />
            <Text style={{ fontWeight: "800" }}>Meldingen</Text>
          </View>
          {alerts.data && alerts.data.unseen > 0 ? (
            <Chip kind="warn" label={`${String(alerts.data.unseen)} nieuw`} />
          ) : (
            <MaterialIcons name="chevron-right" size={22} color={t.muted} />
          )}
        </Card>
      </Pressable>

      <Card>
        <View style={row}>
          <Text style={{ flex: 1 }}>Meldingen op dit apparaat</Text>
          <Switch onValueChange={(v) => void togglePush(v)} value={pushOn} />
        </View>
        {push ? <Muted>{push}</Muted> : null}
        <View style={row}>
          <Text style={{ flex: 1 }}>Haptische feedback</Text>
          <Switch
            value={haptics}
            onValueChange={(v) => {
              setHaptics(v);
              void setHapticsEnabled(v).then(() => {
                if (v) haptic.success();
              });
            }}
          />
        </View>
      </Card>

      <Card style={{ gap: space.sm }}>
        <Text style={{ fontWeight: "800" }}>Account</Text>
        <Muted>{session?.email ?? ""}</Muted>
        <Muted>{`Server: ${server}`}</Muted>
        <Button
          label="Instellingen op de website"
          variant="secondary"
          onPress={() => void Linking.openURL(`${server}/settings`)}
        />
        <Button
          label="Uitloggen"
          variant="danger"
          onPress={() => void signOut()}
        />
      </Card>

      <Muted>
        {`Tweedekanshoek ${Constants.expoConfig?.version ?? ""} · onofficieel project, niet gelieerd aan IKEA.`}
      </Muted>
    </ScrollView>
  );
}
