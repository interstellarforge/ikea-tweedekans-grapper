import { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { defaultServerUrl, errorMessage } from "@/api/client.ts";
import { useAuth } from "@/auth/AuthContext.tsx";
import { Button } from "@/components/ui.tsx";
import { haptic } from "@/lib/haptics.ts";
import { radius, space, useTheme } from "@/theme.ts";

export default function LoginScreen() {
  const t = useTheme();
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [serverUrl, setServerUrl] = useState(defaultServerUrl());
  const [showServer, setShowServer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const input = {
    backgroundColor: t.surface,
    borderColor: t.line,
    color: t.fg,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    minHeight: 48,
    fontSize: 16,
  } as const;

  const submit = async () => {
    setError("");
    setBusy(true);
    try {
      await signIn({ email: email.trim(), password, serverUrl });
      haptic.success();
    } catch (e) {
      haptic.error();
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.brand }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ padding: space.xl, paddingBottom: 40 }}>
            <Text style={{ color: "#FFFFFF", fontSize: 30, fontWeight: "800" }}>
              Tweedekanshoek
            </Text>
            <Text style={{ color: "#FFFFFF", opacity: 0.9, marginTop: 6 }}>
              Weet wanneer jouw IKEA-spullen in de tweedekanshoek liggen.
            </Text>
          </View>
          <View
            style={{
              flex: 1,
              backgroundColor: t.bg,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
              padding: space.xl,
              gap: space.md,
            }}
          >
            <Text style={{ color: t.fg, fontSize: 22, fontWeight: "800" }}>
              Inloggen
            </Text>
            <TextInput
              style={input}
              placeholder="E-mailadres"
              placeholderTextColor={t.muted}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={input}
              placeholder="Wachtwoord"
              placeholderTextColor={t.muted}
              secureTextEntry
              autoComplete="current-password"
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={() => void submit()}
            />
            {showServer ? (
              <TextInput
                style={input}
                placeholder="Server"
                placeholderTextColor={t.muted}
                autoCapitalize="none"
                keyboardType="url"
                value={serverUrl}
                onChangeText={setServerUrl}
              />
            ) : null}
            {error ? <Text style={{ color: t.bad }}>{error}</Text> : null}
            <Button
              label="Inloggen"
              busy={busy}
              disabled={!email || !password}
              onPress={() => void submit()}
            />
            <Text
              onPress={() => {
                setShowServer((v) => !v);
              }}
              style={{ color: t.brand, textAlign: "center", padding: space.sm }}
            >
              {showServer ? "Server verbergen" : "Eigen server gebruiken"}
            </Text>
            <Text style={{ color: t.muted, fontSize: 12, textAlign: "center" }}>
              Onofficieel project, niet gelieerd aan IKEA. Account maken kan op
              de website.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
