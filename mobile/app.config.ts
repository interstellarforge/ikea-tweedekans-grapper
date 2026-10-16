import { existsSync } from "node:fs";

import type { ExpoConfig } from "expo/config";

const GOOGLE_SERVICES = "./google-services.json";
const BLUE = "#0058A3";

// google-services.json comes from your Firebase project (not committed); push needs it at build time.
const googleServicesFile =
  process.env["GOOGLE_SERVICES_JSON"] ??
  (existsSync(GOOGLE_SERVICES) ? GOOGLE_SERVICES : undefined);

const config: ExpoConfig = {
  name: "Tweedekanshoek",
  slug: "tweedekanshoek",
  version: "0.1.0",
  scheme: "tweedekanshoek",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  platforms: ["android"],
  android: {
    package: "nl.tweedekanshoek.app",
    adaptiveIcon: {
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: true,
    ...(googleServicesFile ? { googleServicesFile } : {}),
    intentFilters: [
      {
        action: "VIEW",
        autoVerify: true,
        data: [
          {
            scheme: "https",
            host: "tweedekanshoek.nl",
            pathPrefix: "/product",
          },
          { scheme: "https", host: "tweedekanshoek.nl", pathPrefix: "/alerts" },
        ],
        category: ["BROWSABLE", "DEFAULT"],
      },
    ],
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        imageWidth: 180,
        backgroundColor: BLUE,
      },
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/android-icon-monochrome.png",
        color: BLUE,
      },
    ],
  ],
  extra: {
    apiUrl: process.env["EXPO_PUBLIC_API_URL"] ?? "https://tweedekanshoek.nl",
  },
  experiments: { typedRoutes: true },
};

export default config;
