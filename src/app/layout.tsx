import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

// Aileron — free, public-domain grotesk (open-foundry.com/fonts/aileron).
// Self-hosted as static files since it isn't on Google Fonts.
const aileron = localFont({
  src: [
    { path: "../fonts/aileron/Aileron-Regular.woff2", weight: "400", style: "normal" },
    { path: "../fonts/aileron/Aileron-Italic.woff2", weight: "400", style: "italic" },
    { path: "../fonts/aileron/Aileron-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "../fonts/aileron/Aileron-SemiBoldItalic.woff2", weight: "600", style: "italic" },
    { path: "../fonts/aileron/Aileron-Bold.woff2", weight: "700", style: "normal" },
    { path: "../fonts/aileron/Aileron-BoldItalic.woff2", weight: "700", style: "italic" },
  ],
  variable: "--font-aileron",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Rickhouse", template: "%s · Rickhouse" },
  description: "A bottle tracker for the crazy home enthusiast of whiskey, rum, and spirits of all types.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  // Both, so the browser chrome matches whichever theme is actually showing.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf8f1" },
    { media: "(prefers-color-scheme: dark)", color: "#181713" },
  ],
  width: "device-width",
  initialScale: 1,
  // The phone is a primary target: let content run under the notch.
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={aileron.variable}>
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
