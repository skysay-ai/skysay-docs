import "./globals.css";

// Root layout for the standalone docs app. On skysay.ai this app serves
// only /docs, /blog, /llms.txt, /llms-full.txt, /raw and /api/search; the rest
// of the site is a separate app behind the same hostname. Metadata below
// mirrors the site-wide metadata so page <title> and social cards are identical
// at those paths.
export const metadata = {
  title: {
    default: "Skysay - Telephony for AI Agents",
    template: "%s - Skysay",
  },
  description: "Phone numbers, calls, SMS, recordings, transcripts, and compliance-aware onboarding for AI agents.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://skysay.ai"),
  openGraph: {
    title: "Skysay - Telephony for AI Agents",
    description: "Phone numbers, calls, SMS, recordings, transcripts, and compliance-aware onboarding for AI agents.",
    images: ["/brand/preview/skysay-header-implementation.png"],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Skysay - Telephony for AI Agents",
    description: "Phone numbers, calls, SMS, recordings, transcripts, and compliance-aware onboarding for AI agents.",
    images: ["/brand/preview/skysay-header-implementation.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48x48.png", sizes: "48x48", type: "image/png" },
    ],
    shortcut: [{ url: "/favicon.ico", type: "image/x-icon" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/site.webmanifest",
};

export const viewport = {
  themeColor: "#0A0A13",
};

export default function RootLayout({ children }) {
  return (
    <html className="dark" data-scroll-behavior="smooth" lang="en">
      <body>{children}</body>
    </html>
  );
}
