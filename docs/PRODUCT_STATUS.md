# BidBack Product Status

**Checkpoint date:** 31 July 2026

**Status authority:** This document is the current source of truth for BidBack product status. Procedure documents and older checkpoints must not override it.

## Executive Summary

BidBack is a functional NFT auction MVP with modular on-chain custody, bidding, settlement, refunds, conditional premium-funded rewards, and pull-based claims. The repository also contains a responsive Next.js interface, bounded read models, wallet-signed transaction flows, guarded local-development actions, deployment validation, and on-chain verification tooling.

At this checkpoint:

- the `main` CI workflow was reported green on 31 July 2026; this is a dated observation, not a permanent guarantee;
- the complete automated local lifecycle was successfully executed in GitHub Codespaces on 31 July 2026 against a fresh Anvil chain on `31337`;
- the local run confirmed deployment, three bids across two bidders, delta-only step-up, finalization, all claims and withdrawals, duplicate-action rejection, and verified final balances;
- Base Sepolia deployment and verification are partially validated, but the public multi-wallet smoke test remains incomplete;
- no hosted demonstration frontend, production indexer, external audit, production governance, monitoring, user research, or legal review is confirmed.

BidBack therefore meets the documented **Demo-ready** gate for a controlled local demonstration. It does not meet **Controlled beta-ready**, **Public beta-ready**, or **Production-ready**.

## Status Legend

| Status | Meaning |
| --- | --- |
| Completed | Implemented and supported by repository evidence appropriate to the claim. |
| Functional but partial | Usable for the MVP, with a documented coverage, scale, UX, or validation limitation. |
| Validated locally | Executed successfully against local Anvil or covered by the confirmed local validation environment. |
| Partially validated on Base Sepolia | Some deployment or transaction checks succeeded, but the complete public multi-wallet lifecycle is not proven. |
| Not started | No substantive implementation or validation evidence was found. |
| Blocked by decision | Progress depends on an explicit product, architecture, governance, security, or legal choice. |

## Evidence Rules

Status claims use the following evidence classes:

| Evidence | What it proves | What it does not prove |
| --- | --- | --- |
| Code present | The capability is implemented in the inspected repository. | That it compiled, ran, or behaved correctly in every environment. |
| Automated tests present | A behavior has deterministic test coverage. | That every branch, integration, or deployment environment is covered. |
| CI green at checkpoint | The configured CI jobs passed at the stated date. | Future CI health or checks not included in the workflow. |
| Manual execution confirmed | A named scenario was run successfully in a named environment and date. | Equivalent behavior on a public chain or under production load. |
| Partial public validation | Some public testnet deployment or transaction evidence exists. | A complete, repeatable public lifecycle. |
| No evidence | No reliable repository or confirmed execution evidence was identified. | That work has never happened outside the inspected record. |

## Smart Contracts

| Capability | Status | Evidence | Limits / next proof required |
| --- | --- | --- | --- |
| ERC-721 auction creation | Completed; validated locally | `AuctionHouse`, `NFTVault`, Foundry tests, Anvil lifecycle | Public multi-wallet creation still requires complete Base Sepolia smoke evidence. |
| NFT custody and release | Completed; validated locally | `NFTVault`, claim tests, Anvil custody and release checks | No external audit. |
| Bidding and highest valid cap | Completed; validated locally | `AuctionHouse.placeBid`, Solidity tests, Anvil lifecycle | Public load and gas behavior not measured. |
| Step-up-only cap accounting | Completed; validated locally | Targeted Solidity test and Anvil `0.8 ETH` delta step-up | No fuzzed bid-sequence coverage. |
| Anti-sniping | Functional but partial | Contract implementation and snapshotted parameters | No dedicated behavioral test proving extension boundaries and maximum extensions was found. |
| Finalization | Completed; validated locally | Solidity integration tests and Anvil lifecycle | Public-chain lifecycle incomplete. |
| Winner NFT claim | Completed; validated locally | Pull-based claim implementation, double-claim test, Anvil lifecycle | No independent audit. |
| Losing bidder refunds | Completed; validated locally | Full-cap refund accounting, tests, `1.5 ETH` Anvil refund | Production-scale solvency assurance still requires invariants and audit. |
| Conditional rewards | Completed; validated locally | Premium-derived calculation tests and `0.19 ETH` Anvil reward | Rewards remain conditional and can be zero outside the deterministic scenario. |
| Seller proceeds | Completed; validated locally | Pull withdrawal tests and `1.76 ETH` Anvil withdrawal | Historical attribution needs an indexer or richer event model. |
| Protocol fees | Completed; validated locally | Premium-only fee logic, snapshot tests, `0.05 ETH` Anvil withdrawal | Governance and production recipient policy are open. |
| Parameter, module, and fee-recipient snapshots | Completed | Dedicated Solidity suites and read-only frontend display | Per-deployment public verification remains procedural. |
| Pause and permissions | Completed for MVP | Owner controls, one-time vault wiring, pause tests proving exits remain available | Production roles, multisig, and timelock are absent. |
| Duplicate-action protection | Completed; validated locally | Solidity reverts and Anvil duplicate simulations | No adversarial external review. |
| Bounded settlement loops | Completed for configured MVP bounds | Participant caps and bounded recipient limits | Gas ceilings at maximum bounds are not load-tested. |
| Configured non-fee costs | Not started | No current contract parameter or deduction beyond protocol fee | Any future cost category must preserve the net-premium invariant. |
| Fuzzing and invariant testing | Not started | No fuzz or invariant suite found | Required before public beta. |
| External smart-contract audit | Not started | No audit report or remediation register | Required before production and likely before public beta depending on risk policy. |
| Production governance | Blocked by decision | Ownership is configurable; production policy documented only as intent | Multisig roles, timelock delays, emergency powers, and handoff process must be chosen. |

## Frontend

| Capability | Status | Evidence | Limits / next proof required |
| --- | --- | --- | --- |
| Auction browsing | Completed for bounded MVP reads | Search, filters, sorts, configurable limits, component tests | Not complete historical pagination or cross-window search. |
| NFT metadata | Functional but partial | ERC-721 reads, HTTP/IPFS handling, fallback tests | No persistent cache, media proxy, moderation, or production metadata service. |
| Auction creation | Completed for MVP | Local-dev and wallet-signed flows, ownership/approval validation tests | Hosted public-wallet validation remains incomplete. |
| Bidding | Completed for MVP | Wallet-signed bid panel, delta calculation guards, local-dev flow | A signature is required for every current wallet-signed bid. |
| Finalization | Completed for MVP | Wallet-signed and local-dev panels with lifecycle guards | Public multi-wallet proof incomplete. |
| Claims and withdrawals | Completed for MVP | NFT, refund, reward, seller, and fee actions with eligibility guards | Production support and monitoring absent. |
| Lifecycle presentation | Completed for MVP | Open, ready-to-finalize, finalized, claimable, and settled projections with tests | Derived from bounded reads rather than a persistent index. |
| Bid history | Functional but partial | On-chain bid records plus event enrichment and fallback tests | Bounded; no production pagination or complete withdrawal attribution. |
| Economic transparency | Functional but partial | Snapshot, settlement, visible refund/reward, and credit panels | Not a complete participant-level accounting report. |
| Wallet Action Center | Completed for bounded MVP data | `My activity / My actions`, prioritized queues, tests | Can miss activity outside scanned windows. |
| Onboarding and risk language | Completed for MVP | Introductory copy and tests | No formal user-comprehension study or legal review. |
| Responsive behavior | Functional but partial | Responsive Tailwind layouts across major surfaces | No confirmed device matrix or visual-regression suite. |
| Accessibility | Functional but partial | Native controls, labels, focus styles, ARIA feedback, selected tests | No WCAG audit, keyboard study, or assistive-technology validation. |
| Transaction feedback | Completed for MVP | Signature, pending, confirmed, rejected, failed, hash, explorer-link states | No production telemetry. |
| Network handling | Completed for configured target chain | Wrong-network detection and switch flow | RPC and wallet compatibility remain environment-dependent. |
| Wallet strategy | Functional but partial; blocked by decision | One injected connector through wagmi | WalletConnect, mobile, Coinbase Wallet, Rabby, and broader compatibility are not validated. |
| Visual quality | Functional MVP | Consolidated responsive interface | Not a final premium marketplace design. |
| External user testing | Not started | No research log or usability results | Required before architecture and UX priorities are frozen. |

## Read Model and Data

| Capability | Status | Evidence | Limits / next proof required |
| --- | --- | --- | --- |
| Event-based auction discovery | Completed for bounded MVP use | `AuctionCreated` event discovery tests | Provider log-range and reorg behavior not production-tested. |
| Bounded direct-read fallback | Completed | `nextAuctionId` fallback and limit tests | Can omit older history. |
| Wallet activity discovery | Functional but partial | Wallet-scoped events, general event window, bounded fallback, tests | Not a complete account history. |
| Bid history reads | Functional but partial | Direct bid records and log fallback tests | No persistent pagination. |
| Client-side browsing controls | Completed for loaded windows | Filter/sort/search tests | Operate only on currently loaded auctions. |
| Persistent pagination | Not started | No cursor-backed persistent data source | Required before public scale. |
| Metadata cache | Not started | Opportunistic live reads only | Availability, safety, and latency risks remain. |
| Persistent indexer | Blocked by architecture decision | Options documented in `ARCHITECTURE_DECISIONS.md` | Service model, reorg handling, staleness, and ownership must be selected. |
| Database | Not started | No database layer found | Depends on indexer and hosting decisions. |
| High-volume robustness | Not started | No load, reorg, or long-history evidence | Required for public beta gate. |

## Environments and Validation

| Area | Status | Evidence | Limits |
| --- | --- | --- | --- |
| Foundry tests | Passed in CI at checkpoint | `main` CI reported green on 31 July 2026; 26 Solidity tests present | Dated state; no fuzz/invariants. |
| Frontend Vitest suite | Passed in CI at checkpoint | `main` CI reported green on 31 July 2026; CI runs `npm --prefix frontend run test` | The standalone `.mjs` deployment-validator test is outside current Vitest discovery. |
| Frontend typecheck | Passed in CI at checkpoint | Dated green `main` CI | Not a future guarantee. |
| Frontend production build | Passed in CI at checkpoint | Dated green `main` CI | Does not prove hosted runtime behavior. |
| Local deployment | Validated locally | `DeployLocal.s.sol`, sync tooling, successful Codespaces lifecycle | Uses known local accounts and valueless mock assets. |
| Automated local lifecycle | Validated locally | Successful Codespaces run on 31 July 2026: `31337`, fresh deployment, 2 bidders, 3 bids, delta step-up, finalization, NFT/refund/reward/proceeds/fees, duplicate rejection, final balances | Does not replace a Base Sepolia public multi-wallet cycle. |
| Base Sepolia deployment and verification | Partially validated on Base Sepolia | Current Base Sepolia smoke documentation and confirmed checkpoint context | Complete transaction evidence is not recorded as a finished multi-wallet lifecycle. |
| Base Sepolia public smoke | Functional but incomplete | Manual procedure exists | Full create/bid/finalize/claim/withdraw cycle across wallets remains incomplete. |
| Hosted demonstration frontend | Not started / no evidence | Repository docs describe it as absent | Hosting, environment isolation, RPC reachability, and telemetry are open. |
| Public production | Not started | No production deployment or operational evidence | All later gates remain unmet. |

## Security, Governance, and Operations

| Area | Status | Evidence | Required progression |
| --- | --- | --- | --- |
| Security defaults | Completed for MVP design | Pull payments, reentrancy guards, bounded participants, non-blocking exits | Validate with threat model, invariants, and audit. |
| Threat model | Functional but partial | Risks are dispersed through architecture and runbooks | Create a dedicated, reviewed threat model. |
| Fuzz/invariant program | Not started | No suite found | Cover solvency, claim conservation, bid sequences, snapshots, and pause. |
| Monitoring | Not started | No production telemetry configuration | Define RPC, transaction, indexer, and frontend health signals. |
| Alerting | Not started | No alert rules or escalation path | Required for controlled/public beta progression. |
| Multisig | Not started; blocked by governance decision | Production intent only | Select signers, threshold, rotation, and recovery. |
| Timelock | Not started; blocked by governance decision | Production intent only | Select delayed operations and emergency exceptions. |
| Incident response | Not started | No operational playbook or drill | Required for controlled beta. |
| Explorer source verification | Functional but partial | Manual verification is documented; no automation confirmed | Verify every public deployment and retain evidence. |
| External audit | Not started | No report | Scope and gate timing remain open. |
| Legal/regulatory review | Not started | Product disclaimers only | Jurisdiction, classification, terms, privacy, and asset policy require counsel. |
| Real-value asset policy | Blocked by product/security/legal decisions | Current demos require valueless test assets | No real-value use until an explicitly approved later gate. |

## Known Risks

- A complete Base Sepolia multi-wallet lifecycle has not been demonstrated.
- The read model can miss history outside bounded windows.
- Direct NFT metadata is externally mutable and can fail or be malicious.
- The wallet strategy is injected-wallet-centric and unvalidated on mobile or multiple providers.
- No fuzz/invariant suite or external audit supports production solvency claims.
- EOA ownership is not acceptable production governance.
- There is no monitoring, alerting, incident response, hosted runtime, or operational support model.
- Local-development server actions must never be exposed in a hosted non-Anvil environment.
- Documentation can drift if older checkpoints are treated as current status.

## Open Decisions

The following decisions remain explicitly open and must not be inferred from the MVP implementation:

- persistent indexing strategy;
- signature-per-bid versus session keys, account abstraction, delegation, or signed intents;
- required depth and repetition of the Base Sepolia smoke test;
- hosting and RPC architecture;
- wallet compatibility strategy;
- production chain;
- multisig, timelock, and emergency governance policy;
- independent review and external audit level required for each gate;
- policy for assets with real value;
- legal and regulatory framework;
- strict exclusion or build-time removal of local-dev actions from hosted environments.

Options, criteria, dependencies, and gate impacts are tracked in [`ROADMAP.md`](./ROADMAP.md) and [`ARCHITECTURE_DECISIONS.md`](./ARCHITECTURE_DECISIONS.md).

## Limits of This Checkpoint

- CI status is accurate only for the reported state on 31 July 2026.
- Local lifecycle evidence proves behavior on deterministic Anvil with known development accounts, not public-chain reliability.
- Base Sepolia is partially validated only; this document does not claim a completed public smoke test.
- Generated deployment files are intentionally ignored and are not repository evidence by themselves.
- “Production-target” describes the intended user-signed transaction model; it does not mean production-ready.
- Repository inspection cannot prove external work for which no retained evidence was supplied.

## Evidence and Runbooks

- [`README.md`](../README.md) — repository overview and local entry points.
- [`MVP_CHECKPOINT.md`](./MVP_CHECKPOINT.md) — historical detailed MVP checkpoint.
- [`LOCAL_LIFECYCLE_SMOKE_TEST.md`](./LOCAL_LIFECYCLE_SMOKE_TEST.md) — validated local lifecycle procedure and expected economics.
- [`BASE_SEPOLIA_SMOKE_TEST.md`](./BASE_SEPOLIA_SMOKE_TEST.md) — incomplete public multi-wallet smoke procedure.
- [`TESTNET_DEPLOYMENT_RUNBOOK.md`](./TESTNET_DEPLOYMENT_RUNBOOK.md) — controlled testnet deployment and redeployment procedure.
- [`POST_DEPLOYMENT_VERIFICATION.md`](./POST_DEPLOYMENT_VERIFICATION.md) — reusable deployment verification procedure.
- [`ARCHITECTURE_DECISIONS.md`](./ARCHITECTURE_DECISIONS.md) — open technical decisions and options.
- [`ROADMAP.md`](./ROADMAP.md) — gated progression beyond the MVP.

## Maintenance Rule

Update this document whenever a gate changes, a public deployment is replaced, a major capability is added or removed, or new validation evidence is accepted. Every status change must include a date, an evidence type, and a direct reference to the relevant test, runbook, report, or confirmed execution record. Older checkpoints should remain historical and point here rather than independently redefining current status.
