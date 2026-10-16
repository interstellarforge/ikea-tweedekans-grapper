import { useRouter } from "expo-router";
import { useEffect } from "react";
import { FlatList, Pressable, View } from "react-native";

import { send } from "@/api/client.ts";
import { useAlerts, useInvalidateLists } from "@/api/hooks.ts";
import { Card, Chip, Empty, Muted, Text } from "@/components/ui.tsx";
import { ago, countryTag, money } from "@/lib/format.ts";
import { space, useTheme } from "@/theme.ts";

export default function AlertsScreen() {
  const t = useTheme();
  const router = useRouter();
  const { data } = useAlerts();
  const invalidate = useInvalidateLists();

  // Opening the list counts as having seen the alerts.
  useEffect(() => {
    if (data && data.unseen > 0) {
      void send("/api/alerts/seen", "POST").then(invalidate);
    }
  }, [data?.unseen]);

  return (
    <FlatList
      style={{ backgroundColor: t.bg }}
      data={data?.items ?? []}
      keyExtractor={(a) =>
        `${a.storeId}-${a.offerNumber}-${String(a.createdAt)}`
      }
      contentContainerStyle={{ padding: space.md, gap: space.md }}
      ListEmptyComponent={<Empty>Nog geen meldingen.</Empty>}
      renderItem={({ item: a }) => (
        <Pressable
          onPress={() => {
            router.push({
              pathname: "/product/[article]",
              params: { article: a.articleNumber },
            });
          }}
        >
          <Card style={{ gap: 4 }}>
            <View
              style={{ flexDirection: "row", justifyContent: "space-between" }}
            >
              <Text style={{ fontWeight: "800", flex: 1 }}>{a.title}</Text>
              {a.seen ? null : <Chip kind="warn" label="Nieuw" />}
            </View>
            <Muted>{a.description}</Muted>
            <Text>{`${money(a.price)} · ${a.storeName}${countryTag(a.country)}`}</Text>
            {a.note ? <Muted>{a.note}</Muted> : null}
            <Muted>{ago(a.createdAt)}</Muted>
          </Card>
        </Pressable>
      )}
    />
  );
}
