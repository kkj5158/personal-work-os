import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Orbit",
    short_name: "Orbit",
    description: "WORK OS · NOTE SYS · LIFE CODE · Calendar",
    start_url: "/worklog",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#f7f8fa",
    lang: "ko",
    icons: [
      { src: "/icons/orbit-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/orbit-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
