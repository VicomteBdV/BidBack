import Link from "next/link";
import React from "react";
import { OpenFrameSculpture } from "@/components/experience/OpenFrameSculpture";
import { targetChainLabel } from "@/lib/chains";

export function BidBackIntro() {
  return (
    <section id="how-it-works" className="marketplace-hero scroll-mt-6">
      <div className="marketplace-hero-inner">
        <div className="marketplace-hero-heading">
          <p className="premium-eyebrow">An open frame for digital art</p>
          <h1 className="editorial-title marketplace-hero-title">
            Art worth a closer look.
          </h1>
        </div>

        <OpenFrameSculpture />

        <div className="marketplace-hero-copy">
          <p className="marketplace-hero-description">
            Discover NFT auctions with refundable losing caps and a separate conditional redistribution that can be zero.
          </p>

          <div className="marketplace-hero-actions">
            <Link href="#marketplace-auctions" className="primary-link w-full sm:w-auto">
              Explore auctions <span aria-hidden="true">↗</span>
            </Link>
            <Link href="/create" className="hero-secondary-link">
              Create an auction
            </Link>
          </div>
        </div>

        <div className="marketplace-hero-note">
          <p>
            <strong>Controlled testnet preview on {targetChainLabel}.</strong> Test assets only. Gas fees are separate and
            non-refundable; redistribution is conditional and never guaranteed.
          </p>
          <Link
            href="https://github.com/VicomteBdV/BidBack/blob/main/docs/BASE_SEPOLIA_SMOKE_TEST.md"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-cyan-200 underline decoration-cyan-400/40 underline-offset-4"
          >
            Participation and test checklist →
          </Link>
        </div>
      </div>
    </section>
  );
}
