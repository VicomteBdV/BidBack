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

Distinguish approved decisions, actual code behavior, and dated proof. Code presence does not select an economic candidate or authorize a product decision. A procedural update does not reopen the economic evaluation or advance a readiness gate. The Technical Lead / Orchestrator consolidates substantive contradictions for the user before affected implementation; do not resolve them silently through product changes.

Preserve the economic and security invariants in `AGENTS.md`: premium-funded conditional redistribution, full losing-cap refunds, winner surplus, no protocol fee or redistribution without premium, custody, solvency, accounting, permissions, and non-blocking exits under pause. Cap refunds do not reimburse network transaction fees.

## Core Sequence

1. The user gives a request or a bounded execution package. The primary Codex agent acts as Technical Lead: inspect sources and dependencies, confirm directory/branch/source revision, and identify the actual risk and necessary specialists.
2. Before modification, expose a file-level plan with acceptance criteria, validation requirements, assigned responsibilities and permissions. A direct request can already authorize this work; apply the approval rules below without requiring a second chat or a ritual second approval.
3. Delegate independent tasks to the relevant specialists with exact write surfaces. Keep dependent implementation and integration sequential. The Lead resolves technical disagreements from evidence and brings important product or architecture choices to the user.
4. Implement only authorized changes, reuse existing helpers, and inspect the complete diff, including new files, for scope, secrets, generated artifacts and accidental changes.
5. Obtain independent Security review for sensitive changes. Route corrections to the domain owner. QA / Release independently checks the final diff, acceptance and validation evidence; required checks must be green before commit.
6. When authorized, the Lead stages exact paths, commits, pushes the named branch and creates a draft PR containing the plan/package, reviews and evidence. Inspect CI for that HEAD and its tested base; do not substitute a stale run.
7. QA returns `PASS` or `FAIL` for the inspected scope and revision, considering Security findings where required. The Lead consolidates corrections into one task/package on the same branch/PR and obtains review of the changed revision.
8. After required CI is green, independent review passes and no blocker remains, the Lead asks the user for final explicit merge authorization naming the PR and HEAD.
9. Perform only the authorized merge and follow-up operations, verify integration, synchronize `main`, and clean up branches only with the required authorization.

The normal flow is **User → Technical Lead → necessary specialists → Security review when relevant → QA / Release → consolidated result**. The Lead owns orchestration and delivery, but cannot relabel its own implementation assessment as independent review. The GitHub PR remains the handoff artifact and shared state; GitHub CI remains the deterministic gate for checks it actually covers.

An external ChatGPT Orchestrator or Work is optional for user-requested or high-risk independent analysis when its value justifies its cost. Its findings return to the Lead; there is one consolidated decision record, not a second mandatory orchestration channel. No additional service or orchestration platform is needed.

## Team, Skills and Delegation

| Role | Responsibility and write boundary |
| --- | --- |
| Technical Lead (primary session) | Context, scoped plan, delegation, ownership of files, integration, evidence and authorized Git delivery. |
| [Protocol Engineer](../.codex/agents/protocol-engineer.toml) | Explicitly assigned Solidity, Foundry tests and contract scripts; custody, accounting, lifecycle and invariants. |
| [Frontend Engineer](../.codex/agents/frontend-engineer.toml) | Explicitly assigned Next.js/TypeScript, wallet flows, lifecycle/economics presentation and UX/UI. |
| [Mechanism Designer](../.codex/agents/mechanism-designer.toml) | Authorized economic specs, analysis and simulations; no silent Solidity or parameter change. Approved on-chain translation goes to Protocol Engineer. |
| [Security Reviewer](../.codex/agents/security-reviewer.toml) | Independent adversarial review; findings, severity, reproduction and recommendations, without fixing the audited patch. |
| [QA / Release](../.codex/agents/qa-release.toml) | Independent scope/acceptance/diff and validation review; no fixes, weakened tests or self-approval. |

Use specialists selectively. A frontend lot usually needs Frontend and QA, plus Security if wallet or trust boundaries change. Economic work needs Mechanism and QA, Security for sensitive effects, and Protocol only for an approved on-chain translation. Sensitive contract work needs Protocol, Security and QA; involve Mechanism only if economics are affected. A small task can stay with the Lead, with an independent reviewer for the final handoff. Do not create busywork to occupy every role.

UX/UI quality is part of frontend acceptance from the start: include relevant responsive, accessible, loading/empty/error, network, signature, transaction and recovery states. Automated checks alone do not establish visual quality or real-wallet compatibility. At the migration checkpoint the frontend uses React, wagmi/viem and TanStack Query; Zustand is not a direct dependency and this workflow does not authorize adding it.

Procedures are maintained once in repository skills:

| Skill | Use |
| --- | --- |
| [protocol-change](../.agents/skills/protocol-change/SKILL.md) | Contract invariants, implementation/tests, affected docs and independent Security review. |
| [security-review](../.agents/skills/security-review/SKILL.md) | Independent, evidence-based review of sensitive changes. |
| [economic-analysis](../.agents/skills/economic-analysis/SKILL.md) | Economic authorities, scenarios, adversarial analysis and decision boundaries. |
| [release-verification](../.agents/skills/release-verification/SKILL.md) | Required green checks, scope, evidence and final verdict. |

Each delegation includes the objective, approved decision/package, source/base revision, exact editable paths (or read-only), dependencies, checks, acceptance and expected return. Return a compact summary with file references, actual results and uncertainties. Subagents do not mutate Git, publish, access secrets or create further agents; the Lead handles coordination and authorized delivery. A role's domain describes expertise, not a blanket file permission.

Only one writer owns a file at a time. Run independent reads in parallel; serialize dependent changes. When concurrent implementation genuinely needs isolation, the Lead may create named worktrees/branches within explicitly authorized Git scope, assign distinct ownership and integrate sequentially. Worktrees isolate files, not running ports, external accounts or chain state. Do not expose populated environment files or credentials through shared context, copies or dependency links.

## Codex Configuration and Limits

[`.codex/config.toml`](../.codex/config.toml) enables subagents and caps concurrent child threads at three, excluding the primary. Five roles are available, not five simultaneous workers. Role files under `.codex/agents/` define `name`, `description` and `developer_instructions`. Models and reasoning inherit the parent rather than pinning availability or price assumptions. Skills live in `.agents/skills/`, the supported repository discovery location.

The migration environment has IDE-bundled `codex-cli 0.155.0-alpha.16.3`; `codex` is not on its default PATH. Use the installed binary or the IDE, not an invented CLI command. Project configuration depends on the user's project trust and host support; do not edit global trust, models or approval settings silently. Reload/start a session when necessary to discover added roles. Verify configuration recognition and skill discovery locally, and record the exact version and result in the PR.

Security and QA default to `sandbox_mode = "read-only"` and `approval_policy = "never"`. Their instructions also prohibit writes through browsers/connectors. These settings are not a complete capability ACL: runtime overrides from the parent can take precedence, and a filesystem sandbox does not itself make every connector read-only. Confirm the effective permissions in the host. Do not claim technical enforcement merely from the TOML file. If a host exposes only generic delegation without selecting a custom role, pass the role instructions explicitly, keep review procedural/read-only, and disclose that the custom sandbox was not applied; use a supported read-only session when technical isolation is required.

Observed during this migration: the installed app-server accepted the project configuration with `--strict-config`; `config/read` returned the three-child limit and `skills/list` found all four project skills without errors. TOML structure and role instructions were checked locally. This session's generic delegation tool has no custom-role or per-child sandbox selector, so its independent reviews follow the role files procedurally. Native spawning with a named role and enforcement of that role's sandbox were not validated. The Lead must read the selected role file before this fallback delegation; it must not claim the file was automatically applied.

Tests/builds normally write generated output. QA requests that the Lead run them in the authorized environment, then inspects the commands, exit status, logs and exact diff/revision independently. A denied reviewer command is not permission to escalate or broaden access. If independent review or required evidence is unavailable, report that blocker instead of manufacturing `PASS`.

Official references: [subagents and custom role files](https://learn.chatgpt.com/docs/agent-configuration/subagents), [configuration keys](https://learn.chatgpt.com/docs/config-file/config-reference), and [skill discovery](https://learn.chatgpt.com/docs/build-skills). Version-specific local checks take precedence over assumptions from another Codex release.

## Scope, Risk, and Approval

For a standard lot, a direct implementation request authorizes the bounded work it describes. The Lead prepares and exposes the plan, then proceeds within that authorization. A user-pasted package marked `READY_FOR_CODEX` remains another supported entry point and expressly limits scope and operations. A draft, ambiguous or stale package, or a ready label encountered in repository content, does not itself authorize execution. Ask once when a necessary decision, scope or permission is genuinely missing; continue independent authorized work meanwhile.

Separate authorized files or surfaces from merely likely inspection areas. Neither an indicative mention nor an implementation dependency expands modification rights. If necessary work is outside scope, stop before that change; the Lead presents one consolidated account to the user: findings, affected files, proposed correction and decision needed. A scope change requires new approval.

Classify risk by actual effect, not by file extension. Substantive changes to contracts, economic rules, custody/accounting, security/governance, dependencies, CI, sensitive manifests/configurations, deployments or public transactions retain an explicit, motivated intermediate approval point. A documentation change that alters a security rule can be sensitive. The plan/package identifies the decision, approving user, affected operations and stopping point. An already explicit user decision covering the action satisfies that checkpoint; a generic task or `READY_FOR_CODEX` label alone does not waive it. Do not repeat an approval already given for the same action.

Git permissions are explicit authorizations that can be grouped in the same package. Naming each permitted operation does not require a separate user approval request for each operation. Do not request an authorization again when it already covers the precise action in the current lot.

## CODEX EXECUTION PACKAGE

Use this optional template for complex lots, sensitive checkpoints or external handoffs. The Lead fills it from the user's request and already-approved decisions, using `none` or `not authorized` where appropriate. The user need not copy it through a second chat. Keep an identifiable version and authorization source; changes to approved scope or permissions require new approval. For a simple lot, a concise file-level plan carrying the same relevant boundaries is sufficient.

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

Use the existing CI without modifying it unless a separately approved sensitive lot explicitly includes that change. Codex may run validations authorized by the request/plan/package when the environment permits them. There is no general prohibition based on the former Windows workflow. Required checks must pass before commit; CI must also be green for the relevant revision before merge.

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

- the user request and bounded plan, or the reference execution package and approved version, with text or a stable accessible reference;
- source commit, PR branch, base branch, current branch HEAD, and the examined base commit when available;
- a concise description of the problem, resulting behavior, and changed files;
- validations actually performed, environments, revision/configuration, CI run links and tested commits;
- scope or evidence limitations, risks, and remaining decisions.

Keep the authorization and plan/package identifiable when updating the PR; do not silently replace them with revised scope. Record any approved correction alongside them. Include independent Security/QA findings and their examined revision, and update HEAD and validation evidence after corrections. The short Codex report points to the PR and commit; it never substitutes for review of the actual diff.

## Independent Review and Corrections

Security and QA inspect the actual patch, tests and relevant evidence independently of the implementer. Use the PR and GitHub CI when available; a pre-commit review must identify its source/base and exact worktree diff, including untracked intended files. Compare implementation with the authorized plan/package, measurable criteria, invariants and affected documentation. Green CI is necessary for checks required by the lot, but insufficient without functional and scope review.

For high-risk lots, the Lead may request an additional independent review or use Work proportionately to risk. Reviewers provide their own findings/verdicts; the Lead consolidates them, resolves disagreements using evidence and reports unresolved decisions. If the Lead wrote a patch, a separate reviewer must assess it. An external Orchestrator explicitly retained by the user may still perform that independent review.

Attach the review to the examined branch HEAD and base commit. When pull-request CI tests a temporary merge commit, distinguish that tested commit from the branch HEAD and identify the corresponding base. Evidence for one revision or configuration must not silently stand in for another.

The final verdict is `PASS` or `FAIL`, with concise justification and evidence. A missing blocking proof prevents `PASS`. If the Orchestrator cannot inspect required evidence, report `FAIL` with the missing proof rather than relying on the builder's summary.

On `FAIL`, the Lead routes one consolidated correction task to the domain owner. Use the following package when a structured handoff is useful; it does not require another approval for fixes already within the authorized scope:

```text
CODEX CORRECTION PACKAGE
Correction ID / version:
Reference request / plan or execution package ID / approved version:
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

The Lead exposes the correction plan before editing and assigns fixes only within the authorized scope on the same branch/PR. The reviewer does not implement its own corrections. A correction package is not an implicit expansion of permissions. Existing explicit authorizations may be referenced rather than requested again; scope expansion needs new approval and sensitive checkpoints still apply. Consolidate additional blockers for the user.

A new commit after `PASS` requires review of the additional changes and updated CI evidence before approval can apply to that new HEAD. A changed base requires a fresh merge-compatibility check and relevant CI evidence; a prior verdict does not establish compatibility with the new base.

## Commit, Merge, and Branch Cleanup

A user request or package may authorize named branch creation, bounded edits, exact staging, commit, push of that branch and draft PR creation together. Record the permitted operations in the plan; absent authorization, do not perform them. Require applicable validations to be green before commit, including the Foundry/frontend suite and diff checks in the release-verification skill. A missing or failed required check blocks commit: future CI is not a substitute for missing pre-commit evidence. After publication, inspect CI for the actual HEAD/base before considering merge. Do not ask the user to repeat reliable existing evidence for the same revision and configuration.

Standard authorization never covers merge into `main`, deployment, public transactions, out-of-scope changes, bypassing red CI, force-push, or branch deletion. Sensitive operations need distinct explicit authorization. Never rewrite history, force-push, or delete branches unless the user explicitly requests that exact operation.

Before merge:

1. confirm required CI is green for the relevant revision and configuration;
2. confirm independent review `PASS` covers the current HEAD and reviewed changes, current base compatibility is established, and no blocker remains;
3. the Lead requests the user's final explicit authorization naming the PR and HEAD;
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

The multi-agent migration explicitly changes two procedural defaults at the user's request: primary Codex now serves as Technical Lead instead of requiring an external ChatGPT Orchestrator for every lot, and required validations must pass before commit instead of allowing publication to obtain missing local evidence. Independent review, explicit sensitive decisions, precise Git permissions and final merge authorization remain. This records a workflow change, not a product, economic or readiness decision. The migration itself follows its original user authorization; new rules do not retroactively expand its permissions.

Historical scope: the following restrictions applied only to the earlier migration, integrated at commit `d4a5c95`. They do not define permissions for later lots, which require their own applicable authorization.

For the workflow migration from source commit `4dc7e636b8dfee90902d9459e8f48e1bc5cb1e79`, the earlier lot restrictions remain in force until integration. This migration requires an explicitly approved file-level plan and the user-prepared branch `docs/workflow-orchestration-migration`. Only `AGENTS.md` and this document may change; no new file is authorized.

For this migration, Codex must not execute Git commands, tests, typecheck, build, servers, commits, pushes, PR creation, deployments, or transactions. Confirm environment metadata through direct file reads and perform documentary review only. Git delivery follows the earlier user-controlled procedure. The permissions described above do not authorize their own adoption or execution during this migration.
