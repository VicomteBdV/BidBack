import Link from "next/link";
import React from "react";
import { WalletButton } from "@/components/WalletButton";
import { targetChainLabel } from "@/lib/chains";

const navigation = [
  { href: "/", label: "Marketplace", marker: "01" },
  { href: "/#how-it-works", label: "How it works", marker: "02" },
  { href: "/#wallet-activity", label: "My activity", marker: "03" },
  { href: "/create", label: "Create auction", marker: "04" }
];

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className={`auction-brand ${compact ? "auction-brand-compact" : ""}`} aria-label="BidBack marketplace home">
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

      <div className="app-shell-grid">
        <aside className="app-rail" aria-label="BidBack navigation and environment">
          <div>
            <Brand />
            <p className="app-rail-motto">Where every bid is fair, transparent, and verifiable.</p>
          </div>

          <nav aria-label="Primary navigation" className="app-rail-nav">
            {navigation.map((item) => (
              <Link key={item.href} href={item.href} className="app-rail-link">
                <span aria-hidden="true">{item.marker}</span>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="app-rail-environment">
            <span className="app-rail-environment-label">Controlled testnet preview</span>
            <p>You are using a controlled environment on {targetChainLabel}. Test assets only. No real value.</p>
            <Link href="/#trust-rules-title">Read the participation rules →</Link>
          </div>
        </aside>

        <div className="app-workspace">
          <header className="app-topbar">
            <div className="lg:hidden">
              <Brand compact />
            </div>

            <p className="app-topbar-motto hidden lg:block">A contemporary marketplace for verifiable NFT auctions.</p>

            <span className="environment-badge" title={`Configured for ${targetChainLabel}`}>
              Controlled testnet preview
            </span>

            <div className="app-topbar-actions">
              <Link href="/create" className="brush-link hidden sm:inline-flex">
                Create auction
              </Link>
              <WalletButton />
            </div>
          </header>

          <main id="main-content" className="app-content">
            {children}
          </main>

          <footer className="app-footer">
            <span aria-hidden="true">⚖</span>
            Controlled testnet on {targetChainLabel}. Test assets only; gas fees are non-refundable.
          </footer>
        </div>
      </div>
    </div>
  );
}
