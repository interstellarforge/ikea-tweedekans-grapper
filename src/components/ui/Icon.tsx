const PATHS = {
  trash: "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z",
  check: "M4 12l5 5L20 6",
  undo: "M9 14L4 9l5-5M4 9h10a6 6 0 010 12h-3",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  close: "M6 6l12 12M18 6L6 18",
  menu: "M4 7h16M4 12h16M4 17h16",
  edit: "M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  map: "M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14",
  phone:
    "M8 3h8a1 1 0 011 1v16a1 1 0 01-1 1H8a1 1 0 01-1-1V4a1 1 0 011-1zM11 18h2",
  bell: "M18 16v-5a6 6 0 10-12 0v5l-2 2h16zM10 21h4",
  sliders: "M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21c0-4 3.6-6 8-6s8 2 8 6",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  logout: "M10 4H5v16h5M15 8l4 4-4 4M19 12H9",
  arrow: "M5 12h14M13 6l6 6-6 6",
  external: "M14 4h6v6M20 4l-9 9M18 14v5H5V6h5",
  list: "M9 6h11M9 12h11M9 18h11M4 6h1M4 12h1M4 18h1",
  route:
    "M6 19a2 2 0 100-4 2 2 0 000 4zM18 9a2 2 0 100-4 2 2 0 000 4zM8 17h6a3 3 0 000-6h-4a3 3 0 010-6h6",
  search: "M11 4a7 7 0 100 14 7 7 0 000-14zM16 16l5 5",
  tag: "M3 12V4h8l9 9-8 8zM8 8h.01",
  store:
    "M4 9l1-5h14l1 5M4 9v11h16V9M4 9a2.7 2.7 0 005.3 0 2.7 2.7 0 005.4 0A2.7 2.7 0 0020 9M10 20v-5h4v5",
  clock: "M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg className="ico" viewBox="0 0 24 24" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}

/** An icon followed by text (never a glyph character). */
export function IconLabel({
  name,
  children,
}: {
  name: IconName;
  children: React.ReactNode;
}) {
  return (
    <span className="icon-label">
      <Icon name={name} />
      {children}
    </span>
  );
}

/** The brand mark: a yellow price tag with a blue eyelet. */
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 32 32" aria-hidden="true">
      <path
        d="M2.5 16 12 4.5h15a2.5 2.5 0 0 1 2.5 2.5v18a2.5 2.5 0 0 1-2.5 2.5H12z"
        fill="#FFDB00"
      />
      <circle cx="11.5" cy="16" r="2.3" fill="#0058A3" />
      <path
        d="M17.5 12.5h7M17.5 16.5h7M17.5 20.5h4"
        stroke="#0058A3"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
