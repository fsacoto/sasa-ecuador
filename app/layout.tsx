import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { InventoryProvider } from "./context/InventoryContext";
import { CMSProvider } from "./context/CMSContext";
import { AuthProvider } from "./context/AuthContext";
import { TranslationProvider } from "./context/TranslationContext";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SASA — Centro de gestión",
  description: "Gestión de inventario y operaciones para SASA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistSans.className} font-sans antialiased`}
        suppressHydrationWarning
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