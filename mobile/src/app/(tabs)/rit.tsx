import { Linking, RefreshControl, ScrollView, View } from "react-native";

import { useTrips } from "@/api/hooks.ts";
import type { Route } from "@/api/types.ts";
import {
  Button,
  Card,
  Chip,
  Empty,
  Heading,
  Muted,
  Text,
} from "@/components/ui.tsx";
import { countryTag, duration, money } from "@/lib/format.ts";
import { space, useTheme } from "@/theme.ts";

const names = (r: Route): string =>
  r.stops.map((s) => `${s.storeName}${countryTag(s.country)}`).join(" → ");

function mapsUrl(postcode: string, route: Route): string {
  const home = `${postcode}, Nederland`;
  const waypoints = route.stops
    .filter((s) => s.lat !== undefined && s.lon !== undefined)
    .map((s) => `${String(s.lat)},${String(s.lon)}`)
    .join("|");
  const params = new URLSearchParams({
    api: "1",
    origin: home,
    destination: home,
    travelmode: "driving",
  });
  if (waypoints) params.set("waypoints", waypoints);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

function RouteCard({ route, postcode }: { route: Route; postcode: string }) {
  const t = useTheme();
  const kind =
    route.status === "good" ? "good" : route.status === "time" ? "warn" : "bad";
  const label =
    route.status === "good"
      ? "Rendabel"
      : route.status === "time"
        ? "Rendabel in geld, niet in tijd"
        : "Niet de moeite waard";
  return (
    <Card style={{ gap: space.sm }}>
      <Text style={{ fontWeight: "800", fontSize: 16 }}>{names(route)}</Text>
      <View
        style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}
      >
        <Chip kind={kind} label={label} />
        <Text
          style={{
            fontSize: 22,
            fontWeight: "800",
            color: kind === "bad" ? t.bad : t.good,
          }}
        >
          {`${route.net >= 0 ? "+" : "−"}${money(Math.abs(route.net))}`}
        </Text>
      </View>
      <Muted>
        {`${String(route.totalKm)} km · ${duration(route.totalMinutes)} · brandstof ${money(route.tripCost)} · besparing ${money(route.saving)}`}
      </Muted>
      {route.stops.map((s) => (
        <Muted key={s.storeId}>
          {`${s.storeName}: ${s.units.map((u) => `${String(u.count)}× ${u.name}`).join(", ")}`}
        </Muted>
      ))}
      <Button
        label="Open in Google Maps"
        onPress={() => void Linking.openURL(mapsUrl(postcode, route))}
      />
    </Card>
  );
}

export default function TripScreen() {
  const t = useTheme();
  const { data, isRefetching, refetch } = useTrips();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: t.bg }}
      contentContainerStyle={{ padding: space.md, gap: space.md }}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={() => void refetch()}
        />
      }
    >
      <Heading>Ritje-check</Heading>
      {!data ? <Empty>Afstanden berekenen…</Empty> : null}
      {data && !data.configured ? (
        <Card>
          <Text>{`${data.reason}.`}</Text>
          <Muted>Stel dit in via Instellingen op de website.</Muted>
        </Card>
      ) : null}
      {data?.configured ? (
        <>
          <Muted>{`Vanaf ${data.postcode} · ${String(data.wantedUnits)} stuks nog nodig`}</Muted>
          {data.bestRoute ? (
            <RouteCard route={data.bestRoute} postcode={data.postcode} />
          ) : (
            <Empty>Op dit moment loont geen enkele rit.</Empty>
          )}
          {data.alternatives.map((r) => (
            <RouteCard
              key={r.stops.map((s) => s.storeId).join("-")}
              route={r}
              postcode={data.postcode}
            />
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}
