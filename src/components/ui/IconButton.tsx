import { Icon, type IconName } from "./Icon.tsx";

/** Square icon-only button; the label is both tooltip and accessible name. */
export function IconButton({
  name,
  label,
  onClick,
  tone,
  className = "",
}: {
  name: IconName;
  label: string;
  onClick: () => void;
  tone?: "danger" | "on";
  className?: string;
}) {
  const classes = ["icon", tone, className].filter(Boolean).join(" ");
  return (
    <button
      type="button"
      className={classes}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      <Icon name={name} />
    </button>
  );
}
