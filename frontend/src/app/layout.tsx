import type { Metadata } from "next";
import { Web3Provider } from "@/providers/Web3Provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "BidBack MVP",
  description: "Local BidBack MVP interface for Codespaces and Anvil"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Web3Provider>{children}</Web3Provider>
      </body>
    </html>
  );
}