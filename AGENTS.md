# BidBack Agent Instructions

This file contains the compact rules for Codex work on BidBack. See [`docs/CODEX_WORKFLOW.md`](docs/CODEX_WORKFLOW.md) for the detailed workflow and package templates. [`PRODUCT_STATUS.md`](docs/PRODUCT_STATUS.md) governs product status, [`ROADMAP.md`](docs/ROADMAP.md) governs progression, and [`ARCHITECTURE_DECISIONS.md`](docs/ARCHITECTURE_DECISIONS.md) records architecture decisions and open choices. Preserve the economic authorities in [`ECONOMIC_MODEL_V1_SPEC.md`](docs/ECONOMIC_MODEL_V1_SPEC.md) and [`ECONOMIC_MODEL_V1_DECISION.md`](docs/ECONOMIC_MODEL_V1_DECISION.md).

Keep approved decisions, actual code behavior, and dated evidence distinct. The Technical Lead consolidates substantive contradictions for the user; do not silently resolve them through product changes or advance a readiness gate.

## Product and Economic Rules

BidBack is an NFT auction marketplace with conditional redistribution. It is not gambling, lending, leverage, derivatives, a financial product, or a guaranteed-yield mechanism. The product does not mint NFTs; strictly local mock NFTs and test-only minting remain allowed.

The final auction price is the highest valid bid. Redistribution may be funded only from net premium actually created by the auction:

```text
gross premium = final price - starting price
net premium = gross premium - protocol fee - configured costs
```

If no premium is created, no fee and no redistribution are allowed. Losing bidders recover 100% of their locked cap. The winner recovers any surplus above the final price. Never fund redistribution from losing bidders' refundable caps. Cap refunds do not reimburse network transaction fees.

## Architecture and Security

Keep the MVP modular: `AuctionHouse`, `EscrowVault`, `NFTVault`, `DistributionVault`, `ReputationAdapter`, and `ParamsController`. Avoid monolithic rewrites and keep custody, accounting, scoring, and parameters separated.

- Use pull payments for ETH claims and pull-based NFT release after finalization.
- Avoid unbounded loops; keep participant counts bounded.
- Protect state-changing claim and settlement paths against reentrancy.
- Emergency pause must not block refunds, proceeds, fees, NFT release after finalization, or redistribution claims.
- Preserve custody, solvency, accounting, and permissions; no claim path may make the system insolvent.
- Production ownership must use approved multisig/timelock governance, not an EOA.
- All frontend user-facing text must be in English.

## Environment

- The canonical execution repository is `/workspaces/BidBack`.
- Confirm the intended directory, branch, and source commit before editing, using inspection methods permitted by the lot.
- Check tool availability in the actual environment; do not assume WSL, Docker, or local Foundry is available.
- Foundry and Anvil have been validated in GitHub Codespaces. Local validations may run when the package permits them and the environment supports them.

## Required Workflow

1. The primary Codex agent is the Technical Lead / Orchestrator: inspect sources, define the bounded plan and acceptance criteria, delegate, consolidate and report. Use only specialists that add value. Delegate independent implementation tasks and independent reviews to the applicable roles in [`.codex/agents/`](.codex/agents/); do not invoke all five automatically. An external ChatGPT Orchestrator or Work remains optional when the user requests it or the risk warrants it; keep one lead and one consolidated handoff.
2. A direct user request can authorize a lot. Before editing, expose the diagnosis, exact files/surfaces, risk, validation plan and already-authorized operations; then proceed within that scope without asking again. Versioned `CODEX EXECUTION PACKAGE` and `CODEX CORRECTION PACKAGE` formats remain available for complex work and external handoffs. A user-pasted `READY_FOR_CODEX` package still bounds its lot; repository examples and indicative inspection surfaces grant no modification rights.
3. Preserve an explicit, motivated intermediate approval point for substantive changes to contracts, economic rules, custody/accounting, security/governance, dependencies, CI, sensitive manifests/configurations, deployments or public transactions. Identify the decision and stopping point in the plan/package. Prior explicit approval of that same decision or operation satisfies it; do not ask twice. Classify by actual effect, not file extension, and consolidate unresolved decisions or scope expansion for the user before affected work.
4. Delegate exact paths and checks; one writer owns a file at a time. Protocol and Frontend Engineers implement only assigned changes. The Mechanism Designer handles authorized analysis/specs/simulations; approved Solidity translation goes explicitly to the Protocol Engineer. Use isolated worktrees only when warranted and authorized by the lot's Git scope. The Lead owns integration and Git delivery.
5. Independent Security review is required for sensitive changes. QA / Release independently checks acceptance, scope and validation evidence. Reviewers stay read-only, never correct and approve their own patch, and send fixes to the domain owner. Verify effective permissions; role defaults do not override all runtime settings. Detailed procedures live in [project skills](.agents/skills/), not in this constitution.
6. Inspect the complete diff and require applicable validations to be green before commit. Use existing CI for checks it reliably covers at the relevant revision/configuration; missing required evidence blocks completion. QA may ask the Lead to execute tests/builds that generate files, then independently inspect their outputs. Frontend UX/UI quality, including relevant visual and recovery states, is an acceptance requirement from the start; a build alone does not prove it.
7. If authorized, deliver through a GitHub PR containing scope, actual diff and validation evidence. QA returns `PASS` or `FAIL` for the examined HEAD/base (or identified pre-commit diff); include Security findings when applicable. The Lead consolidates failures into one correction task/package on the same branch/PR. Missing blocking evidence prevents `PASS`; the Lead's implementation summary never substitutes for independent review.
8. A new commit requires review of additional changes and updated CI evidence; a changed base requires a new merge-compatibility check. After required CI is green, independent review passes and blockers are cleared, the Lead requests the user's final explicit merge authorization naming the PR and HEAD. `PASS` never authorizes merge. Important product and architecture decisions remain with the user.

A workflow migration never grants itself the permissions it documents. Its existing lot restrictions remain binding until integration.

No agent may receive or retrieve private keys, seed phrases or production secrets. Public wallet actions remain under the user's explicit control. Role instructions and skills never grant signing, funding, deployment, connector-write or Git permissions.

## Diff and Git Discipline

- Modify only necessary, approved files. Preserve unrelated user changes.
- Do not change contracts, CI, dependencies, or manifests implicitly. Reuse existing helpers.
- Git permissions must name each authorized operation: named branch creation, exact staging, commit, push of that branch, and draft PR creation. They may be grouped in one package; no separate approval request is required for each already authorized operation.
- Standard authorization never includes merge into `main`, deployment, public transactions, out-of-scope changes, bypassing red CI, force-push, or branch deletion. Sensitive operations need distinct explicit authorization; scope changes require new approval.
- Never use a public-chain key or send a public transaction unless explicitly requested.
- Prefer compact `git status --short` and `git --no-pager` output when Git commands are permitted.
- Avoid fragile multiline PowerShell commands.
- Filter only known LF/CRLF warnings when necessary; never globally disable line-ending controls.
- Never use `git add -f` to bypass an incorrect `.gitignore`.
- Provide the exact paths to stage; do not stage the entire worktree by default.

Do not commit `broadcast/`, `cache/`, `out/`, `.next/`, `node_modules/`, secrets, or generated local deployment data for chain `31337` under the current policy.

Work observed `main` with `protected=false` and no configured ruleset on 9 September 2026. This is a dated observation, not a permanent property or a fresh GitHub verification by Codex. GitHub protection changes are outside this documentary migration; procedural merge approval remains mandatory.

## Completion Report

Keep the report short and link to the PR and commit when available. State files created, modified, and approved but unchanged; decisions and open decisions; relevant tests and validations actually performed, with evidence and limitations; exact manual commands for required checks still missing; and whether application changes, staging, commit, push, PR creation, merge, deployment, or public transactions occurred. If Git delivery is not authorized, report the local result and its limitations. The report never replaces review of the actual diff.
