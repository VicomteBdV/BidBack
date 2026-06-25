# Publishing

The local workspace is ready to become the `VicomteBdV/BidBack` repository.

Codespaces is the reference environment. After opening the repository in Codespaces, Foundry is installed automatically by `.devcontainer/install-foundry.sh`.

Run this check first:

```bash
forge test -vv
```

Then publish from the repository root:

```bash
git init
git branch -M main
git remote add origin https://github.com/VicomteBdV/BidBack.git
git add .
git commit -m "Initialize BidBack MVP contracts"
git push -u origin main
```

If the remote already has commits, pull or clone it first and merge this project structure into that checkout before committing.
