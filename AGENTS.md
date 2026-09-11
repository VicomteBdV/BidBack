# BidBack Agent Instructions

This file contains the compact rules for Codex work on BidBack. See [`docs/CODEX_WORKFLOW.md`](docs/CODEX_WORKFLOW.md) for the detailed workflow and package templates. [`PRODUCT_STATUS.md`](docs/PRODUCT_STATUS.md) governs product status, [`ROADMAP.md`](docs/ROADMAP.md) governs progression, and [`ARCHITECTURE_DECISIONS.md`](docs/ARCHITECTURE_DECISIONS.md) records architecture decisions and open choices. Preserve the economic authorities in [`ECONOMIC_MODEL_V1_SPEC.md`](docs/ECONOMIC_MODEL_V1_SPEC.md) and [`ECONOMIC_MODEL_V1_DECISION.md`](docs/ECONOMIC_MODEL_V1_DECISION.md).

Keep approved decisions, actual code behavior, and dated evidence distinct. Report substantive contradictions to the Orchestrator; do not silently resolve them through product changes or advance a readiness gate.

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

1. The Orchestrator is an interface-independent role responsible for analysis, orchestration, and review independent of the Builder. It inspects sources and dependencies and performs or coordinates relevant specialist analyses before implementation, with a useful synthesis for the user. By default, one standard ChatGPT chat dedicated to BidBack serves as the Orchestrator, and Codex remains the Builder. Work is optional for heavy, autonomous, or multi-step agentic tasks when its value justifies its quota consumption; its results return to the Orchestrator without creating a second orchestration channel. For high-risk lots, the Orchestrator may request a second independent review or use Work proportionately to the risk. No additional application or multi-agent infrastructure is required.
2. The Orchestrator prepares a versioned `CODEX EXECUTION PACKAGE`. When the user personally pastes a standard package marked `READY_FOR_CODEX`, this approves only its bounded scope and expressly authorized operations. Indicative inspection surfaces grant no modification rights.
3. Codex reads the relevant sources and exposes a file-level plan before modification. For a standard plan strictly within that package, proceed without a second approval. Without such authorization, obtain explicit plan approval before editing. Stop and report a consolidated issue to the Orchestrator if necessary work exceeds scope.
4. Substantive changes to contracts, economic rules, custody/accounting, security/governance, dependencies, CI, sensitive manifests/configurations, deployments, or public transactions retain an explicit, motivated intermediate approval point. Classify by actual effect, not file extension; the package identifies the decision and stopping point.
5. Implement only authorized changes, inspect the actual diff, and record validation evidence. Use existing CI for the checks it covers; do not ask the user to repeat reliable checks for the relevant revision and configuration. Required evidence missing from CI still needs appropriate validation.
6. If authorized, deliver through the GitHub PR as the handoff artifact and shared state. The Orchestrator directly inspects GitHub to review the real diff, tests, CI, package compliance, and invariants against the examined HEAD and base, then returns `PASS` or `FAIL`. Missing blocking evidence prevents `PASS`; failures receive one consolidated `CODEX CORRECTION PACKAGE` on the same branch/PR.
7. A new commit requires review of additional changes and updated CI evidence; a changed base requires a new merge-compatibility check. After required CI is green, the Orchestrator returns `PASS`, and blockers are cleared, the Orchestrator requests the user's final explicit merge authorization for the PR and HEAD. `PASS` never authorizes merge. Important product and architecture decisions remain with the user.

A workflow migration never grants itself the permissions it documents. Its existing lot restrictions remain binding until integration.

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
