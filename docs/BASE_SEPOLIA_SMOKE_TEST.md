# Base Sepolia Smoke Test

This document describes the manual smoke test procedure for the first controlled BidBack deployment on Base Sepolia.

The goal is to validate the full wallet-signed auction lifecycle with a real external ERC-721 testnet NFT.

This is not a production launch checklist. The deployment remains a controlled public testnet, unaudited, and must not be used with assets of real value.

---

## 1. Scope

This smoke test validates:

- Base Sepolia deployment loading;
- wallet connection on the correct chain;
- external ERC-721 ownership detection;
- NFT approval to `NFTVault`;
- wallet-signed auction creation;
- wallet-signed bidding;
- finalization;
- NFT claim;
- refund claim;
- reward claim, when applicable;
- seller proceeds withdrawal;
- protocol fee withdrawal.

This smoke test does not validate:

- production-grade monitoring;
- explorer source-code verification;
- multisig / timelock governance;
- account abstraction;
- session keys;
- relayers;
- indexer scalability;
- production UX.

---

## 2. Prerequisites

Before starting, prepare the following wallets and assets.

| Item | Requirement |
|---|---|
| Network | Base Sepolia |
| Seller wallet | Funded with Base Sepolia ETH |
| Bidder #1 wallet | Funded with Base Sepolia ETH |
| Bidder #2 wallet | Funded with Base Sepolia ETH |
| Fee recipient wallet | Funded if it needs to submit withdrawal transactions |
| NFT | A real ERC-721 testnet NFT owned by the seller |
| Frontend | Configured for Base Sepolia |
| Local-dev actions | Disabled outside Anvil |

`ENABLE_LOCAL_DEV_ACTIONS` must be absent or set to `false`.

Do not use `LocalERC721` for this smoke test.

---

## 3. Pre-test deployment checks

From the repo root:

```bash
cd /workspaces/BidBack

npm run validate:deployment -- 84532

BIDBACK_RPC_URL="https://sepolia.base.org" \
npm run verify:deployment:onchain -- 84532

Expected result:

deployment JSON is valid;
Base Sepolia RPC is reachable;
deployed bytecode is present for all core contracts;
owners are readable;
global feeRecipient is readable;
ParamsController.params() is readable;
module linkage is valid.

Optional owner / fee recipient check:

EXPECTED_OWNER="<expected-owner-address>" \
EXPECTED_FEE_RECIPIENT="<expected-fee-recipient-address>" \
BIDBACK_RPC_URL="https://sepolia.base.org" \
npm run verify:deployment:onchain -- 84532
4. Frontend configuration

For local frontend testing against Base Sepolia, use:

cd /workspaces/BidBack/frontend

cat > .env.local <<EOF
NEXT_PUBLIC_CHAIN_ID=84532
NEXT_PUBLIC_CHAIN_NAME=Base Sepolia
NEXT_PUBLIC_WALLET_RPC_URL=https://sepolia.base.org
NEXT_PUBLIC_BLOCK_EXPLORER_URL=https://sepolia.basescan.org
BIDBACK_CHAIN_ID=84532
BIDBACK_RPC_URL=https://sepolia.base.org
ENABLE_LOCAL_DEV_ACTIONS=false
EOF

npm run dev

Expected result:

the frontend loads the 84532.json deployment file;
the deployment console displays Base Sepolia;
the wallet can connect;
if the wallet is on the wrong chain, the UI proposes switching to Base Sepolia;
local-dev actions remain unavailable.
5. Manual smoke test scenario
Step 1 — Seller connects wallet

Use the seller wallet.

Expected result:

wallet is connected;
wallet is on Base Sepolia;
deployment is loaded;
AuctionHouse and NFTVault addresses are visible.
Step 2 — Seller enters NFT details

In the create auction flow, enter:

ERC-721 contract address;
token ID.

Expected result:

ownerOf(tokenId) is read successfully;
displayed owner matches the connected seller wallet;
NFTVault address is displayed;
approval status is displayed.

Do not continue if the seller is not the NFT owner.

Step 3 — Seller approves NFTVault

If the NFT is not approved:

click Approve NFTVault;
sign the wallet transaction;
wait for confirmation.

Expected result:

getApproved(tokenId) equals NFTVault, or;
isApprovedForAll(owner, NFTVault) is true;
create auction action becomes available.
Step 4 — Seller creates auction

Create an auction with test parameters.

Recommended smoke-test setup:

Parameter	Recommendation
Start price	Low enough for bidders to test
Duration	Short but not too short
NFT	Real ERC-721 testnet NFT
Seller	Current connected wallet

Expected result:

transaction succeeds;
auction appears in the UI;
NFT is transferred into custody;
auction status is open;
parameter snapshot is visible;
fee recipient snapshot is visible.
Step 5 — Bidder #1 places a bid

Switch to bidder #1 wallet.

Expected result:

wallet is on Base Sepolia;
bidder #1 can place a valid bid;
transaction succeeds;
bidder #1 becomes highest bidder;
bidder cap / exposure is updated.
Step 6 — Bidder #2 outbids bidder #1

Switch to bidder #2 wallet.

Expected result:

bidder #2 can place a higher valid bid;
transaction succeeds;
bidder #2 becomes highest bidder;
bidder #1 becomes outbid;
auction state remains consistent.
Step 7 — Wait for auction expiration

Wait until the auction end time has passed.

Expected result:

auction can be finalized;
no premature finalization is possible before expiry.
Step 8 — Finalize auction

Use any eligible wallet if finalization is permissionless, or the expected wallet if the UI restricts this action.

Expected result:

finalization transaction succeeds;
auction status becomes finalized;
final price is fixed;
seller proceeds are credited;
protocol fees are credited to the fee recipient snapshot;
refunds / rewards are available where applicable.
Step 9 — Winner claims NFT

Use the winner wallet.

Expected result:

winner can claim the NFT;
NFT is transferred from custody to the winner;
duplicate NFT claim is impossible.
Step 10 — Losing bidder claims refund

Use the losing bidder wallet.

Expected result:

losing bidder can claim refund;
refund amount is transferred;
duplicate refund claim is impossible.
Step 11 — Losing bidder claims reward, if applicable

Use the losing bidder wallet.

Expected result:

reward claim succeeds if reward entitlement is greater than zero;
if no reward is available, the UI should make this clear;
duplicate reward claim is impossible.

Note: rewards may be zero if the premium net is too low or if redistribution conditions are not met.

Step 12 — Seller withdraws proceeds

Use the seller wallet.

Expected result:

seller can withdraw proceeds;
proceeds are transferred;
duplicate withdrawal is impossible.
Step 13 — Fee recipient withdraws protocol fees

Use the fee recipient wallet.

Expected result:

fee recipient can withdraw protocol fees;
fees were credited to the fee recipient snapshot of the auction;
duplicate withdrawal is impossible.
6. Expected final state

At the end of the smoke test:

Area	Expected result
Auction	Finalized
NFT	Held by winner
Seller	Proceeds withdrawn
Losing bidder	Refund claimed
Reward	Claimed if applicable
Protocol fees	Withdrawn by fee recipient
Double claims	Rejected
Local-dev actions	Not used
Server-side private keys	Not used
7. Common issues and mitigations
Issue	Likely cause	Mitigation
Wallet on wrong network	Wallet not on Base Sepolia	Use the network switch button or switch manually
Deployment not loaded	Missing or stale 84532.json	Re-run deployment sync and validation
NFT owner mismatch	Wrong wallet or wrong token ID	Confirm seller wallet and token ID
Approval missing	NFTVault not approved	Use Approve NFTVault before creating the auction
Create auction fails	Wrong approval, wrong owner, or invalid parameters	Re-check owner, approval and auction inputs
Bid fails	Bid too low or wallet underfunded	Increase bid and check Base Sepolia ETH balance
Cannot finalize	Auction not expired	Wait until end time
Reward is zero	Premium net too low or conditions not met	Use a larger second bid in a future test
Fee withdrawal fails	Wrong wallet	Use the fee recipient snapshot wallet
RPC errors	Public RPC rate limit or instability	Retry or use a more reliable RPC
Local-dev actions visible	ENABLE_LOCAL_DEV_ACTIONS enabled	Set it to false or remove it outside Anvil
8. Smoke test execution log

Use this table to record the test.

Step	Wallet	Transaction hash	Result	Notes
Seller connects wallet	Seller	N/A		
NFT ownership check	Seller	N/A		
Approve NFTVault	Seller			
Create auction	Seller			
First bid	Bidder #1			
Second bid	Bidder #2			
Finalize auction				
Claim NFT	Winner			
Claim refund	Losing bidder			
Claim reward	Losing bidder			
Withdraw seller proceeds	Seller			
Withdraw protocol fees	Fee recipient			
9. Go / No-Go
Go

Proceed only if:

Base Sepolia deployment verification passes;
frontend loads 84532.json;
wallet network switching works;
seller owns a real ERC-721 testnet NFT;
seller and bidders are funded;
ENABLE_LOCAL_DEV_ACTIONS is disabled;
no secrets are committed;
all participants understand this is a controlled unaudited testnet.
No-Go

Stop if:

deployment verification fails;
owner or fee recipient is unexpected;
frontend points to the wrong chain;
seller does not own the NFT;
NFTVault approval cannot be confirmed;
any private key appears in a file or command history intended for commit;
local-dev actions are enabled outside Anvil.