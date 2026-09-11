# BidBack Product Status

**Checkpoint date:** 11 September 2026

**Status authority:** This document is the current source of truth for BidBack product status. Procedure documents and older checkpoints must not override it.

## Executive Summary

BidBack is a functional NFT auction MVP with modular on-chain custody, bidding, settlement, refunds, conditional premium-funded rewards, and pull-based claims. The repository also contains a responsive Next.js interface, bounded read models, wallet-signed transaction flows, guarded local-development actions, deployment validation, and on-chain verification tooling.

At this checkpoint:

- Lot 7 entered from clean `main` at `ab6f6493024e88fb3cfc3969b6935cfb641e3054`, after PR #7 / Lot 6 merged; [post-merge CI run 34615073827](https://github.com/VicomteBdV/BidBack/actions/runs/34615073827) completed successfully on that exact SHA (verified through GitHub on 11 September 2026);
- Lots 5 and 6 implement and deterministically test the controlled public-target/local-dev transaction boundary, desktop injected / EIP-6963 connectors, explicit multi-wallet selection, active-connector transaction-provider authority, and fail-closed non-local browser RPC configuration;
- MetaMask desktop manual validation and Rabby desktop manual validation remain pending; mock coverage does not establish extension compatibility;
- Lot 7 adds session metadata, manifest SHA-256, persisted phase evidence, receipt collection, and read-only duplicate simulations for a future separately authorized Base Sepolia session; its deterministic execution evidence belongs to the Lot 7 PR, and no second public lifecycle is established by this tooling;
- after Lot F integration at commit `607442b6c2da985a373866163fc3cdda8e6ac116`, the `main` CI workflow was reported and confirmed green during the project validation workflow on 25 August 2026; the retained run URL and archival metadata are not recorded here, and this dated observation is not a future guarantee;
- the complete automated local lifecycle was successfully executed in GitHub Codespaces on 31 July 2026 against a fresh Anvil chain on `31337`;
- the local run confirmed deployment, three bids across two bidders, delta-only step-up, finalization, all claims and withdrawals, duplicate-action rejection, and verified final balances;
- **One complete canonical Base Sepolia cycle validated:** on 22 August 2026, auction `#2` completed the wallet-signed lifecycle on Base Sepolia (`84532`) across five distinct public role wallets and a separately deployed valueless test-only NFT; the final verifier passed, five duplicate-action `eth_call` simulations reverted as expected, and the final verifier still passed afterward;
- **Economic Model V1 — Completed / evaluated:** the executable specification, exact Python baseline twin, 14 deterministic normal scenarios, 10 adversarial pairs, Candidates A-E, deterministic Lot F decision reduction, and final decision record produced the outcome `no-current-candidate-acceptable`;
- no hosted demonstration frontend, production indexer, external audit, production governance, monitoring, user research, or legal review is confirmed.

BidBack therefore meets the documented **Demo-ready** gate for a controlled local demonstration. The canonical public-testnet cycle criterion is satisfied for this one bounded run, but the remaining Controlled beta criteria are not. BidBack does not meet **Controlled beta-ready**, **Public beta-ready**, or **Production-ready**.

The economic evaluation is closed without selecting the baseline or Candidates A-E, without a parameter-only approval, and without approving a Solidity evolution or automatic application change. The next short checkpoint is a bounded, research-oriented **GBM / Competitive & Prior-Art Review**. The next major product workstream is **Premium Controlled-Experience Readiness**, combining a premium user experience with the minimum controlled environment needed for credible external sessions.

## Status Legend

| Status | Meaning |
| --- | --- |
| Completed | Implemented and supported by repository evidence appropriate to the claim. |
| Functional but partial | Usable for the MVP, with a documented coverage, scale, UX, or validation limitation. |
| Validated locally | Executed successfully against local Anvil or covered by the confirmed local validation environment. |
| One complete canonical Base Sepolia cycle validated | One dated, bounded public-testnet lifecycle completed with retained final-state and economic confirmation. This status does not generalize to other deployments, wallets, providers, browsers, scenarios, load levels, or production use. |
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
| Canonical public validation | One named public-testnet scenario completed with distinct actors, reconciled economics, final-state verification, and duplicate-action simulations. | Repeatability, a support matrix, hosted-beta operations, broad adversarial coverage, audit assurance, or production readiness. |
| No evidence | No reliable repository or confirmed execution evidence was identified. | That work has never happened outside the inspected record. |

## Economic Model V1 Closure

**Status:** `Economic Model V1 — Completed / evaluated`

**Recorded outcome:** `no-current-candidate-acceptable`

The current Solidity mechanism remains functional bounded MVP behavior, but its presence in the repository is not approval of it as the selected Economic Model V1 direction. The baseline and Candidates A-D were not selected. Candidate E remains an analytical counterfactual benchmark that is impractical in the current architecture. P2a remains `non-comparable`; `parameter-only` was rejected; and no Solidity evolution, parameter change, or automatic application change was approved.

The P4/P5 observability boundary is a known economic limitation and an explicit conditional research boundary only. It is not an open V1 decision, an automatic workstream, or a reason to modify Solidity now. Reopening requires a later targeted decision supported by evidence.

Authoritative sources are [`ECONOMIC_MODEL_V1_SPEC.md`](./ECONOMIC_MODEL_V1_SPEC.md), [`ECONOMIC_MODEL_V1_DECISION.md`](./ECONOMIC_MODEL_V1_DECISION.md), and the versioned specification, scenario, diagnostic, candidate, and decision-reduction artifacts under [`economic-model/`](../economic-model/). This closure does not advance any Controlled beta, Public beta, or Production gate automatically.

## Smart Contracts

| Capability | Status | Evidence | Limits / next proof required |
| --- | --- | --- | --- |
| ERC-721 auction creation | Completed; validated locally and in one canonical Base Sepolia cycle | `AuctionHouse`, `NFTVault`, Foundry tests, Anvil lifecycle, Base Sepolia auction `#2` | Public repetition across supported environments remains unproven. |
| NFT custody and release | Completed; validated locally | `NFTVault`, claim tests, Anvil custody and release checks | No external audit. |
| Bidding and highest valid cap | Completed; validated locally | `AuctionHouse.placeBid`, Solidity tests, Anvil lifecycle | Public load and gas behavior not measured. |
| Step-up-only cap accounting | Completed; validated locally | Targeted Solidity test and Anvil `0.8 ETH` delta step-up | No fuzzed bid-sequence coverage. |
| Anti-sniping | Functional but partial | Contract implementation and snapshotted parameters | No dedicated behavioral test proving extension boundaries and maximum extensions was found. |
| Finalization | Completed; validated locally and in one canonical Base Sepolia cycle | Solidity integration tests, Anvil lifecycle, Base Sepolia auction `#2` | No repeated public matrix or production-load evidence. |
| Winner NFT claim | Completed; validated locally | Pull-based claim implementation, double-claim test, Anvil lifecycle | No independent audit. |
| Losing bidder refunds | Completed; validated locally | Full-cap refund accounting, tests, `1.5 ETH` Anvil refund | Production-scale solvency assurance still requires invariants and audit. |
| Conditional rewards | Completed; validated locally as bounded MVP behavior | Premium-derived calculation tests and `0.19 ETH` Anvil reward | Rewards remain conditional and can be zero outside the deterministic scenario; Economic Model V1 did not select the current mechanism as the future economic direction. |
| Seller proceeds | Completed; validated locally | Pull withdrawal tests and `1.76 ETH` Anvil withdrawal | Historical attribution needs an indexer or richer event model. |
| Protocol fees | Completed; validated locally | Premium-only fee logic, snapshot tests, `0.05 ETH` Anvil withdrawal | Governance and production recipient policy are open. |
| Parameter, module, and fee-recipient snapshots | Completed | Dedicated Solidity suites, read-only frontend display, canonical Base Sepolia verifier | Future deployments still require their own verification. |
| Pause and permissions | Completed for MVP | Owner controls, one-time vault wiring, pause tests proving exits remain available | Production roles, multisig, and timelock are absent. |
| Duplicate-action protection | Completed; validated locally and in one canonical Base Sepolia cycle | Solidity reverts, Anvil duplicate simulations, five Base Sepolia `eth_call` duplicate simulations | No adversarial external review; archival call metadata remains pending evidence. |
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
| Auction creation | Completed for MVP; one canonical public wallet run validated | Local-dev and wallet-signed flows, ownership/approval validation tests, Base Sepolia auction `#2` | Hosted support and cross-wallet/browser validation remain incomplete. |
| Bidding | Completed for MVP | Wallet-signed bid panel, delta calculation guards, local-dev flow | A signature is required for every current wallet-signed bid. |
| Finalization | Completed for MVP; one canonical public wallet run validated | Wallet-signed and local-dev panels with lifecycle guards, Base Sepolia auction `#2` | Hosted support and repeatability remain incomplete. |
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
| Wallet strategy | Desktop injected / EIP-6963 model implemented; manual validation pending | Lot 6 explicit multi-wallet selection and connector-aware transaction provider; deterministic selector/provider tests | MetaMask and Rabby manual validation pending. WalletConnect, mobile and proprietary integrations remain outside validated support. |
| Controlled environment boundary | Implemented and deterministically tested | Lot 5 excludes local-dev transaction execution on public targets; Lot 6 fails closed for non-local browser RPC configuration | Hosted frontend still absent; deployed environment isolation and browser/server RPC reachability remain unproven. |
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
| Foundry tests | Passed in CI at checkpoint | [Run 34615073827](https://github.com/VicomteBdV/BidBack/actions/runs/34615073827) passed on entry SHA `ab6f649` | Dated state; no fuzz/invariants. |
| Frontend Vitest suite | Passed in CI at checkpoint | Run `34615073827` passed on entry SHA `ab6f649`; CI runs `npm --prefix frontend run test` | Standalone `.mjs` suites, including the session/evidence suites, are outside current CI/Vitest discovery. |
| Frontend typecheck | Passed in CI at checkpoint | Run `34615073827` passed on entry SHA `ab6f649` | Not a future guarantee. |
| Frontend production build | Passed in CI at checkpoint | Run `34615073827` passed on entry SHA `ab6f649` | Does not prove hosted runtime behavior. |
| Economic Model V1 validation and integration | Completed / evaluated | Full Python and Foundry validation was reported complete in Windows and Codespaces; Lot F was integrated at `607442b6c2da985a373866163fc3cdda8e6ac116`; `main` CI was reported green on 25 August 2026 | The retained CI run URL and archival metadata are not recorded here; the result does not approve a candidate or guarantee future CI health. |
| Local deployment | Validated locally | `DeployLocal.s.sol`, sync tooling, successful Codespaces lifecycle | Uses known local accounts and valueless mock assets. |
| Automated local lifecycle | Validated locally | Successful Codespaces run on 31 July 2026: `31337`, fresh deployment, 2 bidders, 3 bids, delta step-up, finalization, NFT/refund/reward/proceeds/fees, duplicate rejection, final balances | Does not replace a Base Sepolia public multi-wallet cycle. |
| Base Sepolia deployment and verification | One complete canonical Base Sepolia cycle validated | Six-contract deployment in `frontend/public/deployments/84532.json`, final lifecycle verifier, evidence report | Deployment transaction hashes, BaseScan source-verification status, checksums, and exact block metadata remain pending evidence. |
| Base Sepolia public smoke | One complete canonical Base Sepolia cycle validated | 22 August 2026, auction `#2`, five distinct wallets, test-only NFT, complete claim/withdraw sequence, final verifier, five duplicate simulations | One bounded scenario only; no repeated wallet/browser/RPC matrix, hosted-beta proof, load test, or external audit. |
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

- Only one bounded canonical Base Sepolia multi-wallet lifecycle has been demonstrated; repeatability and broader scenario coverage remain unproven.
- The read model can miss history outside bounded windows.
- Direct NFT metadata is externally mutable and can fail or be malicious.
- Desktop injected wallet selection and provider isolation are deterministically tested; real MetaMask/Rabby multi-extension sessions and mobile remain unvalidated.
- No fuzz/invariant suite or external audit supports production solvency claims.
- EOA ownership is not acceptable production governance.
- There is no monitoring, alerting, incident response, hosted runtime, or operational support model.
- Local-development server actions must never be exposed in a hosted non-Anvil environment.
- The current Solidity mechanism is functional bounded MVP behavior but was not selected as the Economic Model V1 direction; P4/P5 remains a conditional observability-related reopening boundary.
- Documentation can drift if older checkpoints are treated as current status.

## Open Decisions

The following decisions remain explicitly open and must not be inferred from the MVP implementation:

- persistent indexing strategy;
- signature-per-bid versus session keys, account abstraction, delegation, or signed intents;
- required repetition and wallet/browser/RPC matrix beyond the single validated canonical Base Sepolia cycle;
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

- The latest CI claim is limited to the reported and confirmed green `main` state on 25 August 2026 after Lot F integration; its retained run URL and archival metadata are not recorded here, and it is not a future guarantee.
- Local lifecycle evidence proves behavior on deterministic Anvil with known development accounts, not public-chain reliability.
- Base Sepolia evidence proves one complete canonical public smoke on 22 August 2026 only; it does not prove broad testnet validation or any higher readiness gate.
- Generated deployment files are intentionally ignored and are not repository evidence by themselves.
- “Production-target” describes the intended user-signed transaction model; it does not mean production-ready.
- Repository inspection cannot prove external work for which no retained evidence was supplied.

## Evidence and Runbooks

- [`README.md`](../README.md) — repository overview and local entry points.
- [`MVP_CHECKPOINT.md`](./MVP_CHECKPOINT.md) — historical detailed MVP checkpoint.
- [`LOCAL_LIFECYCLE_SMOKE_TEST.md`](./LOCAL_LIFECYCLE_SMOKE_TEST.md) — validated local lifecycle procedure and expected economics.
- [`BASE_SEPOLIA_SMOKE_TEST.md`](./BASE_SEPOLIA_SMOKE_TEST.md) — reusable canonical public multi-wallet smoke procedure.
- [`REPORT.md`](./evidence/base-sepolia/2026-08-22-auction-2-bd56f90/REPORT.md) — accepted bounded record for the 22 August 2026 canonical Base Sepolia run, including pending archival fields.
- [`TESTNET_DEPLOYMENT_RUNBOOK.md`](./TESTNET_DEPLOYMENT_RUNBOOK.md) — controlled testnet deployment and redeployment procedure.
- [`POST_DEPLOYMENT_VERIFICATION.md`](./POST_DEPLOYMENT_VERIFICATION.md) — reusable deployment verification procedure.
- [`ARCHITECTURE_DECISIONS.md`](./ARCHITECTURE_DECISIONS.md) — open technical decisions and options.
- [`ECONOMIC_MODEL_V1_SPEC.md`](./ECONOMIC_MODEL_V1_SPEC.md) — closed Economic Model V1 specification and acceptance boundary.
- [`ECONOMIC_MODEL_V1_DECISION.md`](./ECONOMIC_MODEL_V1_DECISION.md) — final decision record with outcome `no-current-candidate-acceptable`.
- [`economic-model/README.md`](../economic-model/README.md) — executable economic-model modules, catalogues, and validation entry points.
- [`ROADMAP.md`](./ROADMAP.md) — gated progression beyond the MVP.

## Maintenance Rule

Update this document whenever a gate changes, a public deployment is replaced, a major capability is added or removed, or new validation evidence is accepted. Every status change must include a date, an evidence type, and a direct reference to the relevant test, runbook, report, or confirmed execution record. Older checkpoints should remain historical and point here rather than independently redefining current status.
