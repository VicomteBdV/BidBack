"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  type Address,
  type EIP1193Provider,
  type PublicClient
} from "viem";
import { useAccount } from "wagmi";
import { auctionHouseAbi } from "@/contracts/auctionHouseAbi";
import { erc721Abi } from "@/contracts/erc721Abi";
import { paramsControllerAbi } from "@/contracts/paramsControllerAbi";
import { CreateAuctionFields } from "@/components/CreateAuctionFields";
import { targetChain, targetChainId, targetChainLabel } from "@/lib/chains";
import { validateCreateAuctionFields, parseCreateAuctionValues } from "@/lib/createAuctionValidation";
import { fetchDeployment } from "@/lib/deployment";
import { formatDurationSeconds, shortenAddress } from "@/lib/format";

type CreateContext = {
  chainId: number;
  auctionHouse: Address;
  nftVault: Address;
  localNft?: Address;
  paramsController: Address;
  minAuctionDuration: string | null;
  paused: boolean | null;
  defaultTokenId: string;
  defaultDuration: string;
};

type WindowWithInjectedEthereum = Window & {
  ethereum?: EIP1193Provider;
};

function sameAddress(a?: string | null, b?: string | null) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

function walletErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object") {
    const candidate = error as { shortMessage?: unknown; details?: unknown; message?: unknown };

    if (typeof candidate.shortMessage === "string") return candidate.shortMessage;
    if (typeof candidate.details === "string") return candidate.details;
    if (typeof candidate.message === "string") return candidate.message;
  }

  return error instanceof Error ? error.message : fallback;
}

function getInjectedEthereum(): EIP1193Provider {
  if (typeof window === "undefined") {
    throw new Error("Wallet provider not found. Open this page in a browser with MetaMask.");
  }

  const provider = (window as WindowWithInjectedEthereum).ethereum;

  if (!provider) {
    throw new Error("Wallet provider not found. Install or unlock MetaMask.");
  }

  return provider;
}

function createBrowserClients(account: Address) {
  const provider = getInjectedEthereum();

  return {
    provider,
    publicClient: createPublicClient({
      chain: targetChain,
      transport: custom(provider)
    }),
    walletClient: createWalletClient({
      account,
      chain: targetChain,
      transport: custom(provider)
    })
  };
}

function getField<T>(raw: unknown, key: string, index: number): T {
  if (Array.isArray(raw)) return raw[index] as T;
  return (raw as Record<string, unknown>)[key] as T;
}

function toBigInt(value: unknown) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (typeof value === "string") return BigInt(value);
  return 0n;
}

async function verifyWalletChain(provider: EIP1193Provider) {
  let walletChainId: unknown;

  try {
    walletChainId = await provider.request({ method: "eth_chainId" });
  } catch (error) {
    throw new Error(
      `Wallet RPC unreachable. Wallet-signed mode requires MetaMask access to the target RPC. ${walletErrorMessage(
        error,
        ""
      )}`
    );
  }

  if (typeof walletChainId !== "string" || Number.parseInt(walletChainId, 16) !== targetChainId) {
    throw new Error(`Wrong network. Wallet-signed mode requires the target chain (${targetChainLabel}).`);
  }
}

async function readCreateParams(publicClient: PublicClient, context: CreateContext) {
  const [paramsRaw, paused] = await Promise.all([
    publicClient.readContract({
      address: context.paramsController,
      abi: paramsControllerAbi,
      functionName: "params"
    }),
    publicClient.readContract({
      address: context.paramsController,
      abi: paramsControllerAbi,
      functionName: "paused"
    })
  ]);

  return {
    minAuctionDuration: toBigInt(getField(paramsRaw, "minAuctionDuration", 10)).toString(),
    paused
  };
}

export function WalletCreateAuctionForm() {
  const { address, chainId, isConnected } = useAccount();

  const [context, setContext] = useState<CreateContext | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [isContextLoading, setIsContextLoading] = useState(true);

  const [nftContract, setNftContract] = useState("");
  const [tokenId, setTokenId] = useState("");
  const [startPriceEth, setStartPriceEth] = useState("1");
  const [durationSeconds, setDurationSeconds] = useState("");

  const [owner, setOwner] = useState<Address | null>(null);
  const [approvedAddress, setApprovedAddress] = useState<Address | null>(null);
  const [approvedForAll, setApprovedForAll] = useState<boolean | null>(null);

  const [isChecking, setIsChecking] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [approvalTxHash, setApprovalTxHash] = useState<`0x${string}` | null>(null);
  const [createTxHash, setCreateTxHash] = useState<`0x${string}` | null>(null);
  const [createdAuctionId, setCreatedAuctionId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadContext() {
      try {
        setIsContextLoading(true);

        const deployment = await fetchDeployment();

        if (active) {
          const loaded: CreateContext = {
            chainId: deployment.chainId,
            auctionHouse: deployment.contracts.auctionHouse,
            nftVault: deployment.contracts.nftVault,
            localNft: deployment.contracts.localNft,
            paramsController: deployment.contracts.paramsController,
            minAuctionDuration: null,
            paused: null,
            defaultTokenId: deployment.contracts.localNft ? "2" : "",
            defaultDuration: "7200"
          };

          setContext(loaded);
          setContextError(null);
          setNftContract((current) => current || loaded.localNft || "");
          setTokenId((current) => current || loaded.defaultTokenId);
          setDurationSeconds((current) => current || loaded.defaultDuration);
        }
      } catch (caught) {
        if (active) {
          setContext(null);
          setContextError(caught instanceof Error ? caught.message : "Unable to load wallet-signed context");
        }
      } finally {
        if (active) {
          setIsContextLoading(false);
        }
      }
    }

    loadContext();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setOwner(null);
    setApprovedAddress(null);
    setApprovedForAll(null);
    setApprovalTxHash(null);
    setCreateTxHash(null);
    setCreatedAuctionId(null);
  }, [address, chainId, nftContract, tokenId]);

  const values = useMemo(
    () => ({ nftContract, tokenId, startPriceEth, durationSeconds }),
    [durationSeconds, nftContract, startPriceEth, tokenId]
  );

  const validationError = useMemo(
    () =>
      validateCreateAuctionFields(values, {
        minAuctionDuration: context?.minAuctionDuration,
        paused: context?.paused === true
      }),
    [context, values]
  );

  const wrongNetwork = isConnected && chainId !== targetChainId;
  const ownerMatches = Boolean(owner && address && sameAddress(owner, address));
  const hasApproval = Boolean(
    ownerMatches && context && (approvedForAll || sameAddress(approvedAddress, context.nftVault))
  );

  const modeMessage = !isConnected
    ? "Connect a wallet to use wallet-signed mode."
    : wrongNetwork
      ? `Wallet connected, but not on the target chain (${targetChainLabel}).`
      : null;

  async function checkOwnershipAndApproval(successMessage?: string) {
    if (!address) throw new Error("Wallet not connected.");
    if (!context) throw new Error("Deployment context is unavailable.");
    if (wrongNetwork) throw new Error(`Wrong network. Switch MetaMask to the target chain (${targetChainLabel}).`);
    if (validationError) throw new Error(validationError);

    try {
      setIsChecking(true);
      setMessage(null);

      const parsed = parseCreateAuctionValues(values);
      const { provider, publicClient } = createBrowserClients(address);

      await verifyWalletChain(provider);

      const nextParams = await readCreateParams(publicClient, context);

      setContext((current) => (current ? { ...current, ...nextParams } : current));

      const paramsValidationError = validateCreateAuctionFields(values, nextParams);

      if (paramsValidationError) {
        throw new Error(paramsValidationError);
      }

      let tokenOwner: Address;

      try {
        tokenOwner = await publicClient.readContract({
          address: parsed.nftContract,
          abi: erc721Abi,
          functionName: "ownerOf",
          args: [parsed.tokenId]
        });
      } catch (error) {
        throw new Error(
          `Unable to read NFT ownership. The token may not exist, or MetaMask cannot reach the target RPC. ${walletErrorMessage(
            error,
            ""
          )}`
        );
      }

      setOwner(tokenOwner);

      if (!sameAddress(tokenOwner, address)) {
        throw new Error(`Connected wallet is not the token owner. Current owner: ${tokenOwner}.`);
      }

      const [tokenApproval, operatorApproval] = await Promise.all([
        publicClient.readContract({
          address: parsed.nftContract,
          abi: erc721Abi,
          functionName: "getApproved",
          args: [parsed.tokenId]
        }),
        publicClient.readContract({
          address: parsed.nftContract,
          abi: erc721Abi,
          functionName: "isApprovedForAll",
          args: [address, context.nftVault]
        })
      ]);

      setApprovedAddress(tokenApproval);
      setApprovedForAll(operatorApproval);

      const approved = operatorApproval || sameAddress(tokenApproval, context.nftVault);

      setMessage(
        successMessage ??
          (approved
            ? "Wallet owns the token and NFTVault is approved."
            : "Wallet owns the token. Approve NFTVault before creating the auction.")
      );

      return approved;
    } finally {
      setIsChecking(false);
    }
  }

  async function approveNftVault() {
    if (!address) {
      setMessage("Wallet not connected.");
      return;
    }

    if (!context) {
      setMessage("Deployment context is unavailable.");
      return;
    }

    try {
      setIsApproving(true);
      setMessage(null);
      setApprovalTxHash(null);

      await checkOwnershipAndApproval();

      const parsed = parseCreateAuctionValues(values);
      const { publicClient, walletClient } = createBrowserClients(address);

      const txHash = await walletClient.writeContract({
        address: parsed.nftContract,
        abi: erc721Abi,
        functionName: "approve",
        args: [context.nftVault, parsed.tokenId]
      });

      setApprovalTxHash(txHash);
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      await checkOwnershipAndApproval("Approval confirmed. You can now create the auction.");
    } catch (caught) {
      setMessage(walletErrorMessage(caught, "Approval failed."));
    } finally {
      setIsApproving(false);
    }
  }

  async function createAuction() {
    if (!address) {
      setMessage("Wallet not connected.");
      return;
    }

    if (!context) {
      setMessage("Deployment context is unavailable.");
      return;
    }

    try {
      setIsCreating(true);
      setMessage(null);
      setCreateTxHash(null);
      setCreatedAuctionId(null);

      const approved = await checkOwnershipAndApproval();

      if (!approved) {
        throw new Error("NFTVault approval is required before creating the auction.");
      }

      const parsed = parseCreateAuctionValues(values);
      const { publicClient, walletClient } = createBrowserClients(address);

      const expectedAuctionId = await publicClient.readContract({
        address: context.auctionHouse,
        abi: auctionHouseAbi,
        functionName: "nextAuctionId"
      });

      const txHash = await walletClient.writeContract({
        address: context.auctionHouse,
        abi: auctionHouseAbi,
        functionName: "createAuction",
        args: [parsed.nftContract, parsed.tokenId, parsed.startPrice, parsed.duration]
      });

      setCreateTxHash(txHash);
      await publicClient.waitForTransactionReceipt({ hash: txHash });

      setCreatedAuctionId(expectedAuctionId.toString());
      setMessage(`Auction #${expectedAuctionId.toString()} created with wallet signature.`);
    } catch (caught) {
      setMessage(walletErrorMessage(caught, "Auction creation failed."));
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <section className="rounded-lg border border-slate-800 bg-slate-900 p-5">
      <div>
        <h2 className="text-xl font-semibold text-white">Wallet-signed create auction</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          This is the production-target flow. MetaMask signs both transactions: NFTVault approval first, then
          AuctionHouse.createAuction. No server private key is used and no /api/dev route is called.
        </p>
      </div>

      <div className="mt-5 rounded-lg border border-cyan-400/30 bg-cyan-400/10 p-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-cyan-100">Wallet-signed mode</h3>
        <p className="mt-1 text-sm leading-6 text-cyan-100/80">
          Wallet-signed mode requires MetaMask access to the target RPC for {targetChainLabel}. In Codespaces with local
          Anvil, MetaMask may not reach the forwarded RPC reliably; use local-dev mode there or expose Anvil through a
          reliable localhost/testnet RPC.
        </p>
      </div>

      {isContextLoading ? (
        <div className="mt-5 rounded-md bg-slate-950 px-4 py-3 text-sm text-slate-300">
          Loading wallet-signed context...
        </div>
      ) : null}

      {!isContextLoading && contextError ? (
        <div className="mt-5 rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {contextError}
        </div>
      ) : null}

      {context ? (
        <div className="mt-5 grid gap-3 text-sm text-slate-300 md:grid-cols-2 lg:grid-cols-4">
          <InfoItem label="Target chain" value={`${targetChainLabel} (${targetChainId})`} />
          <InfoItem label="Deployment chain" value={String(context.chainId)} />
          <InfoItem label="AuctionHouse" value={shortenAddress(context.auctionHouse)} mono />
          <InfoItem label="NFTVault approval target" value={shortenAddress(context.nftVault)} mono />
          <InfoItem
            label="Minimum duration"
            value={context.minAuctionDuration ? formatDurationSeconds(context.minAuctionDuration) : "Loaded from contract check"}
          />
        </div>
      ) : null}

      <div className="mt-5 grid gap-3 text-sm text-slate-300 md:grid-cols-3">
        <InfoItem label="Wallet" value={address ? shortenAddress(address) : "Not connected"} mono />
        <InfoItem label="Wallet chain" value={chainId ? String(chainId) : "Not connected"} />
        <InfoItem label="Approval status" value={hasApproval ? "NFTVault approved" : "Approval required"} />
      </div>

      {modeMessage ? (
        <div className="mt-5 rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          {modeMessage}
        </div>
      ) : null}

      <form className="mt-6 grid gap-5" onSubmit={(event) => event.preventDefault()}>
        <CreateAuctionFields
          nftContract={nftContract}
          tokenId={tokenId}
          startPriceEth={startPriceEth}
          durationSeconds={durationSeconds}
          disabled={isChecking || isApproving || isCreating}
          onNftContractChange={setNftContract}
          onTokenIdChange={setTokenId}
          onStartPriceEthChange={setStartPriceEth}
          onDurationSecondsChange={setDurationSeconds}
        />

        {validationError ? (
          <div className="rounded-md border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
            {validationError}
          </div>
        ) : null}

        {owner ? (
          <div className="grid gap-3 text-sm text-slate-300 md:grid-cols-3">
            <InfoItem label="ownerOf(tokenId)" value={shortenAddress(owner)} mono />
            <InfoItem label="getApproved(tokenId)" value={approvedAddress ? shortenAddress(approvedAddress) : "Not checked"} mono />
            <InfoItem label="isApprovedForAll" value={approvedForAll === null ? "Not checked" : approvedForAll ? "Yes" : "No"} />
          </div>
        ) : null}

        <div className="flex flex-col gap-3 lg:flex-row">
          <button
            type="button"
            disabled={Boolean(validationError) || !isConnected || wrongNetwork || isChecking || isApproving || isCreating}
            onClick={() =>
              checkOwnershipAndApproval().catch((caught) => setMessage(walletErrorMessage(caught, "Ownership check failed.")))
            }
            className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-700 px-4 text-sm font-semibold text-slate-100 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isChecking ? "Checking..." : "Check ownership and approval"}
          </button>

          <button
            type="button"
            disabled={!ownerMatches || hasApproval || isChecking || isApproving || isCreating}
            onClick={approveNftVault}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-cyan-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isApproving ? "Approving..." : "Approve NFTVault"}
          </button>

          <button
            type="button"
            disabled={!ownerMatches || !hasApproval || Boolean(validationError) || isChecking || isApproving || isCreating}
            onClick={createAuction}
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-emerald-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isCreating ? "Creating auction..." : "Create auction"}
          </button>
        </div>
      </form>

      {message ? <div className="mt-5 rounded-md bg-slate-950 px-4 py-3 text-sm text-slate-200">{message}</div> : null}

      <div className="mt-4 grid gap-2 text-xs text-slate-500">
        {approvalTxHash ? <div className="break-all font-mono">approval tx: {approvalTxHash}</div> : null}
        {createTxHash ? <div className="break-all font-mono">create tx: {createTxHash}</div> : null}
      </div>

      {createdAuctionId ? (
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Link
            href={`/auctions/${createdAuctionId}`}
            className="inline-flex min-h-10 items-center justify-center rounded-md bg-emerald-300 px-4 text-sm font-semibold text-slate-950 transition hover:bg-emerald-200"
          >
            Open auction detail
          </Link>
          <Link
            href="/"
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-emerald-300/50 px-4 text-sm font-semibold text-emerald-100 transition hover:border-emerald-200"
          >
            Back to auction list
          </Link>
        </div>
      ) : null}

      <div className="mt-5 rounded-md bg-slate-950 px-4 py-3 text-xs leading-5 text-slate-500">
        Enter the start price in ETH. The frontend converts it to wei before calling AuctionHouse.createAuction.
      </div>
    </section>
  );
}

function InfoItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-950 px-4 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 break-all text-sm text-slate-200 ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}