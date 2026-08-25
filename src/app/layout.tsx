import type { Metadata, Viewport } from "next";

import { AppShell } from "@/components/layout/app-shell";
import { CollectionsProvider } from "@/components/providers/collections";
import { ThemeProvider, themeScript } from "@/components/providers/theme";
import { ToastProvider } from "@/components/providers/toast";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Curated, semantic music, film and TV discovery",
    template: "%s · Curated",
  },
  description:
    "Describe what you're in the mood for and get music, films and series that actually match, then curate them into playlists and watchlists.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f9" },
    { media: "(prefers-color-scheme: dark)", color: "#08080c" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Paint the stored theme before first render to avoid a flash. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">
        <ThemeProvider>
          <ToastProvider>
            <CollectionsProvider>
              <AppShell>{children}</AppShell>
            </CollectionsProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
