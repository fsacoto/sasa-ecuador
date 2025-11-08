import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { InventoryProvider } from "./context/InventoryContext";
import { CMSProvider } from "./context/CMSContext";
import { AuthProvider } from "./context/AuthContext";
import { TranslationProvider } from "./context/TranslationContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SASA Business Hub",
  description: "Jewelry inventory management system for SASA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <TranslationProvider>
          <AuthProvider>
            <InventoryProvider>
              <CMSProvider>
                {children}
              </CMSProvider>
            </InventoryProvider>
          </AuthProvider>
        </TranslationProvider>
      </body>
    </html>
  );
}