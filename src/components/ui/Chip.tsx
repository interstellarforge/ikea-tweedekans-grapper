import { moneyTight } from "@/lib/format.ts";
import type { PriceTag } from "@/server/insights.ts";

import { Icon, type IconName } from "./Icon.tsx";

type ChipKind = "good" | "bad" | "warn" | "info" | "new";

export function Chip({
  kind,
  icon,
  children,
}: {
  kind?: ChipKind;
  icon?: IconName;
  children: React.ReactNode;
}) {
  return (
    <span className={kind ? `chip ${kind}` : "chip"}>
      {icon ? <Icon name={icon} /> : null}
      {children}
    </span>
  );
}

/** "Laagste prijs" or "+€2,50" compared with the lowest earlier measured price. */
export function TagChip({ tag }: { tag: PriceTag | undefined }) {
  if (!tag || tag.kind === "equal") return null;
  if (tag.kind === "lowest") return <Chip kind="good">Laagste prijs</Chip>;
  return <Chip kind="bad">{`+${moneyTight(tag.diff)}`}</Chip>;
}
