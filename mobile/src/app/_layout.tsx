import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

import { AuthProvider, useAuth } from "@/auth/AuthContext.tsx";
import { configureNotifications } from "@/notifications/setup.ts";
import { useNotificationRouting } from "@/notifications/useNotificationRouting.ts";
import { useTheme } from "@/theme.ts";

configureNotifications();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnReconnect: true },
  },
});

function Root() {
  const { status } = useAuth();
  const t = useTheme();
  useNotificationRouting(status === "signedIn");
  if (status === "loading") return null;

  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: t.surface },
          headerTintColor: t.fg,
          contentStyle: { backgroundColor: t.bg },
        }}
      >
        <Stack.Protected guard={status === "signedIn"}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="product/[article]"
            options={{ title: "Product" }}
          />
          <Stack.Screen name="meldingen" options={{ title: "Meldingen" }} />
          <Stack.Screen
            name="koop"
            options={{ title: "Gekocht", presentation: "modal" }}
          />
          <Stack.Screen
            name="op-lijst"
            options={{ title: "Op boodschappenlijst", presentation: "modal" }}
          />
        </Stack.Protected>
        <Stack.Protected guard={status !== "signedIn"}>
          <Stack.Screen name="login" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Root />
      </AuthProvider>
    </QueryClientProvider>
  );
}
