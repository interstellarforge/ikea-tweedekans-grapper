import "./globals.css";

import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: { default: "Tweedekanshoek", template: "%s" },
  description:
    "Weet wanneer jouw IKEA-producten in de tweedekanshoek liggen en of de rit ernaartoe loont. Onofficieel hulpmiddel.",
};

export const viewport: Viewport = { colorScheme: "light dark" };

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="nl">
      <body>{children}</body>
    </html>
  );
}
