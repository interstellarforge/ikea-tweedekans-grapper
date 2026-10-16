import { useInfiniteQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  TextInput,
  View,
} from "react-native";

import { api } from "@/api/client.ts";
import type { OfferPage } from "@/api/types.ts";
import { Card, Chip, Empty, Muted, Text, Thumb } from "@/components/ui.tsx";
import { ago, countryTag, money } from "@/lib/format.ts";
import { haptic } from "@/lib/haptics.ts";
import { radius, space, useTheme } from "@/theme.ts";

const PAGE = 40;
const DEBOUNCE_MS = 350;
const DAY_MS = 86_400_000;

export default function OffersScreen() {
  const t = useTheme();
  const router = useRouter();
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [onlyFollowed, setOnlyFollowed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setQ(text.trim());
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [text]);

  const query = useInfiniteQuery({
    queryKey: ["offers", q, onlyFollowed],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      api<OfferPage>(
        `/api/offers?${new URLSearchParams({
          q,
          followed: onlyFollowed ? "1" : "",
          sort: "new",
          limit: String(PAGE),
          offset: String(pageParam),
        }).toString()}`,
      ),
    getNextPageParam: (last, all) => {
      const loaded = all.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total ? loaded : undefined;
    },
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const now = Date.now();

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ padding: space.md, gap: space.sm }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Zoek in het aanbod"
          placeholderTextColor={t.muted}
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
        <Pressable
          onPress={() => {
            haptic.select();
            setOnlyFollowed((v) => !v);
          }}
          style={{
            alignSelf: "flex-start",
            paddingHorizontal: space.md,
            paddingVertical: 8,
            borderRadius: radius.pill,
            backgroundColor: onlyFollowed ? t.yellow : t.surface2,
          }}
        >
          <Text
            style={{
              fontWeight: "700",
              color: onlyFollowed ? "#111A24" : t.fg,
            }}
          >
            Alleen gevolgde filialen
          </Text>
        </Pressable>
      </View>
      <FlatList
        data={items}
        keyExtractor={(o) => `${o.storeId}-${o.offerNumber}`}
        contentContainerStyle={{ padding: space.md, gap: space.md }}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching && !query.isFetchingNextPage}
            onRefresh={() => void query.refetch()}
          />
        }
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) {
            void query.fetchNextPage();
          }
        }}
        ListEmptyComponent={<Empty>Geen aanbiedingen gevonden.</Empty>}
        renderItem={({ item: o }) => (
          <Pressable
            onPress={() => {
              if (o.articleNumber) {
                router.push({
                  pathname: "/product/[article]",
                  params: { article: o.articleNumber },
                });
              }
            }}
          >
            <Card>
              <View style={{ flexDirection: "row", gap: space.md }}>
                <Thumb uri={o.image} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ fontWeight: "800" }}>{o.title}</Text>
                  <Muted>{o.description}</Muted>
                  <Text style={{ fontSize: 18, fontWeight: "800" }}>
                    {money(o.price)}
                  </Text>
                  <View
                    style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}
                  >
                    {now - o.firstSeen < DAY_MS ? (
                      <Chip kind="warn" label="Nieuw" />
                    ) : null}
                    <Chip
                      kind={o.followed ? "info" : "neutral"}
                      label={`${o.storeName}${countryTag(o.country)}`}
                    />
                    {o.tag?.kind === "lowest" ? (
                      <Chip kind="good" label="Laagste prijs" />
                    ) : null}
                    {o.tag?.kind === "pricier" ? (
                      <Chip kind="bad" label={`+${money(o.tag.diff)}`} />
                    ) : null}
                  </View>
                  <Muted>{ago(o.firstSeen)}</Muted>
                </View>
              </View>
            </Card>
          </Pressable>
        )}
      />
    </View>
  );
}
