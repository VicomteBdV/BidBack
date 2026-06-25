# AGENTS.md

## Project context

This repository contains a Web3 auction application.

The goal is to build a simple MVP first, then improve it progressively.

The project must be developed incrementally, with small, reviewable changes.

Codex must always inspect the existing repository before proposing or implementing changes.

## Product vision

The application allows users to participate in crypto / Web3 auctions.

The target logic is:

- users connect with a wallet;
- users can view available auctions;
- users can place bids;
- the winner receives the auctioned asset;
- part of the auction value may be redistributed according to explicit business rules;
- the application must remain transparent, auditable, and understandable.

The detailed product rules must be documented in the repository before implementation.

## Main priority

Build a simple MVP first.

Do not try to build the full final product immediately.

Prefer mock data and simple screens before implementing complex blockchain logic.

## Working rules

- Read the existing files before doing any work.
- Do not invent business rules.
- Do not invent smart contract logic without explicit validation.
- If a functional rule is unclear, ask a question before implementing it.
- Make small, incremental changes.
- Avoid large rewrites unless explicitly requested.
- Do not modify unrelated files.
- Do not add major dependencies without explaining why.
- Keep the implementation simple and maintainable.
- Prefer clear code over clever code.
- Explain assumptions and limitations clearly.

## Web3 security rules

- Never store private keys in the repository.
- Never store seed phrases in the repository.
- Never hardcode wallet secrets, API keys, or credentials.
- Do not implement real-money flows without explicit validation.
- Do not deploy smart contracts without explicit validation.
- Treat auction, bidding, escrow, and reward logic as sensitive.
- Any smart contract or financial logic must be simple, documented, and reviewable.

## Development approach

For each task, Codex must follow this sequence:

1. Read the relevant files.
2. Summarize the current state.
3. Propose a short implementation plan.
4. Implement only the requested step.
5. List the modified files.
6. Explain what changed.
7. Mention any risk, missing information, or assumption.

## MVP approach

The MVP should be built in phases:

1. Static product definition and README.
2. Basic web app skeleton.
3. Home page with mock auctions.
4. Auction detail page with mock bidding interface.
5. Simulated wallet connection.
6. Simulated bid flow.
7. Simulated reward / redistribution logic.
8. Only later: real wallet and blockchain integration.
9. Only later: smart contracts.
10. Only later: deployment.

## Definition of done

A task is complete only when:

- the requested behavior is implemented;
- the change is limited to the task;
- the code remains readable;
- existing behavior is not broken;
- modified files are listed;
- assumptions are documented;
- next recommended step is clearly stated.

## Forbidden behaviors

Codex must not:

- code the full application in one step;
- introduce complex architecture prematurely;
- add smart contracts before the MVP screens are clear;
- add blockchain dependencies before they are needed;
- invent legal, financial, or tokenomics rules;
- push changes without explaining what changed;
- hide uncertainty.