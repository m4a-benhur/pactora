import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "@/components/wallet-context";

export const metadata: Metadata = {
  title: "Pactora",
  description: "Every agreement deserves protection.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}