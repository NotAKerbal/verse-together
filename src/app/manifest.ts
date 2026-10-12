import type { MetadataRoute } from "next";

/*
  The web app manifest (served at /manifest.webmanifest, linked from every page by Next): the site's name and
  its approved icon, as the exact 192 and 512 light exports. A manifest's icons cannot follow the system's
  light or dark preference, so they are the light design, the site's default. These are ordinary ("any")
  icons, not maskable ones. "browser" display describes the site as it is: it does not make it a standalone
  installable app, and there is no service worker.
*/
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Verse Together",
    short_name: "Verse Together",
    description: "Share verses, bear testimony, and learn together.",
    start_url: "/",
    display: "browser",
    icons: [
      { src: "/brand/icons/light/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icons/light/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
