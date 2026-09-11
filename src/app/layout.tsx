import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Space_Grotesk, Manrope, JetBrains_Mono } from "next/font/google";
import { CryptoProvider } from "@/components/crypto-provider";
import { ServiceWorker } from "@/components/service-worker";
import "./globals.css";

/* Three faces, each with a job, see the note at the top of `globals.css`. */

const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
});

const sans = Manrope({
  variable: "--font-sans-ui",
  subsets: ["latin"],
});

const mono = JetBrains_Mono({
  variable: "--font-mono-figure",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Insight",
  description:
    "Track how you study and what you score, and see where the two line up.",
  // iOS ignores the web manifest for the home screen icon and for whether the
  // app opens without Safari's chrome. These are the tags it does read.
  appleWebApp: {
    capable: true,
    title: "Insight",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
  other: {
    // Next emits the modern `mobile-web-app-capable`, which current Safari
    // honours. The Apple-prefixed one is deprecated and still the only thing
    // older iOS reads, and a pilot runs on whatever phones students already
    // have, which includes hand-me-downs.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#0e0e11",
  // Installed to a home screen, the app runs under the notch and past the home
  // indicator; `viewport-fit` is what lets the safe-area insets apply.
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-bg text-text">
        {/* ClerkProvider belongs inside <body>, not wrapping <html>. */}
        <ClerkProvider
          appearance={{
            variables: {
              // Clerk derives borders, hover states and social-button text
              // from this, and it defaults to black. On a dark card that
              // renders the Google button's label at 62% black on near-black.
              // Dark themes have to invert it.
              colorNeutral: "white",

              // These have to be literal hexes, Clerk renders inside its own
              // tree and cannot read our custom properties, so they are the
              // one place in the app where the palette is duplicated. If the
              // tokens in `globals.css` move, these move with them.
              colorBackground: "#17171c",
              colorForeground: "#f0f0f3",
              colorPrimary: "#00e0b8",
              colorPrimaryForeground: "#0e0e11",
              colorInput: "#0e0e11",
              colorInputForeground: "#f0f0f3",
              colorMuted: "#1f1f26",
              colorMutedForeground: "#a0a0ac",
              colorBorder: "rgba(255,255,255,0.14)",
              colorRing: "#00e0b8",
              colorDanger: "#ff7b6b",
              colorSuccess: "#6fe38a",
              fontFamily: "var(--font-sans-ui), system-ui, sans-serif",
              borderRadius: "8px",
            },
          }}
        >
          {/* Wraps everything so the key survives client-side navigation,
              notably from the signup password step straight to the dashboard,
              which would otherwise ask for the password a student just set. */}
          <CryptoProvider>{children}</CryptoProvider>
          <ServiceWorker />
        </ClerkProvider>
      </body>
    </html>
  );
}
