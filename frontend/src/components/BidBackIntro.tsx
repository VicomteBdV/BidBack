import Link from "next/link";
import React from "react";
import { targetChainLabel } from "@/lib/chains";

export function BidBackIntro() {
  return (
    <section id="how-it-works" className="marketplace-hero scroll-mt-6">
      <div className="marketplace-hero-inner relative z-10">
        <div className="max-w-3xl">
          <p className="premium-eyebrow">BidBack auction house</p>
          <h1 className="editorial-title mt-2 max-w-3xl text-3xl leading-[1.02] sm:text-4xl xl:text-[2.9rem]">
            The auction matters, even when you do not win.
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            Browse live NFT auctions with refundable losing caps and a separate conditional redistribution that can be zero.
          </p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Link href="#marketplace-auctions" className="primary-link w-full sm:w-auto">
              Browse live lots →
            </Link>
            <Link href="/create" className="secondary-link w-full sm:w-auto">
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
            className="mt-2 inline-flex min-h-8 items-center text-xs font-bold text-cyan-200 underline decoration-cyan-400/40 underline-offset-4"
          >
            Participation and test checklist →
          </Link>
        </div>
      </div>
    </section>
  );
}
