import Link from "next/link";
import React from "react";
import { WalletButton } from "@/components/WalletButton";
import { ResponsiveDisclosure } from "@/components/experience/ResponsiveDisclosure";
import { targetChainLabel } from "@/lib/chains";

const navigation = [
  { href: "/", label: "Marketplace", marker: "01" },
  { href: "/#how-it-works", label: "How it works", marker: "02" },
  { href: "/#wallet-activity", label: "My activity", marker: "03" },
  { href: "/create", label: "Create auction", marker: "04" },
  { href: "/#trust-rules-title", label: "Participation rules", marker: "05" }
];

function Brand() {
  return (
    <Link href="/" className="auction-brand" aria-label="BidBack marketplace home">
      <span className="auction-brand-mark" aria-hidden="true">B</span>
      <span>
        <span className="auction-brand-name">BidBack</span>
        <span className="auction-brand-subtitle">Auction house</span>
      </span>
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-canvas">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <div className="app-workspace">
        <header className="app-header">
          <div className="app-masthead">
            <div className="app-brand-row">
              <Brand />
              <ResponsiveDisclosure summary="Menu" summaryLabel="Navigation menu" className="app-navigation-disclosure">
                <nav aria-label="Primary navigation" className="app-navigation">
                  {navigation.map((item) => (
                    <Link key={item.href} href={item.href} className="app-navigation-link">
                      <span aria-hidden="true">{item.marker}</span>
                      {item.label}
                    </Link>
                  ))}
                </nav>
              </ResponsiveDisclosure>
            </div>

            <div className="app-environment" aria-label="Current environment">
              <span className="environment-badge" title={`Configured for ${targetChainLabel}`}>
                Controlled testnet
              </span>
              <span className="app-environment-chain">{targetChainLabel}</span>
              <p>Test assets only. No real value.</p>
            </div>

            <div className="app-wallet">
              <WalletButton presentation="masthead" />
            </div>
          </div>
        </header>

        <main id="main-content" className="app-content">
          {children}
        </main>

        <footer className="app-footer">
          <span className="app-footer-brand">BidBack</span>
          <p>Controlled testnet on {targetChainLabel}. Test assets only; gas fees are non-refundable.</p>
        </footer>
      </div>
    </div>
  );
}
