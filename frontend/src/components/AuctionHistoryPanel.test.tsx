import React from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuctionHistoryPanel } from "@/components/AuctionHistoryPanel";
import { auctionDetailFixture } from "@/test/fixtures";
import type { AuctionHistory } from "@/lib/auctionTypes";

function historyPage(indices: number[], options: Partial<AuctionHistory> = {}): AuctionHistory {
  return {
    ...auctionDetailFixture.auction.history,
    source: "bid-records-only",
    partial: true,
    warnings: ["Bid transaction metadata is unavailable."],
    bidsAvailable: true,
    totalBidCount: "4",
    returnedBidCount: indices.length,
    hasMoreBids: false,
    nextBefore: null,
    bids: indices.map((index) => ({ ...auctionDetailFixture.auction.history.bids[0], index: String(index), amount: String(BigInt(index + 1) * 10n ** 18n), transactionHash: undefined, blockNumber: undefined, logIndex: undefined })),
    ...options
  };
}

function response(history: AuctionHistory, status = 200) {
  return new Response(JSON.stringify({ auctionId: history.auctionId, history }), { status, headers: { "content-type": "application/json" } });
}

function deferredResponse() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}

function renderedIndices() {
  return within(screen.getByRole("table")).getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell")[0].textContent);
}

function mockHistoryFetch(response: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify(response), {
        status,
        headers: {
          "content-type": "application/json"
        }
      })
    )
  );
}

describe("AuctionHistoryPanel", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_BLOCK_EXPLORER_URL", "https://explorer.example");
  });

  it("exposes initial loading and replaces it with a loaded/total counter", async () => {
    const pending = deferredResponse();
    vi.stubGlobal("fetch", vi.fn(() => pending.promise));
    const { container } = render(<AuctionHistoryPanel auction={{ ...auctionDetailFixture.auction, history: undefined }} />);
    expect(screen.getByText("Loading bid history")).toBeInTheDocument();
    expect(container.querySelector("section")).toHaveAttribute("aria-busy", "true");
    await act(async () => pending.resolve(response(historyPage([2, 3], { hasMoreBids: true, nextBefore: "2" }))));
    expect(await screen.findByText("2 of 4 bids loaded")).toBeInTheDocument();
    expect(container.querySelector("section")).toHaveAttribute("aria-busy", "false");
  });

  it("loads earlier records in ascending order, deduplicates overlap, and preserves the initial timeline and warnings", async () => {
    const pending = deferredResponse();
    const initial = historyPage([2, 3], { hasMoreBids: true, nextBefore: "2", warnings: ["Initial timeline warning."] });
    const earlier = historyPage([0, 1, 2], { events: [], warnings: ["Earlier metadata unavailable."], totalBidCount: "5" });
    const fetchMock = vi.fn().mockResolvedValueOnce(response(initial)).mockReturnValueOnce(pending.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<AuctionHistoryPanel auction={{ ...auctionDetailFixture.auction, history: undefined }} />);
    const button = await screen.findByRole("button", { name: "Load earlier bids" });
    fireEvent.click(button);
    expect(screen.getByRole("button", { name: "Loading earlier bids..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Loading earlier bids..." })).toHaveAttribute("aria-busy", "true");
    expect(container.querySelector("section")).toHaveAttribute("aria-busy", "true");
    expect(renderedIndices()).toEqual(["2", "3"]);
    await act(async () => pending.resolve(response(earlier)));
    expect(await screen.findByText("4 of 4 bids loaded")).toBeInTheDocument();
    expect(renderedIndices()).toEqual(["0", "1", "2", "3"]);
    expect(screen.queryByRole("button", { name: "Load earlier bids" })).not.toBeInTheDocument();
    expect(screen.getByText(/Initial timeline warning.*Earlier metadata unavailable/)).toBeInTheDocument();
    expect(screen.getAllByText("Bid placed")).toHaveLength(2);
    expect(fetchMock.mock.calls[1][0]).toBe("/api/auctions/1/history?before=2");
    expect(within(screen.getByRole("table")).queryAllByRole("link")).toHaveLength(0);
    expect(within(screen.getByRole("table")).getAllByText("Transaction unavailable")).toHaveLength(4);
  });

  it("preserves loaded records and cursor after a failure and retries the same page", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(historyPage([2, 3], { hasMoreBids: true, nextBefore: "2" })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "Sensitive RPC details" }), { status: 503 }))
      .mockResolvedValueOnce(response(historyPage([0, 1], { events: [] })));
    vi.stubGlobal("fetch", fetchMock);
    render(<AuctionHistoryPanel auction={{ ...auctionDetailFixture.auction, history: undefined }} />);
    fireEvent.click(await screen.findByRole("button", { name: "Load earlier bids" }));
    expect(await screen.findByText(/Your loaded bids are preserved/)).toBeInTheDocument();
    expect(renderedIndices()).toEqual(["2", "3"]);
    expect(screen.queryByText("Sensitive RPC details")).not.toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Load earlier bids" });
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    expect(await screen.findByText("4 of 4 bids loaded")).toBeInTheDocument();
    expect(fetchMock.mock.calls[1][0]).toBe(fetchMock.mock.calls[2][0]);
    expect(screen.queryByText(/Your loaded bids are preserved/)).not.toBeInTheDocument();
  });

  it("refresh resets accumulated pages and discards late earlier-page responses even if fetch ignores abort", async () => {
    const pending = deferredResponse();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(historyPage([2, 3], { hasMoreBids: true, nextBefore: "2" })))
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(response(historyPage([9], { totalBidCount: "10", hasMoreBids: true, nextBefore: "9" })));
    vi.stubGlobal("fetch", fetchMock);
    render(<AuctionHistoryPanel auction={{ ...auctionDetailFixture.auction, history: undefined }} />);
    fireEvent.click(await screen.findByRole("button", { name: "Load earlier bids" }));
    fireEvent.click(screen.getByRole("button", { name: "Refresh history" }));
    expect(await screen.findByText("1 of 10 bids loaded")).toBeInTheDocument();
    expect((fetchMock.mock.calls[1][1] as RequestInit).signal?.aborted).toBe(true);
    await act(async () => pending.resolve(response(historyPage([0, 1], { events: [] }))));
    expect(renderedIndices()).toEqual(["9"]);
    expect(screen.getByRole("button", { name: "Load earlier bids" })).toBeEnabled();
  });

  it("clears a previous auction synchronously and ignores its late response after navigation", async () => {
    const oldPending = deferredResponse();
    const newPending = deferredResponse();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response(historyPage([2, 3], { hasMoreBids: true, nextBefore: "2" })))
      .mockReturnValueOnce(oldPending.promise)
      .mockReturnValueOnce(newPending.promise);
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(<AuctionHistoryPanel auction={{ ...auctionDetailFixture.auction, history: undefined }} />);
    fireEvent.click(await screen.findByRole("button", { name: "Load earlier bids" }));
    rerender(<AuctionHistoryPanel auction={{ ...auctionDetailFixture.auction, auctionId: "2", history: undefined }} />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("Bid placed")).not.toBeInTheDocument();
    await act(async () => oldPending.resolve(response(historyPage([0, 1]))));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    await act(async () => newPending.resolve(response(historyPage([7], { auctionId: "2", totalBidCount: "8", events: [] }))));
    expect(await screen.findByText("1 of 8 bids loaded")).toBeInTheDocument();
    expect(renderedIndices()).toEqual(["7"]);
    expect(screen.getByText("Bid records for Auction #2")).toBeInTheDocument();
  });

  it("guards against data returned for a different auction identity", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(historyPage([9], { auctionId: "2" }))));
    render(<AuctionHistoryPanel auction={{ ...auctionDetailFixture.auction, history: undefined }} />);
    expect(await screen.findByText(/Unable to read auction history/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("accepts a legacy response without envelope auctionId when nested identity matches, on both page phases", async () => {
    const initial = historyPage([2, 3], { hasMoreBids: true, nextBefore: "2" });
    const earlier = historyPage([0, 1]);
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ history: initial })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ history: earlier }))));
    render(<AuctionHistoryPanel auction={{ ...auctionDetailFixture.auction, history: undefined }} />);
    fireEvent.click(await screen.findByRole("button", { name: "Load earlier bids" }));
    expect(await screen.findByText("4 of 4 bids loaded")).toBeInTheDocument();
    expect(renderedIndices()).toEqual(["0", "1", "2", "3"]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each(["conflicting envelope", "missing nested identity"])("rejects %s on initial and earlier pages", async (failure) => {
    const invalid = (history: AuctionHistory) => new Response(JSON.stringify({
      auctionId: failure === "conflicting envelope" ? "2" : "1",
      history: failure === "missing nested identity" ? { ...history, auctionId: undefined } : history
    }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(invalid(historyPage([9])))
      .mockResolvedValueOnce(response(historyPage([2, 3], { hasMoreBids: true, nextBefore: "2" })))
      .mockResolvedValueOnce(invalid(historyPage([0, 1])));
    vi.stubGlobal("fetch", fetchMock);
    render(<AuctionHistoryPanel auction={{ ...auctionDetailFixture.auction, history: undefined }} />);
    expect(await screen.findByText(/Unable to read auction history/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh history" }));
    fireEvent.click(await screen.findByRole("button", { name: "Load earlier bids" }));
    expect(await screen.findByText(/Your loaded bids are preserved/)).toBeInTheDocument();
    expect(renderedIndices()).toEqual(["2", "3"]);
    expect(screen.getByRole("button", { name: "Load earlier bids" })).toBeEnabled();
  });

  it("prevents concurrent duplicate earlier-page requests", async () => {
    const pending = deferredResponse();
    const fetchMock = vi.fn().mockResolvedValueOnce(response(historyPage([2, 3], { hasMoreBids: true, nextBefore: "2" }))).mockReturnValue(pending.promise);
    vi.stubGlobal("fetch", fetchMock);
    render(<AuctionHistoryPanel auction={{ ...auctionDetailFixture.auction, history: undefined }} />);
    const button = await screen.findByRole("button", { name: "Load earlier bids" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await act(async () => pending.resolve(response(historyPage([0, 1]))));
  });

  it.each([
    { bidsAvailable: false, source: "events-only" as const, hasMoreBids: false, nextBefore: null },
    { bidsAvailable: true, source: "bid-records-only" as const, hasMoreBids: true, nextBefore: "2" }
  ])("never calls unread or incomplete canonical data an empty auction: %j", async (options) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(historyPage([], { ...options, totalBidCount: "4" }))));
    render(<AuctionHistoryPanel auction={{ ...auctionDetailFixture.auction, history: undefined }} />);
    expect(await screen.findByText("0 of 4 bids loaded")).toBeInTheDocument();
    expect(screen.queryByText("No bids yet")).not.toBeInTheDocument();
    if (!options.bidsAvailable) expect(screen.getByText("Bid records unavailable")).toBeInTheDocument();
  });

  it("renders bid history, transparency values, and explorer transaction links", async () => {
    mockHistoryFetch({
      chainId: auctionDetailFixture.chainId,
      auctionHouse: auctionDetailFixture.auctionHouse,
      auctionId: auctionDetailFixture.auction.auctionId,
      history: auctionDetailFixture.auction.history
    });

    render(<AuctionHistoryPanel auction={auctionDetailFixture.auction} />);

    expect(screen.getByRole("heading", { name: "Bid history / Auction transparency" })).toBeInTheDocument();
    expect(screen.getAllByText("1.2 ETH").length).toBeGreaterThan(0);
    expect(screen.getByText("Recorded configured refunds")).toBeInTheDocument();
    expect(screen.getByText("Recorded reward entitlements")).toBeInTheDocument();
    expect(await screen.findAllByText("Bid placed")).toHaveLength(2);
    expect(screen.getAllByTitle("0x1111111111111111111111111111111111111111111111111111111111111111")[0]).toHaveAttribute(
      "href",
      "https://explorer.example/tx/0x1111111111111111111111111111111111111111111111111111111111111111"
    );
  });

  it("renders a clean empty state when no bids or logs are available", async () => {
    mockHistoryFetch({
      chainId: auctionDetailFixture.chainId,
      auctionHouse: auctionDetailFixture.auctionHouse,
      auctionId: auctionDetailFixture.auction.auctionId,
      history: {
        ...auctionDetailFixture.auction.history,
        source: "bid-records-only",
        bids: [],
        events: []
      }
    });

    render(<AuctionHistoryPanel auction={{ ...auctionDetailFixture.auction, history: undefined }} />);

    expect(
  await screen.findByText(
    "No bids have been recorded for this auction yet. Bid history will appear after the first valid bid.",
  ),
).toBeInTheDocument();
    expect(screen.getByText(/No matching logs were returned by the RPC/)).toBeInTheDocument();
  });

  it("keeps the panel usable when history cannot be loaded", async () => {
    mockHistoryFetch({ error: "RPC log range unavailable" }, 503);

    render(<AuctionHistoryPanel auction={{ ...auctionDetailFixture.auction, history: undefined }} />);

    expect(await screen.findByText(/RPC log range unavailable/)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Auction history could not be refreshed");
    expect(screen.getByText("Highest bid")).toBeInTheDocument();
    expect(screen.getByText("Seller proceeds")).toBeInTheDocument();
  });
});
