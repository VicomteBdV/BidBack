import React, { type ReactNode } from "react";
import type { Metadata } from "next";
import { SetupProvider } from "@/setup/SetupProvider";
import "./setup.css";

export const metadata: Metadata = { title: "BidBack | Testnet setup", description: "Isolated, wallet-controlled BidBack setup on Base Sepolia. Test ETH only." };
export default function SetupLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><SetupProvider>{children}</SetupProvider></body></html>;
}
