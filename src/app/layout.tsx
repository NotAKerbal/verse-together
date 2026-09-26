import type { Metadata } from "next";
import { Bricolage_Grotesque, DM_Sans, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import Navbar from "../components/Navbar";
import AppProviders from "../components/AppProviders";
import AppMain from "../components/AppMain";
import AppPreloader from "../components/AppPreloader";
import MobileBottomNav from "../components/MobileBottomNav";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  axes: ["opsz"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["500", "700", "800"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Verse Together",
  description: "Share verses, bear testimony, and learn together.",
};

function HeaderFallback() {
  return <div className="app-header hidden h-[4.75rem] w-full sm:block" aria-hidden="true" />;
}

function MobileNavFallback() {
  return <div className="h-[5.5rem] sm:hidden" aria-hidden="true" />;
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var k="vt_theme_v1";var t=localStorage.getItem(k);if(t!=="light"&&t!=="dark"&&t!=="sepia"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";}document.documentElement.setAttribute("data-theme",t);document.documentElement.style.colorScheme=t==="dark"?"dark":"light";}catch(_){}})();`,
          }}
        />
      </head>
      <body className={`${dmSans.variable} ${bricolage.variable} ${geistMono.variable} app-shell antialiased`}>
        <AppProviders>
          <div className="relative min-h-screen pb-24 sm:pb-0">
            <Suspense fallback={null}>
              <AppPreloader />
            </Suspense>
            <Suspense fallback={<HeaderFallback />}>
              <Navbar />
            </Suspense>
            <AppMain>{children}</AppMain>
            <Suspense fallback={<MobileNavFallback />}>
              <MobileBottomNav />
            </Suspense>
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
