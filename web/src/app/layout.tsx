import type { Metadata } from "next";
import "./globals.css";
import { Fraunces, Figtree } from "next/font/google";
import { WalletProvider } from "@/components/wallet-context";
import { SiteHeader } from "@/components/site-header";

export const metadata: Metadata = {
  title: "Pactora",
  description: "Every agreement deserves protection.",
};

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces" });
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${figtree.variable}`}>
      <body className="antialiased">
        <WalletProvider>
          <SiteHeader />
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}