import type { Metadata } from "next";
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
        {children}
      </body>
    </html>
  );
}
