import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, TextInput, View } from "react-native";

import { errorMessage, send } from "@/api/client.ts";
import { useInvalidateLists } from "@/api/hooks.ts";
import { Button, Muted, Text } from "@/components/ui.tsx";
import { money } from "@/lib/format.ts";
import { haptic } from "@/lib/haptics.ts";
import { radius, space, useTheme } from "@/theme.ts";

const MAX_PIECES = 50;

type Params = {
  article: string;
  name: string;
  remaining: string;
  estimate?: string;
  store?: string;
  listItemId?: string;
};

/** Records what was paid per piece (modal); the first price is the default for the others. */
export default function BuyScreen() {
  const t = useTheme();
  const router = useRouter();
  const invalidate = useInvalidateLists();
  const p = useLocalSearchParams<Params>();
  const remaining = Math.max(1, Number(p.remaining) || 1);
  const max = Math.min(remaining, MAX_PIECES);
  const [prices, setPrices] = useState<string[]>([p.estimate ?? ""]);
  const [store, setStore] = useState(p.store ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const setCount = (count: number) => {
    haptic.tick();
    setPrices((current) =>
      Array.from({ length: count }, (_, i) => current[i] ?? current[0] ?? ""),
    );
  };

  const total = prices.reduce(
    (sum, v) => sum + (Number(v.replace(",", ".")) || 0),
    0,
  );

  const save = async () => {
    setBusy(true);
    setError("");
    const numbers = prices.map((v) => {
      const n = Number(v.replace(",", "."));
      return v === "" || Number.isNaN(n) ? null : n;
    });
    try {
      if (p.listItemId) {
        await send(`/api/list-items/${p.listItemId}/purchase`, "POST", {
          pieces: numbers,
          storeName: store,
        });
      } else {
        for (const price of numbers) {
          await send("/api/list/purchase", "POST", {
            items: [
              {
                articleNumber: p.article,
                count: 1,
                ...(price === null ? {} : { unitPrice: price }),
                ...(store ? { storeName: store } : {}),
              },
            ],
          });
        }
      }
      haptic.success();
      await invalidate();
      router.back();
    } catch (e) {
      haptic.error();
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  const input = {
    backgroundColor: t.surface,
    borderColor: t.line,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    minHeight: 46,
    fontSize: 16,
    color: t.fg,
  } as const;

  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={{ padding: space.lg, gap: space.md }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ fontWeight: "800", fontSize: 18 }}>{p.name}</Text>
      <Muted>{`art. ${p.article} · nog ${String(remaining)} nodig`}</Muted>

      <View
        style={{ flexDirection: "row", alignItems: "center", gap: space.md }}
      >
        <Text style={{ flex: 1 }}>Aantal gekocht</Text>
        <Button
          label="−"
          variant="secondary"
          disabled={prices.length <= 1}
          onPress={() => {
            setCount(prices.length - 1);
          }}
        />
        <Text style={{ fontWeight: "800", minWidth: 24, textAlign: "center" }}>
          {String(prices.length)}
        </Text>
        <Button
          label="+"
          variant="secondary"
          disabled={prices.length >= max}
          onPress={() => {
            setCount(prices.length + 1);
          }}
        />
      </View>

      {prices.map((value, index) => (
        <View
          // eslint-disable-next-line @eslint-react/no-array-index-key -- pieces are positional (stuk 1..n)
          key={index}
          style={{ flexDirection: "row", alignItems: "center", gap: space.md }}
        >
          <Text style={{ width: 70 }}>{`Stuk ${String(index + 1)}`}</Text>
          <TextInput
            style={[input, { flex: 1 }]}
            keyboardType="decimal-pad"
            placeholder="€ per stuk"
            placeholderTextColor={t.muted}
            value={value}
            onChangeText={(text) => {
              setPrices((current) =>
                current.map((v, i) =>
                  i === index || (index === 0 && v === current[0]) ? text : v,
                ),
              );
            }}
          />
        </View>
      ))}

      <TextInput
        style={input}
        placeholder="Winkel (optioneel)"
        placeholderTextColor={t.muted}
        value={store}
        onChangeText={setStore}
      />
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontWeight: "800" }}>Totaal</Text>
        <Text style={{ fontWeight: "800" }}>{money(total)}</Text>
      </View>
      {error ? <Text style={{ color: t.bad }}>{error}</Text> : null}
      <Button label="Opslaan" busy={busy} onPress={() => void save()} />
    </ScrollView>
  );
}
