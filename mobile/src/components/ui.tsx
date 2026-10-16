import {
  ActivityIndicator,
  Image,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text as RNText,
  View,
  type ViewStyle,
} from "react-native";

import { haptic } from "@/lib/haptics.ts";
import { radius, space, useTheme } from "@/theme.ts";

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: t.surface, borderColor: t.line },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Muted({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <RNText style={{ color: t.muted, fontSize: 13 }}>{children}</RNText>;
}

export function Heading({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <RNText style={{ color: t.fg, fontSize: 22, fontWeight: "800" }}>
      {children}
    </RNText>
  );
}

type ChipKind = "neutral" | "good" | "bad" | "info" | "warn";

export function Chip({
  label,
  kind = "neutral",
}: {
  label: string;
  kind?: ChipKind;
}) {
  const t = useTheme();
  const colors: Record<ChipKind, { bg: string; fg: string }> = {
    neutral: { bg: t.surface2, fg: t.fg },
    good: { bg: t.goodBg, fg: t.good },
    bad: { bg: t.badBg, fg: t.bad },
    info: { bg: t.infoBg, fg: t.info },
    warn: { bg: t.warnBg, fg: t.warn },
  };
  const c = colors[kind];
  return (
    <View style={[styles.chip, { backgroundColor: c.bg }]}>
      <RNText style={{ color: c.fg, fontSize: 12, fontWeight: "700" }}>
        {label}
      </RNText>
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  busy = false,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  busy?: boolean;
}) {
  const t = useTheme();
  const bg =
    variant === "primary"
      ? t.yellow
      : variant === "danger"
        ? t.badBg
        : t.surface2;
  const fg =
    variant === "primary" ? "#111A24" : variant === "danger" ? t.bad : t.fg;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={() => {
        haptic.tick();
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
      ]}
    >
      {busy ? (
        <ActivityIndicator color={fg} />
      ) : (
        <RNText style={{ color: fg, fontWeight: "800", fontSize: 15 }}>
          {label}
        </RNText>
      )}
    </Pressable>
  );
}

export function Thumb({
  uri,
  size = 64,
}: {
  uri: string | undefined;
  size?: number;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius.sm,
        backgroundColor: "#FFFFFF",
        borderColor: t.line,
        borderWidth: StyleSheet.hairlineWidth,
        overflow: "hidden",
      }}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size }}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      ) : null}
    </View>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <View style={{ padding: space.xl, alignItems: "center" }}>
      <Muted>{children}</Muted>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: space.md,
  },
  chip: {
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  button: {
    minHeight: 46,
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    alignItems: "center",
    justifyContent: "center",
  },
});

/** Text with the theme's foreground colour by default (React Native's Text is always black). */
export function Text({ style, ...props }: React.ComponentProps<typeof RNText>) {
  const t = useTheme();
  return <RNText {...props} style={[{ color: t.fg }, style]} />;
}
