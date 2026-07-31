# Publishing the Existing BidBack Repository

BidBack already uses the `VicomteBdV/BidBack` repository. This guide covers synchronizing and publishing approved changes; it does not initialize or replace repository history. The full approval and validation sequence is defined in [`docs/CODEX_WORKFLOW.md`](docs/CODEX_WORKFLOW.md).

## Branch and Validation Policy

- Keep `main` protected and use a narrowly scoped branch for changes that require review or remote validation.
- Documentation or frontend changes may be prepared in the native Windows checkout, then validated with the manual commands approved for the lot.
- Foundry/Anvil changes are validated in GitHub Codespaces. A temporary validation branch is created and pushed only after explicit approval.
- Merge into `main` only after required manual validation, green required CI checks, review, and explicit approval.
- Treat CI status as evidence for a particular commit and date, not a permanent repository guarantee.

Useful compact checks from the repository root:

```powershell
git status --short
git --no-pager diff --stat
git --no-pager diff
git --no-pager diff --cached
```

Codespaces installs Foundry through `.devcontainer/install-foundry.sh`. For a contract-related lot, the usual manual validation includes:

```bash
forge test -vv
```

Use the additional frontend checks or lifecycle command specified by the approved lot. Do not substitute a local Anvil result for the incomplete public Base Sepolia multi-wallet smoke test.

## Precise Staging and Publication

After validation succeeds, stage only the approved files by exact path:

```powershell
git add -- <approved-path-1> <approved-path-2>
git status --short
git --no-pager diff --cached
```

Do not use `git add .` in a dirty or mixed-scope worktree, and do not use `git add -f` to bypass ignore policy. Confirm the staged diff before an authorized commit. Push only the approved branch, then wait for required CI and review before merging through the repository's protected-branch workflow.

Commit messages should describe the approved lot, not unrelated workspace state. Never force-push, rewrite history, merge, or delete a branch without the corresponding authorization.

## Artifacts and Secrets

Do not publish:

```text
broadcast/
cache/
out/
.next/
node_modules/
frontend/.env.local
generated local deployment data for chain 31337 under the current policy
```

Never commit private keys, mnemonics, funded-wallet credentials, RPC secrets, or populated environment files. If a legitimate source file is incorrectly ignored, correct `.gitignore` in an approved change instead of forcing it into Git.

Before publication, confirm that the staged file list matches the approved scope, manual validation results are recorded, required CI is green for the exact commit, and no generated artifact or secret is present.
