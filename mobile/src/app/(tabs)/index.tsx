import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";

import { send } from "@/api/client.ts";
import { useInvalidateLists, useLists, useWatchlist } from "@/api/hooks.ts";
import type { ListItem, ShoppingList, WatchItem } from "@/api/types.ts";
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

type Mode = "watchlist" | "boodschappen";

export default function ListsScreen() {
  const t = useTheme();
  const [mode, setMode] = useState<Mode>("watchlist");
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flexDirection: "row", gap: space.sm, padding: space.md }}>
        {(["watchlist", "boodschappen"] as const).map((m) => (
          <Pressable
            key={m}
            onPress={() => {
              haptic.select();
              setMode(m);
            }}
            style={{
              flex: 1,
              alignItems: "center",
              padding: space.md,
              borderRadius: radius.md,
              backgroundColor: mode === m ? t.brand : t.surface,
            }}
          >
            <Text
              style={{
                color: mode === m ? t.brandFg : t.fg,
                fontWeight: "800",
              }}
            >
              {m === "watchlist" ? "Watchlist" : "Boodschappen"}
            </Text>
          </Pressable>
        ))}
      </View>
      {mode === "watchlist" ? <Watchlist /> : <Lists />}
    </View>
  );
}

function Watchlist() {
  const router = useRouter();
  const { data, isRefetching, refetch } = useWatchlist();
  const invalidate = useInvalidateLists();

  const setQuantity = async (item: WatchItem, quantity: number) => {
    haptic.tick();
    await send(`/api/watchlist/${item.articleNumber}/quantity`, "PUT", {
      quantity,
    });
    await invalidate();
  };

  return (
    <FlatList
      data={data ?? []}
      keyExtractor={(i) => i.articleNumber}
      contentContainerStyle={{ padding: space.md, gap: space.md }}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
        />
      }
      ListEmptyComponent={
        <Empty>
          Nog niets op je watchlist. Zoek een product onder Producten en tik op
          Volgen.
        </Empty>
      }
      renderItem={({ item }) => {
        const best = item.insight?.offers[0];
        const manual = item.lists.length === 0;
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
                  <Text style={{ fontWeight: "800", fontSize: 15 }}>
                    {`${item.name} ${item.typeName}`.trim()}
                  </Text>
                  <Muted>{`art. ${item.articleNumber}${item.measure ? ` · ${item.measure}` : ""}`}</Muted>
                  {best ? (
                    <Chip
                      kind={best.followed ? "info" : "neutral"}
                      label={`${best.storeName}${countryTag(best.country)} · ${money(best.price)}`}
                    />
                  ) : (
                    <Chip label="Niet in tweedekanshoek" />
                  )}
                </View>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: space.md,
                }}
              >
                {manual ? (
                  <Stepper
                    value={item.quantity}
                    min={1}
                    onChange={(q) => void setQuantity(item, q)}
                  />
                ) : (
                  <Chip
                    kind={item.needed > 0 ? "info" : "good"}
                    label={
                      item.needed > 0
                        ? `Nog nodig: ${String(item.needed)}`
                        : "Alles gekocht"
                    }
                  />
                )}
                {item.needed > 0 ? (
                  <Button
                    label="Gekocht"
                    variant="secondary"
                    onPress={() => {
                      router.push({
                        pathname: "/koop",
                        params: {
                          article: item.articleNumber,
                          name: `${item.name} ${item.typeName}`.trim(),
                          remaining: String(item.needed),
                          estimate: best ? String(best.price) : "",
                          store: best?.storeName ?? "",
                        },
                      });
                    }}
                  />
                ) : null}
              </View>
            </Card>
          </Pressable>
        );
      }}
    />
  );
}

function Lists() {
  const router = useRouter();
  const t = useTheme();
  const { data, isRefetching, refetch } = useLists();
  const [activeId, setActiveId] = useState<number | undefined>(undefined);
  const lists = data ?? [];
  const active: ShoppingList | undefined =
    lists.find((l) => l.id === activeId) ?? lists[0];

  const buy = (item: ListItem) => {
    router.push({
      pathname: "/koop",
      params: {
        article: item.articleNumber,
        name: `${item.name} ${item.typeName}`.trim(),
        remaining: String(item.remaining),
        estimate:
          item.estimateUnit === undefined ? "" : String(item.estimateUnit),
        store: item.bestOffer?.storeName ?? "",
        listItemId: String(item.id),
      },
    });
  };

  return (
    <FlatList
      data={active?.items ?? []}
      keyExtractor={(i) => String(i.id)}
      contentContainerStyle={{ padding: space.md, gap: space.md }}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
        />
      }
      ListHeaderComponent={
        <View style={{ gap: space.md }}>
          <View
            style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}
          >
            {lists.map((l) => (
              <Pressable
                key={l.id}
                onPress={() => {
                  haptic.select();
                  setActiveId(l.id);
                }}
                style={{
                  paddingHorizontal: space.md,
                  paddingVertical: 8,
                  borderRadius: radius.pill,
                  backgroundColor: l.id === active?.id ? t.yellow : t.surface2,
                }}
              >
                <Text
                  style={{
                    fontWeight: "700",
                    color: l.id === active?.id ? "#111A24" : t.fg,
                  }}
                >
                  {`${l.name} ${String(l.totals.bought)}/${String(l.totals.pieces)}`}
                </Text>
              </Pressable>
            ))}
          </View>
          {active ? (
            <Card>
              <Text style={{ color: t.fg, fontSize: 20, fontWeight: "800" }}>
                {`${active.totals.toBuy > 0 ? "~" : ""}${money(active.totals.total)}`}
              </Text>
              <Muted>
                {`${String(active.totals.bought)} van ${String(active.totals.pieces)} stuks gekocht · bespaard ${money(active.totals.saving)}`}
              </Muted>
            </Card>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <Empty>
          {active
            ? "Deze lijst is leeg."
            : "Nog geen boodschappenlijst. Maak er een op de website of zet een product via Producten op een lijst."}
        </Empty>
      }
      renderItem={({ item }) => (
        <Card style={{ opacity: item.remaining > 0 ? 1 : 0.6 }}>
          <View style={{ flexDirection: "row", gap: space.md }}>
            <Thumb uri={item.image} size={56} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontWeight: "800", fontSize: 15 }}>
                {`${item.name} ${item.typeName}`.trim()}
              </Text>
              <Muted>{`${String(item.bought)} van ${String(item.quantity)} gekocht`}</Muted>
              <Muted>
                {item.remaining > 0 && item.estimateUnit !== undefined
                  ? `~${money(item.estimateUnit)} p/st`
                  : item.remaining > 0
                    ? "prijs onbekend"
                    : "Gekocht"}
              </Muted>
            </View>
            {item.remaining > 0 ? (
              <Button
                label="Gekocht"
                variant="secondary"
                onPress={() => {
                  buy(item);
                }}
              />
            ) : null}
          </View>
        </Card>
      )}
    />
  );
}

function Stepper({
  value,
  min,
  onChange,
}: {
  value: number;
  min: number;
  onChange: (value: number) => void;
}) {
  const t = useTheme();
  const box = {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: t.surface2,
    alignItems: "center",
    justifyContent: "center",
  } as const;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
      <Pressable
        accessibilityLabel="Minder"
        disabled={value <= min}
        onPress={() => {
          onChange(value - 1);
        }}
        style={[box, { opacity: value <= min ? 0.4 : 1 }]}
      >
        <Text style={{ color: t.fg, fontSize: 20, fontWeight: "800" }}>−</Text>
      </Pressable>
      <Text
        style={{
          color: t.fg,
          fontWeight: "800",
          minWidth: 24,
          textAlign: "center",
        }}
      >
        {String(value)}
      </Text>
      <Pressable
        accessibilityLabel="Meer"
        onPress={() => {
          onChange(value + 1);
        }}
        style={box}
      >
        <Text style={{ color: t.fg, fontSize: 20, fontWeight: "800" }}>+</Text>
      </Pressable>
    </View>
  );
}
