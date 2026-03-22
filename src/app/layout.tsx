import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import Navbar from "../components/Navbar";
import AppProviders from "../components/AppProviders";
import AppMain from "../components/AppMain";
import MobileBottomNav from "../components/MobileBottomNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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
  return <div className="app-header h-[3.5rem] w-full sm:h-[4.5rem]" aria-hidden="true" />;
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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AppProviders>
          <Suspense fallback={<HeaderFallback />}>
            <Navbar />
          </Suspense>
          <AppMain>{children}</AppMain>
          <Suspense fallback={<MobileNavFallback />}>
            <MobileBottomNav />
          </Suspense>
        </AppProviders>
      </body>
    </html>
  );
}
