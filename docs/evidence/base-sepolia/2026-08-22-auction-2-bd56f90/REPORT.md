# Base Sepolia Canonical Run Report

**RUN_ID:** `2026-08-22-auction-2-bd56f90`

**Technical conclusion:** **Confirmed — One complete canonical Base Sepolia cycle validated.**

This report records one bounded public-testnet execution completed on 22 August 2026. It distinguishes confirmed execution results from missing archival metadata and scenarios that were not tested. Pending transaction metadata does not weaken the confirmed lifecycle and final-state conclusion, but it limits independent reconstruction of the run.

This run is not evidence that BidBack is Controlled beta-ready, Public beta-ready, Production-ready, externally audited, or broadly validated across Base Sepolia environments.

## 1. Run Identity

| Field | Value | Evidence status |
| --- | --- | --- |
| Completion date | `2026-08-22` | Confirmed |
| Exact UTC start/end timestamps | Not available | Pending evidence |
| Chain | Base Sepolia | Confirmed |
| Chain ID | `84532` | Confirmed |
| Canonical auction | `#2` | Confirmed |
| Repository commit | `bd56f9005b52dcae61b8c16599f10e67e29de3f6` | Confirmed repository reference |
| Worktree after run | Clean | Confirmed by the run operator; archival command output is pending evidence |
| CI before public smoke | Green | Confirmed by the run operator; exact run URL, timestamp, and retained output are pending evidence |
| Deployment manifest | `frontend/public/deployments/84532.json` | Confirmed source of truth |
| Manifest `generatedAt` | `2026-08-01T21:12:38.667Z` | Confirmed from the inspected repository |
| Manifest checksum | Not available | Pending evidence |

## 2. Public Core Deployment

| Contract | Public address | Deployment transaction | BaseScan source-verification status |
| --- | --- | --- | --- |
| ParamsController | `0x0b78cb13f4c6b4a9cd0f688ba97f94e377a849b4` | Pending evidence | Pending evidence |
| NFTVault | `0x9fd6aa12af1f106626f97e326c6e1256507aeaac` | Pending evidence | Pending evidence |
| EscrowVault | `0x128cbc5cb733746ba2877aba3b4ed386ce81bbf5` | Pending evidence | Pending evidence |
| DistributionVault | `0x68f08f8591ddc9dd84cbbbe6fd33c491b4b457f3` | Pending evidence | Pending evidence |
| ReputationAdapter | `0x121a1f9951d79a2d7912fda7249e7c335ff9ef4a` | Pending evidence | Pending evidence |
| AuctionHouse | `0x709a8fde1e824adaef2cbe30683e884dac88bc67` | Pending evidence | Pending evidence |

The six addresses and chain ID are confirmed from the current repository manifest. Deployment hashes, constructor/wiring hashes, checksums, exact deployment blocks, and BaseScan source-verification status were not available in the inspected repository and are not inferred.

## 3. Public Role Wallets

| Label | Role | Public address | Evidence status |
| --- | --- | --- | --- |
| `W_OWNER` | deployer and temporary testnet owner | `0xde38b5e092fC9B369ec8c15659387049f9Fa45e1` | Confirmed |
| `W_SELLER` | NFT seller, finalizer, seller proceeds claimant | `0x085d7838d500CDAfa701158af33a0246F37aa2a5` | Confirmed |
| `W_FEE` | snapshotted protocol fee recipient | `0xEa0b4d289955083159d95467f830a501082E7E6f` | Confirmed |
| `W_A` | bidder A and winner | `0x594bFc4c748f1feBf1C4C81d0949D000B5745256` | Confirmed |
| `W_B` | bidder B, losing bidder, refund and reward claimant | `0x7d8f0090A5ddfFC136bc5aAB154C12666562f1f3` | Confirmed |

All five public addresses are distinct. No private key, seed phrase, wallet export, or credential-bearing RPC URL is retained in this report.

## 4. Valueless Test-Only NFT

| Field | Value | Evidence status |
| --- | --- | --- |
| NFT address | `0x0D63564c6c6dc0Ce8b39F9e3eF31f0Aeb120B7F9` | Confirmed |
| Token ID | `1` | Confirmed |
| Classification | Separately deployed valueless test-only NFT; not part of BidBack core and not a product mint | Confirmed |
| P1 deployment transaction hash | Not available | Pending evidence |
| P1 block and exact UTC timestamp | Not available | Pending evidence |

## 5. Canonical Lifecycle

The following actions and outcomes are confirmed. Transaction hashes, blocks, exact UTC timestamps, gas values, receipts, and decoded-event archives were not available from the inspected repository and remain pending evidence.

| ID | Actor | Confirmed action | Confirmed value/result | Transaction hash |
| --- | --- | --- | --- | --- |
| P1 | `W_OWNER` | Prepare separately deployed test-only NFT for `W_SELLER` | NFT `0x0D63564c6c6dc0Ce8b39F9e3eF31f0Aeb120B7F9`, token `1` | Pending evidence |
| T1 | `W_SELLER` | Approve NFTVault for token `1` | Approval succeeded | Pending evidence |
| T2 | `W_SELLER` | Create canonical auction `#2` | Start price `0.010 ETH` | Pending evidence |
| T3 | `W_A` | Initial bid | Cap/value `0.012 ETH` | Pending evidence |
| T4 | `W_B` | Outbid | Cap/value `0.015 ETH` | Pending evidence |
| T5 | `W_A` | Step up total cap to `0.030 ETH` | Exact delta sent `0.018 ETH` | Pending evidence |
| T6 | `W_SELLER` | Finalize auction | Final price `0.030 ETH` | Pending evidence |
| T7 | `W_A` | Claim winner NFT | NFT claim succeeded | Pending evidence |
| T8 | `W_B` | Claim losing-bidder refund | Full cap refund `0.015 ETH` | Pending evidence |
| T9 | `W_B` | Claim conditional reward | Reward `0.0038 ETH` | Pending evidence |
| T10 | `W_SELLER` | Withdraw seller proceeds | `0.0252 ETH` | Pending evidence |
| T11 | `W_FEE` | Withdraw protocol fee | `0.001 ETH` | Pending evidence |

## 6. Economic Reconciliation

| Quantity | Confirmed amount | Basis |
| --- | ---: | --- |
| Starting price | `0.010 ETH` | Confirmed run input |
| Final price | `0.030 ETH` | Confirmed final result |
| Gross premium | `0.020 ETH` | Derived from confirmed final price minus starting price |
| Protocol fee | `0.001 ETH` | Confirmed final result |
| Net premium | `0.019 ETH` | Derived from confirmed gross premium minus protocol fee; no additional configured cost was recorded for this run |
| Candidate redistribution pool | `0.0095 ETH` | Confirmed canonical parameter profile and verifier expectation |
| Losing-bidder refund to `W_B` | `0.015 ETH` | Confirmed full refundable cap |
| Conditional reward to `W_B` | `0.0038 ETH` | Confirmed entitlement and claim |
| Seller proceeds | `0.0252 ETH` | Confirmed withdrawal |
| Total deposits | `0.045 ETH` | `0.012 + 0.015 + 0.018 ETH` |
| Final escrow balance | `0 ETH` | Confirmed final result |

The `0.015 ETH` refund was the losing bidder's full locked cap. The separate `0.0038 ETH` reward was funded from net premium created by the auction. No redistribution was funded from refundable losing-bidder caps. The positive reward is specific to this scenario and is not guaranteed in other auctions.

## 7. Lifecycle Verifier Evidence

The read-only lifecycle verifier succeeded interactively and successively for:

| Phase | Execution result | Persisted snapshot |
| --- | --- | --- |
| `before-create` | Not included in the confirmed phase list | Not tested / not evidenced |
| `after-create` | Passed | Pending evidence / persistence not confirmed |
| `after-bid-a` | Passed | Pending evidence / persistence not confirmed |
| `after-bid-b` | Passed | Pending evidence / persistence not confirmed |
| `after-step-up` | Passed | Pending evidence / persistence not confirmed |
| `after-finalize` | Passed | Pending evidence / persistence not confirmed |
| `after-nft-claim` | Passed | Pending evidence / persistence not confirmed |
| `after-refund` | Passed | Pending evidence / persistence not confirmed |
| `after-reward` | Passed | Pending evidence / persistence not confirmed |
| `after-seller-withdraw` | Passed | Pending evidence / persistence not confirmed |
| `final` | Passed before duplicate simulations and passed again afterward | Pending evidence / persistence not confirmed |

Exact verifier output, output-file checksums, RPC block numbers, and timestamps remain pending evidence. This report does not claim that any intermediate JSON snapshot was persisted.

## 8. Duplicate-Action Simulations

Five state-preserving `eth_call` simulations were rejected as expected after settlement. No intentionally reverting public transaction was sent.

| Simulation | Caller | Expected result | Observed result | Block / raw revert archive |
| --- | --- | --- | --- | --- |
| Second `claimNft(2)` | `W_A` | Revert | Rejected as expected | Pending evidence |
| Second `claimRefund(2)` | `W_B` | Revert | Rejected as expected | Pending evidence |
| Second `DistributionVault.claim(2)` | `W_B` | Revert | Rejected as expected | Pending evidence |
| Second `withdrawSellerProceeds()` | `W_SELLER` | Revert | Rejected as expected | Pending evidence |
| Second `withdrawProtocolFees()` | `W_FEE` | Revert | Rejected as expected | Pending evidence |

The lifecycle verifier's `final` phase still passed after all five simulations, confirming that the read-only calls did not alter state. Exact block tags, calldata, raw revert data, and decoded revert reasons remain pending evidence.

## 9. Confirmed Final State

- Auction `#2` was finalized with `W_A` as winner at `0.030 ETH`.
- The winner claimed token `1` from the test-only NFT contract.
- `W_B` claimed the full `0.015 ETH` refundable cap.
- `W_B` claimed the separate conditional reward of `0.0038 ETH`.
- `W_SELLER` withdrew `0.0252 ETH` in seller proceeds.
- `W_FEE` withdrew the `0.001 ETH` protocol fee.
- Final escrow was `0 ETH`.
- The final verifier passed before and after the five duplicate-action simulations.

Persisted final JSON, exact final block, exact final UTC timestamp, event archive, and independent receipt reconciliation remain pending evidence.

## 10. Evidence Classification

### Confirmed

- completion date, chain, auction ID, commit reference, current manifest, six core addresses, five public role wallets, test-only NFT address/token ID;
- complete approval/create/bid/step-up/finalize/claim/withdraw lifecycle;
- exact economic amounts and zero final escrow;
- successive interactive verifier passes from `after-create` through `final`;
- five expected duplicate-action rejections via `eth_call`;
- a second passing `final` check after those simulations;
- clean post-run worktree and green pre-run CI as confirmed by the run operator.

### Pending evidence

- P1 and T1–T11 transaction hashes;
- transaction receipts, block numbers, exact UTC timestamps, gas data, and decoded events;
- deployment, wiring, and ownership hashes;
- manifest and verifier-output checksums;
- BaseScan source-verification status and links;
- persisted phase snapshots and raw final-verifier output;
- duplicate-call block tags, calldata, raw reverts, and decoded reasons;
- exact CI run URL, timestamp, retained output, and clean-worktree command output.

### Not tested

- repeated canonical cycles or a wallet/browser/RPC support matrix;
- hosted frontend isolation, availability, monitoring, support, or incident response;
- public-load, maximum-bound gas, reorg, long-history, or indexer behavior;
- alternative auction economics, zero-premium cases, anti-sniping boundary scenarios, or broader bidder profiles in this public run;
- sybil, collusion, artificial bidding, reward farming, score manipulation, fuzzing, or invariant coverage as part of this run;
- production governance, multisig/timelock operation, real-value assets, production chain operation, legal review, or external audit.

## 11. Limits and Non-Claims

This report proves one canonical execution on one Base Sepolia deployment, for one auction, with one parameter profile, one test-only NFT, and five named public wallets. It does not prove repeatability, broad compatibility, economic optimality, manipulation resistance, or production safety. It does not authorize real-value use and does not change any readiness gate beyond satisfying the single canonical-cycle criterion recorded in `ROADMAP.md`.
