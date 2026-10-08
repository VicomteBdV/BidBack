"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  encodeFunctionData,
  type Address,
  type EIP1193Provider,
  type PublicClient
} from "viem";
import { useAccount, useConfig } from "wagmi";
import { createConnectedWalletClients } from "@/lib/walletProvider";
import { auctionHouseAbi } from "@/contracts/auctionHouseAbi";
import { erc721Abi } from "@/contracts/erc721Abi";
import { paramsControllerAbi } from "@/contracts/paramsControllerAbi";
import { CreateAuctionFields } from "@/components/CreateAuctionFields";
import { TechnicalDisclosure } from "@/components/TechnicalDisclosure";
import { TransactionReview } from "@/components/TransactionReview";
import { StateNotice } from "@/components/ui/StateNotice";
import { WalletTransactionStatus } from "@/components/WalletTransactionStatus";
import { targetChainId, targetChainLabel } from "@/lib/chains";
import {
  getCreateAuctionValidationIssue,
  validateCreateAuctionFields,
  parseCreateAuctionValues,
  type CreateAuctionFieldName
} from "@/lib/createAuctionValidation";
import { fetchDeployment } from "@/lib/deployment";
import { formatDurationSeconds, shortenAddress } from "@/lib/format";
import {
  awaitingSignatureState,
  confirmedTransactionState,
  failedTransactionState,
  pendingTransactionState,
  confirmWalletTransaction,
  matchingWalletActionEvents,
  refreshingTransactionState,
  walletConfirmationState,
  walletTransactionSubmission,
  type WalletConfirmationResult,
  type WalletTransactionSubmission,
  unknownConfirmationState,
  type WalletTransactionState
} from "@/lib/walletTransaction";

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

async function verifyWalletChain(provider: Pick<EIP1193Provider, "request">) {
  let walletChainId: unknown;

  try {
    walletChainId = await provider.request({ method: "eth_chainId" });
  } catch (error) {
    throw new Error(
      `Wallet RPC unreachable. Wallet-signed mode requires your wallet to access the target RPC. ${walletErrorMessage(
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
  const { address, chainId, isConnected, connector } = useAccount();
  const config = useConfig();

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
  const [isReviewing, setIsReviewing] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [approvalTxStatus, setApprovalTxStatus] = useState<WalletTransactionState | null>(null);
  const [createTxStatus, setCreateTxStatus] = useState<WalletTransactionState | null>(null);
  const [createdAuctionId, setCreatedAuctionId] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const recovery = useRef<{ action: "approve" | "create"; submission: WalletTransactionSubmission; contextKey: string;
    values: Readonly<{ nftContract: string; tokenId: string; startPriceEth: string; durationSeconds: string }> } | null>(null);
  const approvalContextKey = `${address}:${chainId}:${connector?.uid}:${nftContract}:${tokenId}`;
  const createContextKey = `${approvalContextKey}:${startPriceEth}:${durationSeconds}`;
  const activeContext = useRef({ approve: approvalContextKey, create: createContextKey });
  activeContext.current = { approve: approvalContextKey, create: createContextKey };

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
    const stored = recovery.current;
    setApprovalTxStatus(stored?.action === "approve" ? unknownConfirmationState(stored.submission.effectiveHash) : null);
    setCreateTxStatus(stored?.action === "create" ? unknownConfirmationState(stored.submission.effectiveHash) : null);
    setCreatedAuctionId(null);
    setIsReviewing(false);
  }, [address, chainId, connector?.uid, nftContract, tokenId]);

  useEffect(() => {
    if (recovery.current?.action === "create") {
      setCreateTxStatus(unknownConfirmationState(recovery.current.submission.effectiveHash));
      setIsReviewing(false);
    }
  }, [startPriceEth, durationSeconds]);

  const values = useMemo(
    () => ({ nftContract, tokenId, startPriceEth, durationSeconds }),
    [durationSeconds, nftContract, startPriceEth, tokenId]
  );

  const validationIssue = useMemo(
    () =>
      getCreateAuctionValidationIssue(values, {
        minAuctionDuration: context?.minAuctionDuration,
        paused: context?.paused === true
      }),
    [context, values]
  );
  const validationError = validationIssue?.message ?? null;
  const fieldErrors = useMemo<Partial<Record<CreateAuctionFieldName, string>>>(() => {
    if (!validationIssue || validationIssue.field === "form") return {};
    return { [validationIssue.field]: validationIssue.message };
  }, [validationIssue]);

  const wrongNetwork = isConnected && chainId !== targetChainId;
  const ownerMatches = Boolean(owner && address && sameAddress(owner, address));
  const hasApproval = Boolean(
    ownerMatches && context && (approvedForAll || sameAddress(approvedAddress, context.nftVault))
  );
  const approvalStatus = !owner
    ? "Check ownership first"
    : !ownerMatches
      ? "Owner mismatch"
      : hasApproval
        ? "NFT custody approved"
        : "Approval required";

  const modeMessage = !isConnected
    ? "Connect a wallet to use wallet-signed mode."
    : wrongNetwork
      ? `Wallet connected, but not on the target chain (${targetChainLabel}).`
      : null;
  const isBusy = isChecking || isApproving || isCreating || isVerifying;
  const confirmationUnknown = approvalTxStatus?.phase === "confirmation-unknown" || createTxStatus?.phase === "confirmation-unknown";
  const checkDisabledReason = validationError ?? modeMessage ?? (isBusy ? "Another wallet step is already in progress." : null);
  const approveDisabledReason = modeMessage ?? (!ownerMatches
    ? owner ? "The connected wallet is not the NFT owner." : "Check ownership and approval first."
    : hasApproval ? "NFTVault is already approved." : isBusy ? "Another wallet step is already in progress." : null);
  const createDisabledReason = modeMessage ?? (!ownerMatches
    ? owner ? "The connected wallet is not the NFT owner." : "Check ownership and approval first."
    : !hasApproval ? "Approve NFTVault before creating the auction." : validationError ?? (isBusy ? "Another wallet step is already in progress." : null));

  async function checkOwnershipAndApproval(successMessage?: string, silent = false) {
    if (!address) throw new Error("Wallet not connected.");
    if (!context) throw new Error("Deployment context is unavailable.");
    if (wrongNetwork) throw new Error(`Wrong network. Switch your wallet to the target chain (${targetChainLabel}).`);
    if (validationError) throw new Error(validationError);

    try {
      setIsChecking(true);
      setMessage(null);

      const parsed = parseCreateAuctionValues(values);
      const { provider, publicClient } = await createConnectedWalletClients(config, connector, address);

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
          `Unable to read NFT ownership. The token may not exist, or your wallet cannot reach the target RPC. ${walletErrorMessage(
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

      if (!silent) {
        setMessage(
          successMessage ??
            (approved
              ? "Wallet owns the token and NFT custody approval is active."
              : "Wallet owns the token. Approve NFT custody before creating the auction.")
        );
      }

      return approved;
    } finally {
      setIsChecking(false);
    }
  }

  async function finishConfirmation(result: WalletConfirmationResult, stored: NonNullable<typeof recovery.current>) {
    if (activeContext.current[stored.action] !== stored.contextKey) return;
    const setStatus = stored.action === "approve" ? setApprovalTxStatus : setCreateTxStatus;
    if (result.outcome !== "confirmed") {
      if (result.outcome !== "unknown") { recovery.current = null; setIsReviewing(false); }
      setStatus(walletConfirmationState(result));
      return;
    }
    const hash = stored.submission.effectiveHash;
    const original = hash !== stored.submission.originalHash ? `Originally submitted as ${stored.submission.originalHash}.` : undefined;
    if (stored.action === "create") {
      const id = result.evidence?.auctionId;
      if (!id) { setStatus(unknownConfirmationState(hash)); return; }
      recovery.current = null;
      setCreatedAuctionId(id);
      setIsReviewing(false);
      setCreateTxStatus({ ...confirmedTransactionState(hash, `Auction #${id} created.`,
        "Open the auction detail to review the live lot and bidding state."), technicalDetail: original });
      return;
    }
    setApprovalTxStatus(refreshingTransactionState(hash, "NFT custody approval confirmed on-chain. Refreshing approval status."));
    let refreshIncomplete = false;
    try { await checkOwnershipAndApproval(undefined, true); } catch { refreshIncomplete = true; }
    if (activeContext.current.approve !== stored.contextKey) return;
    recovery.current = null;
    setApprovalTxStatus({ ...confirmedTransactionState(hash,
      refreshIncomplete ? "NFT custody approved, but displayed approval data could not be fully refreshed." : "NFT custody approved.",
      refreshIncomplete ? "Run the ownership and approval review again before creating the auction." : "Review and create the auction.",
      refreshIncomplete), technicalDetail: original });
  }

  async function verifyTransaction() {
    const stored = recovery.current;
    if (!stored || isBusy || activeContext.current[stored.action] !== stored.contextKey) return;
    try {
      setIsVerifying(true);
      const { publicClient } = await createConnectedWalletClients(config, connector, stored.submission.intent.account);
      await finishConfirmation(await confirmWalletTransaction(publicClient, stored.submission, { recheck: true }), stored);
    } catch {
      (stored.action === "approve" ? setApprovalTxStatus : setCreateTxStatus)(unknownConfirmationState(stored.submission.effectiveHash));
    } finally { setIsVerifying(false); }
  }

  function restoreSubmittedDetails() {
    const stored = recovery.current;
    if (!stored || isBusy) return;
    setNftContract(stored.values.nftContract);
    setTokenId(stored.values.tokenId);
    if (stored.action === "create") {
      setStartPriceEth(stored.values.startPriceEth);
      setDurationSeconds(stored.values.durationSeconds);
    }
    setIsReviewing(false);
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

    let submittedHash: `0x${string}` | null = null;

    try {
      setIsApproving(true);
      setMessage(null);
      setApprovalTxStatus(null);

      await checkOwnershipAndApproval(undefined, true);
      setApprovalTxStatus(awaitingSignatureState("Confirm NFT custody approval in your wallet."));

      const parsed = parseCreateAuctionValues(values);
      const { publicClient, walletClient } = await createConnectedWalletClients(config, connector, address);

      const request = {
        address: parsed.nftContract, abi: erc721Abi, functionName: "approve" as const,
        args: [context.nftVault, parsed.tokenId] as const
      };
      const intent = Object.freeze({ chainId: targetChainId, account: address, to: request.address,
        data: encodeFunctionData(request), value: 0n });
      const proof = { abi: erc721Abi, eventName: "Approval", address: request.address,
        expected: Object.freeze({ owner: address, approved: context.nftVault, tokenId: parsed.tokenId }) };
      const txHash = await walletClient.writeContract(request);
      submittedHash = txHash;
      const submission = walletTransactionSubmission(txHash, intent,
        (receipt) => matchingWalletActionEvents(receipt, proof).length === 1 ? {} : null);
      const stored = { action: "approve" as const, submission, contextKey: approvalContextKey, values: Object.freeze({ ...values }) };
      recovery.current = stored;
      setApprovalTxStatus(activeContext.current.approve === stored.contextKey
        ? pendingTransactionState(txHash, "NFT custody approval submitted. Waiting for confirmation.") : unknownConfirmationState(txHash));
      await finishConfirmation(await confirmWalletTransaction(publicClient, submission), stored);
    } catch (caught) {
      const failed = submittedHash
        ? unknownConfirmationState(submittedHash, caught)
        : failedTransactionState(caught, "Approval failed before submission.");
      setApprovalTxStatus(failed);
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

    let submittedHash: `0x${string}` | null = null;

    try {
      setIsCreating(true);
      setMessage(null);
      setCreateTxStatus(null);
      setCreatedAuctionId(null);

      const approved = await checkOwnershipAndApproval(undefined, true);

      if (!approved) {
        throw new Error("NFTVault approval is required before creating the auction.");
      }

      const parsed = parseCreateAuctionValues(values);
      const { publicClient, walletClient } = await createConnectedWalletClients(config, connector, address);

      setCreateTxStatus(awaitingSignatureState("Confirm auction creation in your wallet."));

      const request = {
        address: context.auctionHouse, abi: auctionHouseAbi, functionName: "createAuction" as const,
        args: [parsed.nftContract, parsed.tokenId, parsed.startPrice, parsed.duration] as const
      };
      const intent = Object.freeze({ chainId: targetChainId, account: address, to: request.address,
        data: encodeFunctionData(request), value: 0n });
      const proof = { abi: auctionHouseAbi, eventName: "AuctionCreated", address: request.address,
        expected: Object.freeze({ seller: address, nft: parsed.nftContract, tokenId: parsed.tokenId, startPrice: parsed.startPrice }) };
      const duration = parsed.duration;
      const txHash = await walletClient.writeContract(request);
      submittedHash = txHash;
      const submission = walletTransactionSubmission(txHash, intent, async (receipt, client) => {
        const matches = matchingWalletActionEvents(receipt, proof);
        if (matches.length !== 1 || typeof matches[0].auctionId !== "bigint" || matches[0].auctionId <= 0n) return null;
        const block = await client.getBlock({ blockHash: receipt.blockHash });
        if (!sameAddress(block.hash, receipt.blockHash) || block.number !== receipt.blockNumber ||
          typeof block.timestamp !== "bigint" || block.timestamp < 0n || matches[0].initialEndTime !== block.timestamp + duration) return null;
        return { auctionId: matches[0].auctionId.toString() };
      });
      const stored = { action: "create" as const, submission, contextKey: createContextKey, values: Object.freeze({ ...values }) };
      recovery.current = stored;
      setCreateTxStatus(activeContext.current.create === stored.contextKey
        ? pendingTransactionState(txHash, "Auction creation transaction submitted. Waiting for confirmation.") : unknownConfirmationState(txHash));
      await finishConfirmation(await confirmWalletTransaction(publicClient, submission), stored);
    } catch (caught) {
      const failed = submittedHash
        ? unknownConfirmationState(submittedHash, caught)
        : failedTransactionState(caught, "Auction creation failed before submission.");
      setCreateTxStatus(failed);
    } finally {
      setIsCreating(false);
    }
  }

  async function openCreateReview() {
    try {
      await checkOwnershipAndApproval();
      setApprovalTxStatus((current) => current?.phase === "confirmed" && current.refreshIncomplete ? {
        ...current, refreshIncomplete: false, message: "NFT custody approved.",
        nextAction: "Review the current ownership and approval state before creating the auction."
      } : current);
      setIsReviewing(true);
    } catch (caught) {
      setMessage(walletErrorMessage(caught, "Unable to review auction creation."));
    }
  }

  const journeyStep = createTxStatus?.phase === "confirmed"
    ? 5
    : createTxStatus?.phase === "confirmation-unknown" || isCreating
      ? 4
      : approvalTxStatus?.phase === "confirmation-unknown" || approvalTxStatus?.refreshIncomplete || isApproving
        ? 3
        : isReviewing
          ? hasApproval ? 4 : 2
          : 1;

  return (
    <section aria-busy={isContextLoading || isBusy} className="seller-form-surface min-w-0">
      <div>
        <p className="premium-eyebrow">Primary listing route</p>
        <h2 className="editorial-title mt-1 text-2xl">Wallet-signed creation</h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
          The owner wallet approves the NFT for custody, then signs the auction creation transaction.
        </p>
      </div>

      <div className="seller-mode-note mt-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-cyan-100">Wallet-signed mode</h3>
        <p className="mt-1 text-sm leading-6 text-cyan-100/80">
          Your wallet must be connected to the configured target network. Ownership and approval are verified before listing.
        </p>
      </div>

      <ol className="transaction-journey-steps mt-5" aria-label="Create auction transaction sequence">
        {["Auction details", "Review", "Approve NFT custody if required", "Create auction", "Confirmation / View lot"].map((label, index) => {
          const step = index + 1;
          const state = step < journeyStep ? "completed" : step === journeyStep ? "current" : "upcoming";
          return (
            <li key={label} className={`transaction-journey-${state}`} aria-current={state === "current" ? "step" : undefined}>
              <span aria-hidden="true">{step}</span>
              <strong>{label}</strong>
              <small>{state === "completed" ? "Completed" : state === "current" ? "Current" : "Upcoming"}</small>
            </li>
          );
        })}
      </ol>

      {isContextLoading ? (
        <StateNotice tone="loading" title="Loading wallet-signed context" className="mt-5">
          Loading wallet-signed context...
        </StateNotice>
      ) : null}

      {!isContextLoading && contextError ? (
        <StateNotice tone="error" title="Wallet-signed context is unavailable" className="mt-5">
          {contextError}
        </StateNotice>
      ) : null}

      <div className="mt-5 grid gap-3 text-sm text-slate-300 md:grid-cols-3">
        <InfoItem label="Wallet" value={address ? shortenAddress(address) : "Not connected"} mono />
        <InfoItem label="Approval status" value={approvalStatus} />
        <InfoItem
          label="Minimum duration"
          value={context?.minAuctionDuration ? formatDurationSeconds(context.minAuctionDuration) : "Loaded during review"}
        />
      </div>

      <TechnicalDisclosure
        summary="Create network and contract details"
        description="Technical deployment, approval, and argument details for diagnosing wallet-signed creation."
        className="mt-5"
      >
        <div className="grid gap-3 text-sm text-slate-300 md:grid-cols-2 lg:grid-cols-4">
          <InfoItem label="Target chain" value={`${targetChainLabel} (${targetChainId})`} />
          <InfoItem label="Wallet chain" value={chainId ? String(chainId) : "Not connected"} />
          <InfoItem label="Deployment chain" value={context ? String(context.chainId) : "Not loaded"} />
          <InfoItem label="AuctionHouse" value={context ? shortenAddress(context.auctionHouse) : "Not loaded"} mono />
          <InfoItem label="NFTVault approval target" value={context ? shortenAddress(context.nftVault) : "Not loaded"} mono />
          {owner ? <InfoItem label="ownerOf(tokenId)" value={shortenAddress(owner)} mono /> : null}
          {owner ? <InfoItem label="getApproved(tokenId)" value={approvedAddress ? shortenAddress(approvedAddress) : "Not checked"} mono /> : null}
          {owner ? <InfoItem label="isApprovedForAll" value={approvedForAll === null ? "Not checked" : approvedForAll ? "Yes" : "No"} /> : null}
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-400">
          The frontend converts the ETH start price to wei, keeps duration in seconds, and calls AuctionHouse.createAuction
          with the reviewed NFT contract, token ID, start price, and duration.
        </p>
      </TechnicalDisclosure>

      {modeMessage ? (
        <StateNotice tone="warning" title="Wallet action unavailable" className="mt-5">
          {modeMessage}
        </StateNotice>
      ) : null}

      <form className="mt-6 grid gap-5" onSubmit={(event) => event.preventDefault()}>
        <CreateAuctionFields
          nftContract={nftContract}
          tokenId={tokenId}
          startPriceEth={startPriceEth}
          durationSeconds={durationSeconds}
          disabled={isBusy || confirmationUnknown}
          errors={fieldErrors}
          idPrefix="wallet-create"
          onNftContractChange={(value) => { setNftContract(value); setIsReviewing(false); }}
          onTokenIdChange={(value) => { setTokenId(value); setIsReviewing(false); }}
          onStartPriceEthChange={(value) => { setStartPriceEth(value); setIsReviewing(false); }}
          onDurationSecondsChange={(value) => { setDurationSeconds(value); setIsReviewing(false); }}
        />

        {validationError ? (
          <StateNotice tone="warning" title="Review auction details">
            {validationError}
          </StateNotice>
        ) : null}

        {owner ? (
          <div className="grid gap-3 text-sm text-slate-300 md:grid-cols-2">
            <InfoItem label="NFT owner" value={shortenAddress(owner)} mono />
            <InfoItem label="Custody approval" value={hasApproval ? "Approved" : "Required"} />
          </div>
        ) : null}

        <div>
          <div>
            <button
              type="button"
              disabled={Boolean(validationError) || !isConnected || wrongNetwork || isBusy || confirmationUnknown || createTxStatus?.phase === "confirmed" || createTxStatus?.phase === "confirmation-unknown"}
              aria-describedby={checkDisabledReason ? "check-ownership-disabled-reason" : undefined}
              onClick={openCreateReview}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-slate-700 px-4 text-sm font-semibold text-slate-100 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isChecking ? "Checking..." : "Review auction"}
            </button>
            {checkDisabledReason ? <p id="check-ownership-disabled-reason" className="mt-1 text-xs text-slate-400">{checkDisabledReason}</p> : null}
          </div>
        </div>
      </form>

      {isReviewing ? (
        <div className="mt-5">
          <TransactionReview
            title="Create auction"
            description="Review the listing terms currently checked against the connected owner wallet before continuing."
            items={[
              { label: "NFT contract", value: nftContract, mono: true },
              { label: "Token ID", value: tokenId },
              { label: "Owner wallet", value: owner ? shortenAddress(owner) : "Not checked", mono: true },
              { label: "Start price", value: `${startPriceEth.trim()} ETH` },
              { label: "Duration", value: formatDurationSeconds(durationSeconds) },
              { label: "NFT custody approval", value: hasApproval ? "Already approved" : "Required before creation" },
              { label: "Network gas", value: "Separate; shown by your wallet" }
            ]}
            confirmations={hasApproval
              ? "Currently expected: 1 wallet confirmation"
              : "Currently expected: 2 wallet confirmations"}
            note="This confirmation count reflects the currently read approval state. Existing ownership, approval, parameter, and pause preflights remain authoritative before each transaction."
            primaryLabel={hasApproval ? "Create auction" : "Approve NFT custody"}
            busy={isApproving || isCreating || isVerifying}
            disabled={Boolean(hasApproval ? createDisabledReason : approveDisabledReason)
              || approvalTxStatus?.phase === "confirmation-unknown"
              || approvalTxStatus?.refreshIncomplete
              || createTxStatus?.phase === "confirmation-unknown"}
            onBack={() => setIsReviewing(false)}
            onConfirm={hasApproval ? createAuction : approveNftVault}
          />
        </div>
      ) : null}

      <div className="mt-5 grid gap-3">
        <WalletTransactionStatus title="NFT approval" status={approvalTxStatus} />
        <WalletTransactionStatus title="Auction creation" status={createTxStatus} />
        {confirmationUnknown ? <div>
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button type="button" onClick={verifyTransaction}
            disabled={isBusy || !recovery.current || activeContext.current[recovery.current.action] !== recovery.current.contextKey}
            className="min-h-11 w-full rounded-md border border-slate-700 px-4 text-sm font-semibold text-slate-100 disabled:opacity-50 sm:w-auto">
            {isVerifying ? "Verifying..." : "Verify transaction"}
          </button>
          {recovery.current && (nftContract !== recovery.current.values.nftContract || tokenId !== recovery.current.values.tokenId ||
            (recovery.current.action === "create" && (startPriceEth !== recovery.current.values.startPriceEth || durationSeconds !== recovery.current.values.durationSeconds))) ?
            <button type="button" disabled={isBusy} onClick={restoreSubmittedDetails}
              className="min-h-11 w-full rounded-md border border-slate-700 px-4 text-sm font-semibold text-slate-100 disabled:opacity-50 sm:w-auto">Restore submitted details</button> : null}
          </div>
          <p className="mt-2 text-xs text-slate-300">Verification only reads on-chain evidence. Return to the submitting wallet, network and details before verifying. Do not submit again while the outcome is unknown.</p>
        </div> : null}
      </div>

      {message ? <div role="status" aria-live="polite" className="mt-5 rounded-md bg-slate-950 px-4 py-3 text-sm text-slate-200">{message}</div> : null}

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

    </section>
  );
}

function InfoItem({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="seller-info-item">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 break-all text-sm text-slate-200 ${mono ? "font-mono" : ""}`}>{value}</div>
    </div>
  );
}
