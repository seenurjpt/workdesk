import type { Metadata, Viewport } from "next";
import { Inter, Titillium_Web } from "next/font/google";
import { Providers } from "@/components/shared/providers";
import { THEME_INIT_SCRIPT } from "@/lib/theme-init";
import "./globals.css";

const titillium = Titillium_Web({
  variable: "--font-titillium",
  subsets: ["latin"],
  weight: ["600", "700"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "500", "600"],
  display: "swap",
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const DESCRIPTION = "Tasks, notes and meeting notes for your workday.";

export const metadata: Metadata = {
  // Needed so share-card image URLs are absolute. Set NEXT_PUBLIC_APP_URL to your real address.
  metadataBase: new URL(APP_URL),
  title: { default: "WorkDesk", template: "%s · WorkDesk" },
  description: DESCRIPTION,
  manifest: "/manifest.webmanifest",
  applicationName: "WorkDesk",
  // favicon.ico and icon.svg come from the files in src/app; only the touch icon is listed here.
  icons: { apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "WorkDesk", statusBarStyle: "default" },
  // Shared links show this card. The image comes from opengraph-image.png / twitter-image.png.
  openGraph: {
    type: "website",
    siteName: "WorkDesk",
    title: "WorkDesk",
    description: DESCRIPTION,
    url: "/",
  },
  twitter: { card: "summary_large_image", title: "WorkDesk", description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0d0c" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${titillium.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        {/* Sets the saved theme before first paint, so there is no flash. Rendered on the server only. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
