import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useAccount, useConnect, useConfig, useDisconnect, type Connector } from "wagmi";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WalletButton } from "./WalletButton";

vi.mock("wagmi", () => ({ useAccount: vi.fn(), useConnect: vi.fn(), useConfig: vi.fn(), useDisconnect: vi.fn() }));
vi.mock("wagmi/actions", () => ({ getAccount: () => useAccount() }));

function wallet(id: string, name: string, provider: unknown = { request: vi.fn().mockResolvedValue(null) }) {
  return { id, uid: id, name, type: "injected", getProvider: vi.fn(async () => provider) } as unknown as Connector;
}

const connect = vi.fn();
function setup(connectors: Connector[], { connected, error, pending = false }: {
  connected?: Connector; error?: unknown; pending?: boolean;
} = {}) {
  vi.mocked(useAccount).mockReturnValue({ connector: connected, isConnected: Boolean(connected),
    address: connected ? "0x1111111111111111111111111111111111111111" : undefined,
    chainId: connected ? 1 : undefined } as ReturnType<typeof useAccount>);
  vi.mocked(useConnect).mockReturnValue({ connectors, connect, isPending: pending, error, reset: vi.fn() } as unknown as ReturnType<typeof useConnect>);
  vi.mocked(useConfig).mockReturnValue({} as ReturnType<typeof useConfig>);
  vi.mocked(useDisconnect).mockReturnValue({ disconnect: vi.fn() } as unknown as ReturnType<typeof useDisconnect>);
  return render(<><p>Read-only auctions</p><WalletButton /></>);
}

beforeEach(() => vi.clearAllMocks());

describe("wallet choice and connector-aware network switching", () => {
  it.each([{ connectors: [] }, { connectors: [wallet("injected", "Injected")] }])("remains read-only with no available provider", async ({ connectors }) => {
    // A configured injected connector alone is not proof that an extension exists.
    for (const connector of connectors) vi.mocked(connector.getProvider).mockResolvedValue(undefined);
    setup(connectors);
    expect(await screen.findByText(/No compatible browser wallet was detected/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect wallet" })).toBeDisabled();
    expect(screen.getByText("Read-only auctions")).toBeInTheDocument();
    expect(connect).not.toHaveBeenCalled();
  });

  it("connects a single actual connector directly", async () => {
    const b = wallet("b", "Wallet B");
    setup([b]);
    fireEvent.click(await screen.findByRole("button", { name: "Connect Wallet B" }));
    expect(connect).toHaveBeenCalledExactlyOnceWith({ connector: b });
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("requires explicit selection and connects B rather than A or the legacy alias", async () => {
    const a = wallet("a", "Wallet A");
    const b = wallet("b", "Wallet B");
    setup([wallet("injected", "Injected"), a, b]);
    const selector = await screen.findByRole("combobox", { name: "Choose your wallet" });
    expect(selector).toHaveValue("");
    expect(screen.getByRole("button", { name: "Connect wallet" })).toBeDisabled();
    expect(connect).not.toHaveBeenCalled();
    expect(screen.queryByRole("option", { name: "Browser wallet" })).not.toBeInTheDocument();
    fireEvent.change(selector, { target: { value: "b" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect Wallet B" }));
    expect(connect).toHaveBeenCalledExactlyOnceWith({ connector: b });
  });

  it("switches only through connected B even when global A exists", async () => {
    const providerA = { request: vi.fn() };
    const providerB = { request: vi.fn().mockResolvedValue(null) };
    Object.defineProperty(window, "ethereum", { configurable: true, value: providerA });
    const a = wallet("a", "Wallet A", providerA);
    const b = wallet("b", "Wallet B", providerB);
    setup([a, b], { connected: b });
    expect(screen.getByText("Wallet B")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Switch to Anvil Local" }));
    await waitFor(() => expect(providerB.request).toHaveBeenCalledExactlyOnceWith({
      method: "wallet_switchEthereumChain", params: [{ chainId: "0x7a69" }]
    }));
    expect(providerA.request).not.toHaveBeenCalled();
  });

  it.each([
    [4001, /Network switch was rejected/],
    [-32002, /A wallet request is already pending/],
    [123, /Unable to switch wallet network/]
  ])("shows bounded feedback for network error %s", async (code, message) => {
    const b = wallet("b", "Wallet B", { request: vi.fn().mockRejectedValue({ code, message: "SECRET" }) });
    setup([b], { connected: b });
    fireEvent.click(screen.getByRole("button", { name: "Switch to Anvil Local" }));
    expect(await screen.findByText(message as RegExp)).toBeInTheDocument();
    expect(screen.queryByText(/SECRET/)).not.toBeInTheDocument();
  });

  it.each([
    [4001, /Wallet connection was rejected/],
    [-32002, /A wallet request is already pending/],
    [123, /Unable to connect this wallet/]
  ])("shows bounded feedback for connection error %s", async (code, message) => {
    setup([wallet("b", "Wallet B")], { error: { cause: { code }, message: "SECRET" } });
    expect(await screen.findByText(message as RegExp)).toBeInTheDocument();
    expect(screen.queryByText(/SECRET/)).not.toBeInTheDocument();
  });

  it("disables connection while a request is pending", async () => {
    setup([wallet("b", "Wallet B")], { pending: true });
    await screen.findByText("Waiting for the wallet connection request.");
    expect(screen.getByRole("button", { name: "Connecting..." })).toBeDisabled();
  });

  it("keeps a network request visibly pending until the wallet responds", async () => {
    let finish!: () => void;
    const request = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const b = wallet("b", "Wallet B", { request });
    setup([b], { connected: b });
    fireEvent.click(screen.getByRole("button", { name: "Switch to Anvil Local" }));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Switching..." })).toBeDisabled();
    finish();
    expect(await screen.findByText(/Switch request sent/)).toBeInTheDocument();
  });
});
