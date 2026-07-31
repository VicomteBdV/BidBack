# BidBack Codex Workflow

This document expands the compact rules in [`AGENTS.md`](../AGENTS.md). It applies to Codex-assisted work in the existing BidBack repository.

## Core Sequence

Every implementation lot follows this order:

1. Read `AGENTS.md` and the relevant current documentation.
2. Produce a plan only, including objective, scope, exclusions, acceptance criteria, and expected deliverable.
3. Wait for explicit plan approval.
4. Modify only the approved files.
5. Review the resulting diff for scope, secrets, generated artifacts, and accidental changes.
6. Provide manual validation commands; Codex does not execute validation in the current sandboxed Windows workflow.
7. Wait for the user's validation results and address failures in a separately approved continuation.
8. Only after successful validation, propose an exact staging list and optional commit steps.
9. Create no commit, merge, push, public transaction, or deployment without explicit authorization.

## Windows Workflow for Frontend or Documentation Lots

The native workspace is `C:\Users\Vibe\Code\BidBack` in VS Code. WSL, Docker, and local Foundry are not assumed.

1. Start from the intended branch and inspect compact repository status.
2. Agree the file-level scope before editing.
3. Keep documentation-only lots separate from application lots when practical.
4. Reuse existing components and helpers; do not introduce dependency, contract, CI, or configuration changes unless named in the approved plan.
5. Perform a file-by-file diff review. Documentation lots require link, terminology, status, and contradiction checks. Frontend lots require the manual typecheck, test, and build commands appropriate to the changed surface.
6. The user runs validation in an environment that supports it and returns the output.
7. After success, stage only the explicit files. Review the staged diff before any commit proposal.

Suggested compact inspection commands:

```powershell
git status --short
git --no-pager diff --stat
git --no-pager diff -- AGENTS.md README.md docs/
git --no-pager diff --cached --stat
git --no-pager diff --cached
```

Use single-line PowerShell commands where possible. Avoid fragile multiline quoting and pipelines that hide failures.

## Windows and Codespaces Workflow for Foundry or Anvil Lots

Foundry and Anvil validation is performed in GitHub Codespaces. The Windows checkout remains the editing and review workspace unless the approved lot says otherwise.

1. Complete the plan and explicit approval stages.
2. Implement locally without running sandbox validation.
3. Review the exact diff and ensure no generated Foundry, Anvil, frontend, deployment, or secret artifacts are included.
4. If remote validation requires a branch, ask for explicit approval before staging, committing, pushing, or creating it.
5. Create a narrowly named temporary validation branch only after approval.
6. Validate that exact branch in Codespaces with the manual commands supplied for the lot.
7. Record command results and relevant environment facts, including chain ID for Anvil scenarios.
8. Fix failures on the validation branch only within a newly approved scope.
9. Merge into `main` only after the required Codespaces validation and CI are successful and the user explicitly approves the merge.
10. Delete local and remote temporary branches only after merge verification and explicit approval where deletion is involved.

A successful local Anvil run proves only the deterministic local environment. It never substitutes for a Base Sepolia multi-wallet run.

## Validation Commands

Commands are selected per lot and supplied for the user to run. Typical commands include:

```powershell
git status --short
git --no-pager diff --check
```

```bash
forge test -vv
npm --prefix frontend run typecheck
npm --prefix frontend run test
npm --prefix frontend run build
```

Do not claim a command passed unless the user, CI, or a retained validation record confirms it. State dates for CI observations. Distinguish code presence, automated coverage, manual execution, partial public validation, and absent evidence.

## Diff Review and Precise Staging

Before proposing Git operations:

- compare the modified file list with the approved list;
- inspect both unstaged and staged diffs with `git --no-pager`;
- verify no secret, private key, RPC credential, deployment broadcast, build output, or dependency directory is present;
- confirm generated local deployment `31337` data follows the current ignore policy;
- stage by exact path, never with a blanket command when the worktree contains unrelated changes;
- do not use `git add -f` to bypass an incorrect `.gitignore`; fix the policy in an approved lot instead;
- preserve unrelated user changes.

Example form, with paths replaced by the approved list:

```powershell
git add -- AGENTS.md README.md docs/PRODUCT_STATUS.md docs/ROADMAP.md docs/CODEX_WORKFLOW.md
git status --short
git --no-pager diff --cached
```

The final staging command must list every intended path and no others.

## Commit, Merge, and Branch Cleanup

Commit and publication are separate approvals from implementation. After manual validation succeeds:

1. report validation evidence and remaining risks;
2. propose the exact stage list and commit message;
3. wait for authorization;
4. review the staged diff;
5. create the authorized commit only;
6. push only the named branch when authorized;
7. wait for required CI and review;
8. merge only with explicit approval and protected-branch rules satisfied;
9. verify `main` contains the intended commit before proposing branch deletion.

Never rewrite history, force-push, or delete branches unless the user explicitly requests that exact operation.

## Git Output, Pager, and Line Endings

- Prefer `git status --short` and `git --no-pager` commands for compact, non-interactive output.
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

The report must state:

- files created;
- files modified;
- approved files left unchanged;
- decisions made and explicitly left open;
- tests affected or relevant;
- tests and validations actually run, including who or what supplied the result;
- risks and limitations;
- exact manual validation commands;
- whether application files changed;
- whether a commit, push, deployment, or public transaction occurred.

## Short Prompt Templates

### Plan prompt

```text
Lis et respecte `AGENTS.md`.

Étape de plan uniquement. Ne modifie aucun fichier.

Objectif :
<objectif>

Périmètre :
<éléments inclus>

Exclusions spécifiques :
<éléments exclus>

Critères d’acceptation :
<résultats mesurables>

Attends ma validation explicite.
```

### Implementation prompt

```text
Lis et respecte `AGENTS.md`.

Le plan précédent est validé.

Implémente exactement le périmètre approuvé.
Ne lance aucune validation et ne crée aucun commit.

À la fin, fournis le compte rendu et les commandes de validation manuelle.
```

Every task-specific prompt must still state the objective, scope, exclusions specific to the lot, measurable acceptance criteria, and expected deliverable. The short implementation prompt inherits those details from the explicitly approved plan; if the plan is ambiguous or stale, stop and restate it before editing.
