# BidBack Agent Instructions

This file is the local source of truth for Codex work on BidBack. See [`docs/CODEX_WORKFLOW.md`](docs/CODEX_WORKFLOW.md) for the detailed workflow.

## Product and Economic Rules

BidBack is an NFT auction marketplace with conditional redistribution. It is not gambling, lending, leverage, derivatives, a financial product, or a guaranteed-yield mechanism. The product does not mint NFTs; strictly local mock NFTs and test-only minting remain allowed.

The final auction price is the highest valid bid. Redistribution may be funded only from net premium actually created by the auction:

```text
gross premium = final price - starting price
net premium = gross premium - protocol fee - configured costs
```

If no premium is created, no fee and no redistribution are allowed. Losing bidders recover 100% of their locked cap. The winner recovers any surplus above the final price. Never fund redistribution from losing bidders' refundable caps.

## Architecture and Security

Keep the MVP modular: `AuctionHouse`, `EscrowVault`, `NFTVault`, `DistributionVault`, `ReputationAdapter`, and `ParamsController`. Avoid monolithic rewrites and keep custody, accounting, scoring, and parameters separated.

- Use pull payments for ETH claims and pull-based NFT release after finalization.
- Avoid unbounded loops; keep participant counts bounded.
- Protect state-changing claim and settlement paths against reentrancy.
- Emergency pause must not block refunds, proceeds, fees, NFT release after finalization, or redistribution claims.
- Production ownership must use approved multisig/timelock governance, not an EOA.
- All frontend user-facing text must be in English.

## Environment

- Native Windows workspace: `C:\Users\Vibe\Code\BidBack`, normally in VS Code.
- Do not assume WSL, Docker, or local Foundry is available.
- Foundry and Anvil are validated in GitHub Codespaces.

## Required Workflow

1. Read relevant files and propose a file-level plan before modification.
2. Wait for explicit plan approval.
3. Make only approved local changes.
4. Do not execute validation in the current sandboxed Windows workflow. Supply manual commands and wait for results.
5. Propose staging and commit steps only after successful validation. Never commit, push, deploy, transact publicly, or merge without explicit authorization.

For Foundry/Anvil lots, a temporary validation branch may be used only after local changes are ready and the user explicitly approves Git operations. Validate it in Codespaces; merge into protected `main` only after successful validation/CI and explicit approval.

## Diff and Git Discipline

- Modify only necessary, approved files. Preserve unrelated user changes.
- Do not change contracts, CI, dependencies, or manifests implicitly. Reuse existing helpers.
- Never use a public-chain key or send a public transaction unless explicitly requested.
- Prefer compact `git status --short` and `git --no-pager` output.
- Avoid fragile multiline PowerShell commands.
- Filter only known LF/CRLF warnings when necessary; never globally disable line-ending controls.
- Never use `git add -f` to bypass an incorrect `.gitignore`.
- Provide the exact paths to stage; do not stage the entire worktree by default.

Do not commit `broadcast/`, `cache/`, `out/`, `.next/`, `node_modules/`, secrets, or generated local deployment data for chain `31337` under the current policy.

## Completion Report

Report files created, modified, and approved but unchanged; decisions and open decisions; affected tests; risks; exact manual validation commands; validation actually performed; and explicit confirmation of whether any application file, commit, push, deployment, or public transaction was involved.
