import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Tweedekanshoek",
    short_name: "Tweedekanshoek",
    description:
      "Weet wanneer jouw IKEA-producten in de tweedekanshoek liggen.",
    start_url: "/watchlist",
    display: "standalone",
    background_color: "#0058A3",
    theme_color: "#0058A3",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
