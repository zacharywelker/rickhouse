import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Rickhouse", template: "%s · Rickhouse" },
  description: "A bottle tracker for the crazy home enthusiast of whiskey, rum, and spirits of all types.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#120d08",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Dark by default (SPEC M6). The `light` class is the opt-out.
  return (
    <html lang="en">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
