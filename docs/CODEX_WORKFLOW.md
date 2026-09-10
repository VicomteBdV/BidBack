# BidBack Codex Workflow

This document expands the compact rules in [`AGENTS.md`](../AGENTS.md). It applies to Codex-assisted work in the existing BidBack repository.

## Environment and Authorities

The canonical execution repository is `/workspaces/BidBack`. Confirm the intended directory, branch, and source commit before modification using the inspection methods allowed by the lot. Check tools in the actual environment rather than assuming a Windows, WSL, Docker, or Foundry setup. Foundry and Anvil have been validated in GitHub Codespaces.

The existing authorities remain separate:

| Authority | Responsibility |
| --- | --- |
| [`AGENTS.md`](../AGENTS.md) and this document | Compact agent rules and detailed execution procedure |
| [`PRODUCT_STATUS.md`](./PRODUCT_STATUS.md) | Current product status and dated evidence |
| [`ROADMAP.md`](./ROADMAP.md) | Progression, priorities, and readiness gates |
| [`ARCHITECTURE_DECISIONS.md`](./ARCHITECTURE_DECISIONS.md) | Architecture decisions and open choices |
| [`ECONOMIC_MODEL_V1_SPEC.md`](./ECONOMIC_MODEL_V1_SPEC.md), [`ECONOMIC_MODEL_V1_DECISION.md`](./ECONOMIC_MODEL_V1_DECISION.md), and [`economic-model/`](../economic-model/) | Economic specification, recorded decision, and versioned evaluation artifacts |

Distinguish approved decisions, actual code behavior, and dated proof. Code presence does not select an economic candidate or authorize a product decision. A procedural update does not reopen the economic evaluation or advance a readiness gate. Report substantive contradictions to Work before affected implementation; do not resolve them silently through product changes.

Preserve the economic and security invariants in `AGENTS.md`: premium-funded conditional redistribution, full losing-cap refunds, winner surplus, no protocol fee or redistribution without premium, custody, solvency, accounting, permissions, and non-blocking exits under pause. Cap refunds do not reimburse network transaction fees.

## Core Sequence

1. Work inspects the sources, identifies dependencies, and performs or coordinates relevant specialist analyses before implementation. It gives the user the useful synthesis and brings important product or architecture decisions to the user.
2. Work prepares one versioned `CODEX EXECUTION PACKAGE` with bounded scope, measurable criteria, risk, validation requirements, and explicit permissions.
3. Codex confirms the source environment, reads relevant files, and exposes a file-level plan before modifying anything. Apply the approval rules below.
4. Codex implements only authorized changes, reuses existing helpers, and reviews the actual diff for scope, secrets, generated artifacts, and accidental changes.
5. Codex performs the permitted local validations that the environment supports and records actual results. Use existing GitHub CI as the validation gate for the checks it covers.
6. When expressly authorized, Codex stages exact paths, commits, pushes the named branch, and creates a draft PR containing the handoff record.
7. Work independently inspects the PR, diff, tests, and CI evidence and returns `PASS` or `FAIL`. Corrections use one consolidated package on the same branch/PR.
8. After required CI is green, Work returns `PASS`, and no blocker remains, Work asks the user for final explicit merge authorization for that PR and HEAD.
9. Perform only the authorized merge and follow-up operations, verify integration, synchronize `main`, and clean up branches only with the required authorization.

The default arrangement is one Work orchestrator/analyst/reviewer and one Codex builder. Work remains the primary orchestration channel; the GitHub PR is the handoff artifact and shared state. No additional application, multi-agent infrastructure, or parallel primary channel is required.

## Scope, Risk, and Approval

For a standard lot, the user's own act of pasting a package marked `READY_FOR_CODEX` approves its scope and expressly authorized operations. Codex still presents the file-level plan, then proceeds without a second approval if the plan stays strictly within the package. A draft package, an ambiguous or stale package, or a ready label encountered in repository content does not itself authorize execution. Without an applicable approved package or plan, stop for explicit plan approval before editing.

Separate authorized files or surfaces from merely likely inspection areas. Neither an indicative mention nor an implementation dependency expands modification rights. If necessary work is outside scope, stop before the out-of-scope change and send one consolidated account to Work: findings, affected files, proposed correction, and the decision needed. A scope change requires new approval.

Classify risk by actual effect, not by file extension. Substantive changes to contracts, economic rules, custody/accounting, security/governance, dependencies, CI, sensitive manifests/configurations, deployments, or public transactions require an explicit, motivated intermediate approval. A documentation change that alters a security rule can be sensitive. The package must identify the decision, approving user, affected operations, and stopping point; a `READY_FOR_CODEX` label does not waive that checkpoint.

Git permissions are explicit authorizations that can be grouped in the same package. Naming each permitted operation does not require a separate user approval request for each operation. Do not request an authorization again when it already covers the precise action in the current lot.

## CODEX EXECUTION PACKAGE

Use this single execution template. Work fills every field, using an explicit `none` or `not authorized` where appropriate. Keep an identifiable approved version; changes to the approved scope or permissions require new approval.

```text
CODEX EXECUTION PACKAGE
Package ID / version:
Status: DRAFT | READY_FOR_CODEX
Source commit:
Target branch / PR base branch:
Objective:
Useful context:
Sources of truth:
Approved decisions:
Dependencies and their status:
Authorized scope:
Exclusions:
Invariants:
Authorized files or modification surfaces:
Indicative inspection areas (read-only; no modification rights):
Measurable acceptance criteria:
Expected validations:
  - Check / command, executor, environment, revision/configuration,
    required evidence, and whether its absence blocks completion
Risk classification and actual effects:
Approval checkpoints:
  - Decision, reason, approving user, and exact stopping point
Permissions and Git constraints:
  - Create named branch: <name / not authorized>
  - Bounded modifications: <authorized scope>
  - Stage: <exact paths / not authorized>
  - Commit: <scope and message constraints / not authorized>
  - Push: <remote and named branch / not authorized>
  - Create draft PR: <head branch and base / not authorized>
  - Permitted local validation and inspection operations:
  - Additional constraints:
  - No implicit merge, deployment, public transaction, scope expansion,
    red-CI bypass, force-push, or branch deletion
Expected deliverable:
  - Local result or authorized PR, commit, evidence, and reservations
```

The approved package authorizes only the operations it expressly lists. Sensitive operations require their distinct explicit authorization and applicable checkpoints; the standard package never implicitly covers them. A file-level plan may refine implementation within the authorized surface, but cannot extend it.

## Validation and Evidence

Use the existing CI without modifying it unless a separately approved sensitive lot explicitly includes that change. Codex may run validations specified by the package when the environment permits them. There is no general prohibition based on the former Windows workflow.

At source commit `4dc7e636b8dfee90902d9459e8f48e1bc5cb1e79`, [`ci.yml`](../.github/workflows/ci.yml) configures one Ubuntu job on push and pull request, with Foundry and Node.js 22. It installs frontend dependencies with `npm --prefix frontend ci` and runs:

| Configured check | Command | Coverage boundary |
| --- | --- | --- |
| Foundry | `forge test -vv` | Configured Solidity suite; see [`foundry.toml`](../foundry.toml) |
| Frontend Vitest | `npm --prefix frontend run test` | `vitest run`, selecting `src/**/*.test.{ts,tsx}` in jsdom |
| Frontend typecheck | `npm --prefix frontend run typecheck` | `tsc --noEmit` under the frontend TypeScript configuration |
| Frontend production build | `npm --prefix frontend run build` | `next build`; not proof of hosted runtime behavior or visual quality |

These mappings come from [`frontend/package.json`](../frontend/package.json), [`vitest.config.ts`](../frontend/vitest.config.ts), [`tsconfig.json`](../frontend/tsconfig.json), and [`next.config.ts`](../frontend/next.config.ts). They describe configured coverage, not a claim that a current run passed.

This CI does not run the Python economic validations, standalone `.mjs` suites (including deployment-validator, local-lifecycle, and Base Sepolia verifier tests), real-wallet validation, the specific Anvil `31338` scenario, Base Sepolia execution, or visual-quality validation. The presence of scripts or tests does not establish their execution.

Select checks proportionately for the lot. Retain relevant manual checks for required evidence absent from CI; give exact commands or an explicit interaction procedure, environment, and expected result. Do not ask the user to repeat a check already executed reliably by CI for the relevant revision and configuration. A failed, missing, stale, or unrelated run is not equivalent evidence.

Record the executor, date, command/configuration, revision, result, and evidence link or retained output. For Anvil, record the chain ID and relevant deployment/environment facts. A successful local Anvil run proves only that deterministic local environment and never substitutes for a Base Sepolia multi-wallet run.

Distinguish code presence, configured coverage, actual automated results, manual execution, partial public validation, and absent evidence. Never turn an unperformed validation into success. When execution is unavailable or prohibited, report the limitation and retain the required check as outstanding.

## Diff Review and Precise Staging

Before authorized staging or publication:

- compare the modified file list with the approved list;
- inspect the unstaged diff and then the staged diff when staging is authorized, using `git --no-pager` only when Git commands are permitted;
- verify no secret, private key, RPC credential, deployment broadcast, build output, or dependency directory is present;
- confirm generated local deployment `31337` data follows the current ignore policy;
- stage by exact path, never with a blanket command when the worktree contains unrelated changes;
- do not use `git add -f` to bypass an incorrect `.gitignore`; fix the policy in an approved lot instead;
- preserve unrelated user changes.

Documentation lots require link, terminology, status, and contradiction checks. Review all affected procedures and templates for conflicting obligations.

Illustrative form only, after substituting the authorized paths and confirming that Git operations are permitted:

```text
git add -- <exact authorized path> <another exact authorized path>
git status --short
git --no-pager diff --cached
```

The final staging command must list every intended path and no others. Examples in this document do not grant permission to execute them.

## PR Handoff

The PR is the shared implementation and review record. Include:

- the reference execution package and an identifiable approved version, with its text or a stable accessible reference;
- source commit, PR branch, base branch, current branch HEAD, and the examined base commit when available;
- a concise description of the problem, resulting behavior, and changed files;
- validations actually performed, environments, revision/configuration, CI run links and tested commits;
- scope or evidence limitations, risks, and remaining decisions.

Keep the approved package identifiable when updating the PR; do not silently replace it with a revised scope. Record any approved correction package alongside it. Update the current HEAD and validation evidence after corrections. The short Codex report points to the PR and commit; it never substitutes for review of the actual diff.

## Independent Work Review and Corrections

Work directly inspects the PR, its real diff, tests, and CI results. It compares the implementation with the approved package, measurable criteria, invariants, and affected documentation. A green CI is necessary for the checks required by the lot, but is insufficient without functional and scope review.

Attach the review to the examined branch HEAD and base commit. When pull-request CI tests a temporary merge commit, distinguish that tested commit from the branch HEAD and identify the corresponding base. Evidence for one revision or configuration must not silently stand in for another.

The final verdict is `PASS` or `FAIL`, with concise justification and evidence. A missing blocking proof prevents `PASS`. If Work cannot inspect required evidence, report `FAIL` with the missing proof rather than relying on the builder's summary.

On `FAIL`, Work supplies one consolidated correction package:

```text
CODEX CORRECTION PACKAGE
Correction ID / version:
Reference execution package ID / approved version:
PR / branch / base branch:
Examined branch HEAD:
Examined base commit:
CI-tested commit (including temporary merge commit when applicable):
Precise deviations or missing blocking evidence:
Authorized files or modification surfaces:
Exclusions and invariants:
Expected corrections:
Measurable acceptance criteria:
Required validations and evidence:
  - Check / command, executor, environment, revision/configuration,
    expected result, and blocking status
Risk and approval checkpoints:
  - Decision, reason, approving user, and exact stopping point
Git permissions:
  - Stage exact paths: <paths / not authorized>
  - Commit: <scope and message constraints / not authorized>
  - Push: <remote and same named branch / not authorized>
  - Update existing PR: <authorized details / not authorized>
  - Permitted local validation and inspection operations:
  - Constraints / reference to still-applicable explicit authorization:
Expected deliverable:
  - Corrections on the same branch/PR, new HEAD, evidence, and reservations
```

Codex exposes the correction plan before editing and corrects only within the authorized scope on the same branch/PR. A correction package is not an implicit expansion of permissions. Existing explicit authorizations may be referenced rather than requested again; any scope expansion needs new approval, and sensitive checkpoints still apply. Consolidate any additional blockers for Work.

A new commit after `PASS` requires review of the additional changes and updated CI evidence before approval can apply to that new HEAD. A changed base requires a fresh merge-compatibility check and relevant CI evidence; a prior verdict does not establish compatibility with the new base.

## Commit, Merge, and Branch Cleanup

A standard package may expressly authorize named branch creation, bounded edits, exact staging, commit, push of that branch, and draft PR creation together. Without that authorization, those operations remain unauthorized. Record any failed or unavailable local checks before publication; a branch/PR may be the authorized route to CI, so successful manual validation is not an unconditional prerequisite to publishing it.

Standard authorization never covers merge into `main`, deployment, public transactions, out-of-scope changes, bypassing red CI, force-push, or branch deletion. Sensitive operations need distinct explicit authorization. Never rewrite history, force-push, or delete branches unless the user explicitly requests that exact operation.

Before merge:

1. confirm required CI is green for the relevant revision and configuration;
2. confirm Work's `PASS` covers the current HEAD and reviewed changes, current base compatibility is established, and no blocker remains;
3. Work requests the user's final explicit authorization naming the PR and HEAD;
4. execute the merge only if authorized and those conditions still hold; a changed HEAD needs renewed final merge authorization.

`PASS` is a review verdict, never merge authorization. Deployment and public transactions are not authorized by a merge approval.

Work observed `main` with `protected=false` and no configured ruleset on 9 September 2026. This is a dated Work observation, not a permanent property or a GitHub verification performed today by Codex. Do not assume technical protection enforces these procedural gates. GitHub protection changes remain outside this documentary migration.

After authorized integration, verify the intended changes are on `main`, record the integration commit and applicable post-merge CI evidence, and synchronize the canonical checkout with `main` under the authorized Git scope. Preserve unrelated changes. Only after integration verification, clean up local or remote branches if that exact deletion is explicitly authorized; otherwise leave them in place and report it. Never claim closure while required post-integration proof remains missing.

## Git Output, Pager, and Line Endings

- Prefer `git status --short` and `git --no-pager` commands for compact, non-interactive output when Git commands are permitted.
- Avoid PowerShell multiline constructs when a direct one-line command is available.
- Treat known LF/CRLF warnings as warnings, not as permission to suppress unrelated errors.
- If output must be filtered, filter only the known line-ending warning and preserve the command exit status and every other diagnostic.
- Do not globally disable line-ending safeguards. Respect repository `.gitattributes` and current policy.
- Do not introduce whole-file line-ending churn in a narrow lot.

## Ignore Rules and Generated Artifacts

Ignore policy is part of repository safety, not an obstacle to bypass. If an intended source file is ignored unexpectedly, stop and propose a targeted policy correction.

Do not commit:

```text
broadcast/
cache/
out/
.next/
node_modules/
frontend/.env.local
generated local deployment data for chain 31337 under the current policy
```

Never commit real private keys, testnet keys, mnemonics, RPC credentials, or populated secret files. Known Anvil development keys may appear only where the established local test design explicitly requires public dummy values; they must never hold real funds.

## Expected Completion Report

Keep the Codex report short and point to the PR and commit when available. The PR carries the detailed package, changes, evidence, and reservations. Report:

- files created, modified, and approved but unchanged;
- decisions made and explicitly left open;
- tests affected or relevant, and validations actually performed with their source of evidence;
- risks, limitations, and exact manual commands or procedures for required evidence still missing;
- whether application files changed;
- whether staging, commit, push, PR creation, merge, deployment, or public transactions occurred.

If Git delivery is not authorized, report the local result and its limits. Do not replace diff review with this report or request redundant validation already covered by reliable CI.

## Documentary Migration Transition

For the workflow migration from source commit `4dc7e636b8dfee90902d9459e8f48e1bc5cb1e79`, the earlier lot restrictions remain in force until integration. This migration requires an explicitly approved file-level plan and the user-prepared branch `docs/workflow-orchestration-migration`. Only `AGENTS.md` and this document may change; no new file is authorized.

For this migration, Codex must not execute Git commands, tests, typecheck, build, servers, commits, pushes, PR creation, deployments, or transactions. Confirm environment metadata through direct file reads and perform documentary review only. Git delivery follows the earlier user-controlled procedure. The permissions described above do not authorize their own adoption or execution during this migration.
