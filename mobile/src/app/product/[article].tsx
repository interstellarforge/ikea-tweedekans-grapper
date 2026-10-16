import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Linking, ScrollView, View } from "react-native";

import { api, send } from "@/api/client.ts";
import { useInvalidateLists } from "@/api/hooks.ts";
import type { Offer, Product } from "@/api/types.ts";
import {
  Button,
  Card,
  Chip,
  Empty,
  Heading,
  Muted,
  Text,
  Thumb,
} from "@/components/ui.tsx";
import { ago, countryTag, money } from "@/lib/format.ts";
import { haptic } from "@/lib/haptics.ts";
import { space, useTheme } from "@/theme.ts";

const COUNTRY_PATH: Record<string, string> = {
  nl: "nl/nl",
  be: "be/nl",
  de: "de/de",
};

function ikeaOfferUrl(o: Offer): string {
  const slug = o.storeName
    .toLowerCase()
    .replace(/ikea /g, "")
    .trim()
    .replace(/\//g, "")
    .replace(/-/g, "")
    .replace(/\s+/g, "+");
  const path = COUNTRY_PATH[o.country] ?? "nl/nl";
  return `https://www.ikea.com/${path}/second-hand/buy-from-ikea/#/${slug}/${o.offerNumber}`;
}

export default function ProductScreen() {
  const t = useTheme();
  const router = useRouter();
  const client = useQueryClient();
  const invalidate = useInvalidateLists();
  const { article } = useLocalSearchParams<{ article: string }>();

  const { data, error } = useQuery({
    queryKey: ["product", article],
    queryFn: () => api<Product>(`/api/product/${article}`),
  });

  if (error) {
    return <Empty>{`Product niet gevonden (${error.message})`}</Empty>;
  }
  if (!data) return <Empty>Laden…</Empty>;

  const offers = data.insight?.offers ?? [];
  const cheapest = [...offers].sort((a, b) => a.price - b.price)[0];

  const toggleWatch = async () => {
    if (data.watched) {
      await send(`/api/watchlist/${data.articleNumber}`, "DELETE");
      haptic.tick();
    } else {
      await send("/api/watchlist", "PUT", data);
      haptic.success();
    }
    await client.invalidateQueries({ queryKey: ["product", article] });
    await invalidate();
  };

  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={{ padding: space.md, gap: space.md }}
    >
      <View style={{ flexDirection: "row", gap: space.md }}>
        <Thumb uri={data.image} size={96} />
        <View style={{ flex: 1, gap: 4 }}>
          <Heading>{`${data.name} ${data.typeName}`.trim()}</Heading>
          <Muted>{`art. ${data.articleNumber}${data.measure ? ` · ${data.measure}` : ""}`}</Muted>
        </View>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        <Chip
          kind={offers.length ? "info" : "neutral"}
          label={`${String(offers.length)} in tweedekanshoek`}
        />
        {cheapest ? (
          <Chip
            kind="good"
            label={`Laagste nu: ${money(cheapest.price)} in ${cheapest.storeName}${countryTag(cheapest.country)}`}
          />
        ) : null}
        {data.insight?.lowestEver !== undefined ? (
          <Chip label={`Laagste ooit: ${money(data.insight.lowestEver)}`} />
        ) : null}
      </View>
      <View style={{ flexDirection: "row", gap: space.sm }}>
        <Button
          label={data.watched ? "Van watchlist" : "Volgen"}
          variant={data.watched ? "secondary" : "primary"}
          onPress={() => void toggleWatch()}
        />
        <Button
          label="Op lijst"
          variant="secondary"
          onPress={() => {
            router.push({
              pathname: "/op-lijst",
              params: {
                article: data.articleNumber,
                name: data.name,
                typeName: data.typeName,
                measure: data.measure,
                image: data.image ?? "",
                price: "",
              },
            });
          }}
        />
      </View>
      {data.url ? (
        <Button
          label="Productpagina op IKEA"
          variant="secondary"
          onPress={() => void Linking.openURL(data.url ?? "")}
        />
      ) : null}
      <Text style={{ fontWeight: "800", fontSize: 18 }}>Aanbiedingen</Text>
      {offers.length === 0 ? (
        <Empty>Nu niet in een tweedekanshoek.</Empty>
      ) : null}
      {offers.map((o) => (
        <Card key={`${o.storeId}-${o.offerNumber}`} style={{ gap: 4 }}>
          <View
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <Text
              style={{ fontWeight: "800" }}
            >{`${o.storeName}${countryTag(o.country)}`}</Text>
            <Text style={{ fontWeight: "800" }}>{money(o.price)}</Text>
          </View>
          <Muted>
            {`${[o.condition].filter(Boolean).join(" · ")} · sinds ${ago(o.firstSeen)}${o.followed ? " · gevolgd filiaal" : ""}`}
          </Muted>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {o.tag?.kind === "lowest" ? (
              <Chip kind="good" label="Laagste prijs" />
            ) : null}
            {o.tag?.kind === "pricier" ? (
              <Chip kind="bad" label={`+${money(o.tag.diff)}`} />
            ) : null}
          </View>
          <Button
            label="Bekijk bij IKEA"
            variant="secondary"
            onPress={() => void Linking.openURL(ikeaOfferUrl(o))}
          />
        </Card>
      ))}
    </ScrollView>
  );
}
