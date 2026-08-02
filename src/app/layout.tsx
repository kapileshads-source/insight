import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Familjen_Grotesk } from "next/font/google";
import "./globals.css";

const familjen = Familjen_Grotesk({
  variable: "--font-familjen",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Insight",
  description:
    "Track how you study and what you score, and see where the two line up.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${familjen.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-bg text-text">
        {/* ClerkProvider belongs inside <body>, not wrapping <html>. */}
        <ClerkProvider
          appearance={{
            variables: {
              colorScheme: "dark",
              // Clerk derives borders, hover states and social-button text
              // from this, and it defaults to black. On a Midnight card that
              // renders the Google button's label at 62% black on near-black.
              // Dark themes have to invert it.
              colorNeutral: "white",

              colorBackground: "#1f2432",
              colorForeground: "#e9ecf2",
              colorPrimary: "#a8c8e0",
              colorPrimaryForeground: "#171b26",
              colorInput: "#171b26",
              colorInputForeground: "#e9ecf2",
              colorMuted: "#262c3c",
              colorMutedForeground: "#98a1b5",
              colorBorder: "rgba(255,255,255,0.12)",
              colorRing: "#a8c8e0",
              colorDanger: "#d3a081",
              colorSuccess: "#86a98c",
              fontFamily: "var(--font-familjen), system-ui, sans-serif",
              borderRadius: "8px",
            },
          }}
        >
          {children}
        </ClerkProvider>
      </body>
    </html>
  );
}
