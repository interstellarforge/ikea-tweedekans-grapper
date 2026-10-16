import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";

import { errorMessage, send } from "@/api/client.ts";
import { useInvalidateLists, useLists } from "@/api/hooks.ts";
import { Button, Muted, Text } from "@/components/ui.tsx";
import { haptic } from "@/lib/haptics.ts";
import { radius, space, useTheme } from "@/theme.ts";

type Params = {
  article: string;
  name: string;
  typeName?: string;
  measure?: string;
  image?: string;
  price?: string;
};

/** Pick a shopping list (or create one) for a product. */
export default function AddToListScreen() {
  const t = useTheme();
  const router = useRouter();
  const p = useLocalSearchParams<Params>();
  const { data: lists } = useLists();
  const invalidate = useInvalidateLists();
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const add = async (listId: number) => {
    await send(`/api/lists/${String(listId)}/items`, "POST", {
      articleNumber: p.article,
      quantity: 1,
      mode: "add",
      product: {
        name: p.name,
        typeName: p.typeName ?? "",
        measure: p.measure ?? "",
        ...(p.image ? { image: p.image } : {}),
        ...(p.price ? { price: Number(p.price) } : {}),
      },
    });
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      haptic.success();
      await invalidate();
      router.back();
    } catch (e) {
      haptic.error();
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={{ padding: space.lg, gap: space.md }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ fontWeight: "800", fontSize: 18 }}>{p.name}</Text>
      <Muted>Kies een lijst</Muted>
      {(lists ?? []).map((l) => (
        <Pressable
          key={l.id}
          disabled={busy}
          onPress={() => void run(() => add(l.id))}
          style={{
            backgroundColor: t.surface,
            borderRadius: radius.md,
            padding: space.md,
          }}
        >
          <Text style={{ fontWeight: "700" }}>{l.name}</Text>
          <Muted>{`${String(l.items.length)} producten`}</Muted>
        </Pressable>
      ))}
      <View style={{ gap: space.sm }}>
        <TextInput
          value={newName}
          onChangeText={setNewName}
          placeholder="Nieuwe lijst (bijv. Keuken)"
          placeholderTextColor={t.muted}
          style={{
            backgroundColor: t.surface,
            borderColor: t.line,
            borderWidth: 1,
            borderRadius: radius.md,
            paddingHorizontal: space.md,
            minHeight: 46,
            fontSize: 16,
            color: t.fg,
          }}
        />
        <Button
          label="Nieuwe lijst maken en toevoegen"
          disabled={!newName.trim() || busy}
          onPress={() => {
            void run(async () => {
              const created = await send<{ id: number }>("/api/lists", "POST", {
                name: newName.trim(),
              });
              await add(created.id);
            });
          }}
        />
      </View>
      {error ? <Text style={{ color: t.bad }}>{error}</Text> : null}
    </ScrollView>
  );
}
