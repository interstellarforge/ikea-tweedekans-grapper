import { useColorScheme } from "react-native";

// Tokens mirror the web design system (DESIGN.md): IKEA blue/yellow, cool neutrals.
const light = {
  bg: "#F3F5F8",
  surface: "#FFFFFF",
  surface2: "#EAEEF3",
  fg: "#111A24",
  muted: "#566170",
  line: "#D9DFE7",
  brand: "#0058A3",
  brandFg: "#FFFFFF",
  yellow: "#FFDB00",
  good: "#0E7A3D",
  goodBg: "#E3F4EA",
  bad: "#B3261E",
  badBg: "#FBE7E5",
  warn: "#9A5B00",
  warnBg: "#FFF1D6",
  info: "#0058A3",
  infoBg: "#E2EEF9",
} as const;

const dark: Theme = {
  bg: "#0E141B",
  surface: "#16202B",
  surface2: "#1E2A37",
  fg: "#E8EDF3",
  muted: "#9AA7B6",
  line: "#2A3846",
  brand: "#4C9BE0",
  brandFg: "#06121F",
  yellow: "#FFDB00",
  good: "#58D68D",
  goodBg: "#12301F",
  bad: "#FF8A80",
  badBg: "#3A1714",
  warn: "#FFC266",
  warnBg: "#3A2A0C",
  info: "#7DB8F0",
  infoBg: "#10263B",
};

export type Theme = { [K in keyof typeof light]: string };

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export function useTheme(): Theme {
  return useColorScheme() === "dark" ? dark : light;
}
