import { MaterialIcons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

import { haptic } from "@/lib/haptics.ts";
import { useTheme } from "@/theme.ts";

type IconName = React.ComponentProps<typeof MaterialIcons>["name"];

const TABS: { name: string; title: string; icon: IconName }[] = [
  { name: "index", title: "Lijsten", icon: "format-list-bulleted" },
  { name: "producten", title: "Producten", icon: "search" },
  { name: "aanbod", title: "Aanbod", icon: "local-offer" },
  { name: "rit", title: "Ritje", icon: "directions-car" },
  { name: "meer", title: "Meer", icon: "more-horiz" },
];

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenListeners={{
        tabPress: () => {
          haptic.select();
        },
      }}
      screenOptions={{
        headerStyle: { backgroundColor: t.brand },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: { fontWeight: "800" },
        tabBarActiveTintColor: t.brand,
        tabBarInactiveTintColor: t.muted,
        tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.line },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color, size }) => (
              <MaterialIcons name={tab.icon} color={color} size={size} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
