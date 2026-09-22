import type { Metadata, Viewport } from "next";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Rickhouse", template: "%s · Rickhouse" },
  description: "A bottle tracker for the crazy home enthusiast of whiskey, rum, and spirits of all types.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  // Both, so the browser chrome matches whichever theme is actually showing.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf6f0" },
    { media: "(prefers-color-scheme: dark)", color: "#120d08" },
  ],
  width: "device-width",
  initialScale: 1,
  // The phone is a primary target: let content run under the notch.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/*
         * Stamps data-theme before first paint. Without this a stored "light"
         * flashes the dark default while React hydrates, which is the one
         * thing a theme toggle must never do.
         */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
