import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { FlatList, Pressable, TextInput, View } from "react-native";

import { api, send } from "@/api/client.ts";
import { useInvalidateLists } from "@/api/hooks.ts";
import type { CatalogItem } from "@/api/types.ts";
import {
  Button,
  Card,
  Chip,
  Empty,
  Muted,
  Text,
  Thumb,
} from "@/components/ui.tsx";
import { countryTag, money } from "@/lib/format.ts";
import { haptic } from "@/lib/haptics.ts";
import { radius, space, useTheme } from "@/theme.ts";

const MIN_QUERY = 2;
const DEBOUNCE_MS = 350;

const STARTERS = [
  "METOD",
  "SEKTION",
  "PAX",
  "BILLY",
  "KALLAX",
  "BESTÅ",
  "MALM",
  "HEMNES",
  "LACK",
  "POÄNG",
  "ALEX",
  "KOMPLEMENT",
  "UTRUSTA",
  "IVAR",
];

function useDebounced<T>(value: T, delay = DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delay);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delay]);
  return debounced;
}

export default function ProductsScreen() {
  const t = useTheme();
  const router = useRouter();
  const [text, setText] = useState("");
  const q = useDebounced(text.trim());
  const searching = q.length >= MIN_QUERY;
  const invalidate = useInvalidateLists();
  const client = useQueryClient();

  const results = useQuery({
    queryKey: ["catalog", q],
    enabled: searching,
    queryFn: () =>
      api<CatalogItem[]>(`/api/catalog?q=${encodeURIComponent(q)}`),
  });

  const follow = async (item: CatalogItem) => {
    await send("/api/watchlist", "PUT", item);
    haptic.success();
    await invalidate();
    await client.invalidateQueries({ queryKey: ["catalog", q] });
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ padding: space.md }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Zoek op naam of artikelnummer"
          placeholderTextColor={t.muted}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="search"
          style={{
            backgroundColor: t.surface,
            borderColor: t.line,
            borderWidth: 1,
            borderRadius: radius.md,
            paddingHorizontal: space.md,
            minHeight: 48,
            fontSize: 16,
            color: t.fg,
          }}
        />
      </View>
      {searching ? (
        <FlatList
          data={results.data ?? []}
          keyExtractor={(i) => i.articleNumber}
          contentContainerStyle={{ padding: space.md, gap: space.md }}
          ListEmptyComponent={
            <Empty>
              {results.isFetching ? "Zoeken…" : "Geen producten gevonden."}
            </Empty>
          }
          renderItem={({ item }) => {
            const best = item.insight?.offers[0];
            return (
              <Pressable
                onPress={() => {
                  router.push({
                    pathname: "/product/[article]",
                    params: { article: item.articleNumber },
                  });
                }}
              >
                <Card>
                  <View style={{ flexDirection: "row", gap: space.md }}>
                    <Thumb uri={item.image} />
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={{ fontWeight: "800" }}>
                        {`${item.name} ${item.typeName}`}
                      </Text>
                      <Muted>{`art. ${item.articleNumber}${item.measure ? ` · ${item.measure}` : ""}`}</Muted>
                      {best ? (
                        <Chip
                          kind="info"
                          label={`${best.storeName}${countryTag(best.country)} · ${money(best.price)}`}
                        />
                      ) : null}
                    </View>
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      gap: space.sm,
                      marginTop: space.md,
                    }}
                  >
                    <Button
                      label={item.watched ? "Op watchlist" : "Volgen"}
                      disabled={item.watched}
                      onPress={() => void follow(item)}
                    />
                    <Button
                      label="Op lijst"
                      variant="secondary"
                      onPress={() => {
                        router.push({
                          pathname: "/op-lijst",
                          params: {
                            article: item.articleNumber,
                            name: item.name,
                            typeName: item.typeName,
                            measure: item.measure,
                            image: item.image ?? "",
                            price:
                              item.price === undefined
                                ? ""
                                : String(item.price),
                          },
                        });
                      }}
                    />
                  </View>
                </Card>
              </Pressable>
            );
          }}
        />
      ) : (
        <View style={{ padding: space.md, gap: space.md }}>
          <Text style={{ fontWeight: "800", fontSize: 18 }}>Veelgezocht</Text>
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}
          >
            {STARTERS.map((name) => (
              <Pressable
                key={name}
                onPress={() => {
                  haptic.select();
                  setText(name);
                }}
                style={{
                  paddingHorizontal: space.md,
                  paddingVertical: 8,
                  borderRadius: radius.pill,
                  backgroundColor: t.surface2,
                }}
              >
                <Text style={{ fontWeight: "700" }}>{name}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}
