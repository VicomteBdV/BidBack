"use client";

import React, { useEffect, useRef, useState } from "react";
import { useAccount, useConfig } from "wagmi";
import { getAccount } from "wagmi/actions";
import { formatEther, type EIP1193Provider } from "viem";
import { WalletButton } from "@/components/WalletButton";
import { getConnectedWalletProvider } from "@/lib/walletProvider";
import { useActiveWalletChain } from "@/lib/useActiveWalletChain";
import { type UnsignedDeploymentIntent } from "@/lib/testnetDeploymentPlan";
import { browserJournalLock, confirmedHashes, importJournal, loadJournal, parseSetupFragment, pendingAttempt,
  type DeploymentJournal, type SetupConfig } from "./deploymentSession";
import { createSetupReadRpc, initializeDeployment, quoteExecutionFee, requestDeploymentTransaction, verifyDeployment,
  type DeploymentServices, type ExecutionQuote, type SetupRpc } from "./deploymentDispatch";

export function DeploymentSetup() {
  const account = useAccount(), wagmi = useConfig();
  const chain = useActiveWalletChain(account.connector, account.address, account.isConnected);
  const [config, setConfig] = useState<SetupConfig | null>(null), [topLevel, setTopLevel] = useState(false);
  const [accepted, setAccepted] = useState(false), [journal, setJournal] = useState<DeploymentJournal | null>(null);
  const [next, setNext] = useState<UnsignedDeploymentIntent | null>(null), [quote, setQuote] = useState<ExecutionQuote | null>(null);
  const [verifiedRevision, setVerifiedRevision] = useState<number | null>(null), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Open the private setup link supplied in your Codex conversation."), [problem, setProblem] = useState(false);
  const [recovery, setRecovery] = useState(""), [lastHash, setLastHash] = useState<string | null>(null);
  const [viewValid, setViewValid] = useState(false);
  const working = useRef(false), rpc = useRef<SetupRpc | null>(null);
  const generation = useRef(0), activeView = useRef({ generation: 0, fragment: "" });
  if (!rpc.current) rpc.current = createSetupReadRpc();

  useEffect(() => {
    // Wallet controls are absent on the server and first render, including inside an iframe.
    if (window.top !== window.self) { setMessage("Open setup directly in its own browser tab. Wallet actions are unavailable inside a frame."); setProblem(true); return; }
    setTopLevel(true);
    function readConfiguration() {
      ++generation.current; setViewValid(false);
      if (working.current) {
        setMessage("The setup link changed during an operation. Keep this checkpoint and resolve any pending request, then reload the page. No further transaction can be requested from this view.");
        setProblem(true); setVerifiedRevision(null); setNext(null); setQuote(null); return;
      }
      setAccepted(false); setVerifiedRevision(null); setNext(null); setQuote(null); setJournal(null);
      try {
        const candidate = parseSetupFragment(window.location.hash);
        setConfig(candidate);
        const stored = loadJournal(window.localStorage, candidate); setJournal(stored);
        browserJournalLock(); // Fail visibly before offering initialization or signing.
        activeView.current = { generation: generation.current, fragment: window.location.hash }; setViewValid(true);
        setProblem(false); setMessage(stored ? "Saved checkpoint loaded. Verify it before continuing." : "Review the test setup below. Nothing connects or signs automatically.");
      } catch (error) { setConfig(null); setProblem(true); setMessage(error instanceof Error ? error.message : "Setup is unavailable. Keep your existing checkpoint."); }
    }
    readConfiguration(); window.addEventListener("hashchange", readConfiguration);
    return () => window.removeEventListener("hashchange", readConfiguration);
  }, []);
  function viewGuard() {
    const expected = { ...activeView.current };
    return () => { if (expected.generation !== generation.current || expected.fragment !== window.location.hash)
      throw new Error("The setup configuration changed. Reload the page and recover the existing checkpoint before continuing."); };
  }

  useEffect(() => {
    setVerifiedRevision(null); setNext(null); setQuote(null);
  }, [account.address, account.connector?.uid, account.isConnected, chain.status]);

  function reloadCheckpoint() {
    if (!config) return;
    setVerifiedRevision(null); setNext(null); setQuote(null);
    try { setJournal(loadJournal(window.localStorage, config)); setProblem(false); setMessage("Checkpoint reloaded. Verification never requests a signature."); }
    catch { setProblem(true); setMessage("The stored checkpoint cannot be read. Keep it and ask for help; do not clear browser storage."); }
  }
  useEffect(() => {
    if (!config) return;
    const changed = () => reloadCheckpoint();
    window.addEventListener("storage", changed); return () => window.removeEventListener("storage", changed);
    // A new configuration installs its own storage handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  function services(): DeploymentServices {
    if (!config || window.self !== window.top) throw new Error("Open the valid setup link directly in its own tab.");
    const assertView = viewGuard(); assertView();
    return { rpc: rpc.current!, storage: window.localStorage, lock: browserJournalLock(), async resolveWallet() {
      assertView();
      const selected = getAccount(wagmi), connector = selected.connector;
      if (!selected.isConnected || !connector || !selected.address || selected.address.toLowerCase() !== config.roles.deployer.toLowerCase()) throw new Error("Connect the configured test account before requesting an operation.");
      const original = await connector.getProvider();
      const protectedProvider = await getConnectedWalletProvider(wagmi, connector, selected.address);
      return { request: (request) => { assertView(); return protectedProvider.request(request as Parameters<EIP1193Provider["request"]>[0]) as Promise<unknown>; }, async assertCurrent() {
        assertView();
        const current = getAccount(wagmi);
        if (!current.isConnected || current.connector?.uid !== connector.uid || current.address?.toLowerCase() !== config.roles.deployer.toLowerCase() ||
          await connector.getProvider() !== original) throw new Error("The selected wallet changed. Reconnect and verify the checkpoint again.");
      } };
    } };
  }
  async function run(action: () => Promise<void>) {
    if (working.current) return;
    const expectedGeneration = generation.current;
    working.current = true; setBusy(true); setProblem(false);
    try { await action(); }
    catch (error) { if (generation.current === expectedGeneration) { setProblem(true); setMessage(error instanceof Error ? error.message : "The operation could not be verified. Nothing is retried automatically."); setVerifiedRevision(null); setNext(null); setQuote(null); } }
    finally { working.current = false; setBusy(false); }
  }
  async function verify(hash?: string) {
    if (!journal) return;
    const assertView = viewGuard(); assertView();
    setMessage("Checking the checkpoint, canonical blocks, contract code and roles. No signature is requested.");
    const checked = await verifyDeployment(journal, services(), hash);
    assertView();
    setJournal(checked.journal); setNext(checked.result.next); setVerifiedRevision(checked.journal.revision); setRecovery("");
    if (checked.result.next) {
      const quoted = await quoteExecutionFee(checked.result.next, rpc.current!); assertView(); setQuote(quoted);
      setMessage("Verified at the observed block. Review the next operation; MetaMask will show its final network fees.");
    } else { setQuote(null); setMessage("All 15 operations are verified. Export the checkpoint for private conservation and manifest preparation. No auction has been created."); }
  }
  function exportCheckpoint() {
    if (!journal) return;
    const retained = loadJournal(window.localStorage, journal.config);
    if (!retained) throw new Error("The saved checkpoint is unavailable. Do not request another operation.");
    const url = URL.createObjectURL(new Blob([JSON.stringify(retained, null, 2)], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = "bidback-testnet-checkpoint.json"; link.click(); URL.revokeObjectURL(url);
  }
  const matching = !!config && account.address?.toLowerCase() === config.roles.deployer.toLowerCase();
  const pending = journal ? pendingAttempt(journal) : null, completed = journal ? confirmedHashes(journal).length : 0;
  const ready = topLevel && viewValid && accepted && account.isConnected && matching && chain.status === "target" && !busy;

  return <main className="setup-shell">
    <header className="setup-heading"><a className="setup-brand" href="#" onClick={event => event.preventDefault()} aria-label="BidBack testnet setup">BID<span>BACK</span></a><span className="setup-badge">BASE SEPOLIA · TEST ETH ONLY</span></header>
    <section className="setup-intro"><p className="setup-eyebrow">A controlled start</p><h1>Set up BidBack,<br /><span>one approval at a time.</span></h1><p>This isolated screen installs and links the six test contracts. It does not expose auctions, request private keys or use real-value funds.</p></section>
    <div role="status" aria-live="polite" className={`setup-notice ${problem ? "setup-notice-error" : ""}`}>{busy && <span className="setup-spinner" aria-hidden="true" />}{message}</div>
    {config && topLevel && <>
      <section className="setup-card" aria-labelledby="roles-title"><div className="setup-section-label">01 / Review</div><h2 id="roles-title">Your test configuration</h2><p>The same address deploys the contracts, administers them and receives test commissions.</p>
        <dl className="setup-roles">{([['Deployer', config.roles.deployer], ['Administrator', config.roles.finalOwner], ['Test commissions', config.roles.feeRecipient]] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
        <label className="setup-check"><input type="checkbox" checked={accepted} disabled={busy} onChange={event => { setAccepted(event.target.checked); setNext(null); setQuote(null); setVerifiedRevision(null); }} /><span>I have reviewed these roles. This setup is for Base Sepolia test ETH only.</span></label>
        {accepted && <div className="setup-wallet"><WalletButton />{account.isConnected && !matching && <p role="alert">This is not the configured test account. Switch accounts in your selected wallet.</p>}</div>}
      </section>
      <section className="setup-card" aria-labelledby="progress-title"><div className="setup-section-label">02 / Install & verify</div><div className="setup-progress-title"><h2 id="progress-title">Deployment progress</h2><strong>{completed}<span> / 15</span></strong></div>
        <progress value={completed} max={15} aria-label="Verified deployment operations" />
        <p>Six contract creations, three links, six ownership confirmations. Every transaction requires your explicit approval.</p>
        {!journal ? <button className="setup-primary" disabled={!ready} onClick={() => run(async () => { const assertView = viewGuard(); setMessage("Checking the selected test account and preparing a saved checkpoint. No transaction is requested."); const initialized = await initializeDeployment(config, services()); assertView(); setJournal(initialized); setMessage("Checkpoint saved. Verify the first operation before opening MetaMask."); })}>Initialize checkpoint — no transaction</button> : <>
          <div className="setup-actions"><button disabled={busy || !viewValid} onClick={() => run(() => verify())}>{busy ? "Working…" : pending ? "Verify pending transaction" : "Verify checkpoint — read only"}</button><button disabled={busy} onClick={reloadCheckpoint}>Reload saved checkpoint</button></div>
          {pending && <div className="setup-pending"><h3>{pending.hash ? "Transaction awaiting verification" : "Unresolved transaction attempt"}</h3><p>No new request is allowed until this attempt is resolved. Verification never resends a transaction.</p>{pending.hash && <p className="setup-hash">{pending.hash}</p>}<label htmlFor="recovery-hash">Recovery transaction hash</label><input id="recovery-hash" value={recovery} disabled={busy} onChange={event => setRecovery(event.target.value)} placeholder="0x…" autoComplete="off" spellCheck={false} /><button disabled={busy || !recovery.trim()} onClick={() => run(() => verify(recovery.trim()))}>Verify recovery hash — no signature</button></div>}
          {next && !pending && verifiedRevision === journal.revision && <div className="setup-operation"><p className="setup-eyebrow">Next · {next.index + 1} of 15</p><h3>{next.kind === "create" ? "Create" : next.kind === "link" ? "Link" : "Confirm ownership of"} {next.module}</h3><dl><div><dt>Network</dt><dd>Base Sepolia (84532)</dd></div><div><dt>Destination</dt><dd>{next.to ?? "New contract creation"}</dd></div><div><dt>Transaction value</dt><dd>0 test ETH</dd></div><div><dt>Account nonce</dt><dd>{next.nonce}</dd></div><div><dt>Estimated execution fee ceiling</dt><dd>{quote ? `${formatEther(quote.maxExecutionFeeWei)} test ETH` : "Estimate unavailable"}</dd></div></dl><p className="setup-small">This estimate excludes Base data charges. MetaMask shows the final network fees. Do not approve an account-upgrade or delegation request; this flow only supports ordinary type-2 transactions.</p>
            <button className="setup-primary" disabled={!ready || !quote} onClick={() => run(async () => { const assertView = viewGuard(); setNext(null); setQuote(null); setVerifiedRevision(null); setMessage("Rechecking the operation before opening your selected wallet. Approve only this test transaction."); const result = await requestDeploymentTransaction(journal, next, services()); if (result.hash) setLastHash(result.hash); assertView(); setJournal(result.journal); setMessage(result.message); setProblem(result.status === "unknown"); })}>Review this transaction in MetaMask</button></div>}
          {completed === 15 && <p className="setup-complete">All operations are verified. Keep the checkpoint; the auction site is a separate next step.</p>}
        </>}
        {lastHash && <div className="setup-last-hash"><h3>Keep this transaction hash</h3><p className="setup-hash">{lastHash}</p><a href={`https://sepolia.basescan.org/tx/${lastHash}`} target="_blank" rel="noreferrer">View on Base Sepolia explorer ↗</a></div>}
      </section>
      <section className="setup-card" aria-labelledby="checkpoint-title"><div className="setup-section-label">03 / Keep your place</div><h2 id="checkpoint-title">Checkpoint & recovery</h2><p>Saved in this browser before any transaction request. Export it for recovery. Importing never replaces an existing checkpoint or requests a signature.</p><div className="setup-actions"><button disabled={!journal || busy} onClick={() => run(async () => exportCheckpoint())}>Export checkpoint</button><label className="setup-file">Import checkpoint<input type="file" accept="application/json,.json" disabled={busy || !viewValid} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; run(async () => { const assertView = viewGuard(); if (file.size > 100_000) throw new Error("This checkpoint is too large."); const text = await file.text(); assertView(); const imported = await importJournal(text, config, window.localStorage, browserJournalLock()); assertView(); setJournal(imported); setNext(null); setQuote(null); setVerifiedRevision(null); setMessage("Checkpoint imported locally. Verify it before continuing. Nothing was sent."); }); }} /></label></div><p className="setup-small">Never import a wallet key or seed phrase. If a request has an uncertain result, preserve the checkpoint and recover its hash. Do not clear browser storage to retry.</p></section>
    </>}
    <footer className="setup-footer">An isolated setup utility · No auction routes · No private keys · No automatic signatures</footer>
  </main>;
}
