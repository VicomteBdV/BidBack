"use client";
import React, { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";

export function SetupProvider({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  return <WagmiProvider config={wagmiConfig} reconnectOnMount={false}><QueryClientProvider client={client}>{children}</QueryClientProvider></WagmiProvider>;
}
