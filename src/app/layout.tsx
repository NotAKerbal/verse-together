import type { Metadata } from "next";
import { DM_Sans, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import Navbar from "../components/Navbar";
import AppProviders from "../components/AppProviders";
import AppMain from "../components/AppMain";
import AppPreloader from "../components/AppPreloader";
import MobileBottomNav from "../components/MobileBottomNav";
import SimpleModeExitPill from "../components/SimpleModeExitPill";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  axes: ["opsz"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/*
  The app icon, in its two approved designs (the exact exports in public/brand/icons/{light,dark}), chosen the
  way the site chooses its theme (see the script below): dark when the system prefers dark, light otherwise.
  Every light link comes first, so a browser that ignores `media` on icon links takes the light design, and
  /favicon.ico (public/favicon.ico) is the light one for anything that asks for it directly. There are no
  file-based icons in src/app: Next always puts an app/favicon.ico first, with no `media`, ahead of these.
*/
const ICON_THEMES = [
  { theme: "light", media: "(prefers-color-scheme: light)" },
  { theme: "dark", media: "(prefers-color-scheme: dark)" },
] as const;

const icons: Metadata["icons"] = {
  icon: ICON_THEMES.flatMap(({ theme, media }) => [
    { url: `/brand/icons/${theme}/favicon.ico`, sizes: "16x16 32x32 48x48", type: "image/x-icon", media },
    ...[16, 32, 48].map((size) => ({
      url: `/brand/icons/${theme}/favicon-${size}.png`,
      sizes: `${size}x${size}`,
      type: "image/png",
      media,
    })),
    { url: `/brand/icons/${theme}/icon-192.png`, sizes: "192x192", type: "image/png", media },
  ]),
  apple: ICON_THEMES.map(({ theme, media }) => ({
    url: `/brand/icons/${theme}/apple-icon.png`,
    sizes: "180x180",
    type: "image/png",
    media,
  })),
};

export const metadata: Metadata = {
  title: "Verse Together",
  description: "Share verses, bear testimony, and learn together.",
  icons,
};

function MobileNavFallback() {
  return <div className="simple-hide h-[5.5rem] sm:hidden" aria-hidden="true" />;
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
          Before first paint: the theme follows the system light/dark preference, and keeps following it
          while the page is open (the listener lives as long as the document). There is no stored choice.
          Simple mode is read separately, so blocked storage never stops the theme from being set.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var d=document.documentElement;try{var m=window.matchMedia("(prefers-color-scheme: dark)");var a=function(){var t=m.matches?"dark":"light";d.setAttribute("data-theme",t);d.style.colorScheme=t;};a();if(m.addEventListener){m.addEventListener("change",a);}else if(m.addListener){m.addListener(a);}}catch(_){}try{if(localStorage.getItem("vt_simple_mode_v1")==="1"){d.setAttribute("data-simple","true");}}catch(_){}})();`,
          }}
        />
      </head>
      <body className={`${dmSans.variable} ${geistMono.variable} app-shell antialiased`}>
        <AppProviders>
          <div className="app-body relative min-h-screen pb-24 sm:pb-0">
            <Suspense fallback={null}>
              <AppPreloader />
            </Suspense>
            <Suspense fallback={null}>
              <Navbar />
            </Suspense>
            <AppMain>{children}</AppMain>
            <Suspense fallback={<MobileNavFallback />}>
              <MobileBottomNav />
            </Suspense>
            <SimpleModeExitPill />
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
