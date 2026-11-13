# Controlled testnet Node hosting

This package runs the existing Next.js application on Node.js 22. It is restricted to Base Sepolia `84532`, with local-development actions disabled. The repository's `84532.json` still describes the historical deployment; packaging does not create a new amount-rank deployment or certify those addresses against the current source.

The server needs filesystem access, DNS and HTTP(S) for read models and NFT metadata. `frontend/next.config.ts` enables Next standalone output. The image includes the standalone server, static assets, public files, the historical testnet manifest and three dependency-free configuration guards. The official Node image is pinned by digest in `frontend/Dockerfile`.

## Build from a reviewed checkout

Use Docker BuildKit and the frontend directory as the build context:

```sh
docker build \
  -f frontend/Dockerfile \
  --build-arg NEXT_PUBLIC_WALLET_RPC_URL='<approved public HTTPS RPC URL>' \
  --build-arg NEXT_PUBLIC_CHAIN_NAME='Base Sepolia' \
  --build-arg NEXT_PUBLIC_BLOCK_EXPLORER_URL='<optional public explorer URL>' \
  -t bidback-controlled-testnet frontend
```

`NEXT_PUBLIC_CHAIN_ID` defaults to `84532` and must remain exactly that value. The other three build arguments are public browser configuration. Never put credentials, API secrets or signing material in any public argument or browser URL. Optional values preserve exact unset/empty semantics; use the values chosen for the build consistently.

The default-deny `.dockerignore` admits only necessary build inputs. Environment files, host dependencies, test outputs, Git/credential files and local `31337` deployment data are excluded. Do not copy `.env.example` or `.env.local` into a hosted application. Installation uses the existing lockfile without dependency updates.

Build installation, compilation, runtime assembly and cleanup share one builder step to bound intermediate disk use even with a VFS Docker storage driver. The final image runs as `node`; code, guards, stamp and manifest remain root-owned and readable, with only `/app/.next/cache` writable within the application directory.

For a managed Cloud proxy requiring a session CA, use a session-only Dockerfile adaptation and a BuildKit secret, following that environment's runtime instructions. Keep strict TLS verification enabled. Do not commit or copy a session certificate, proxy credential or environment file into the image.

## Start with server RPC configuration

```sh
docker run --rm \
  -p 127.0.0.1:3000:3000 \
  -e BIDBACK_RPC_URL='<approved server HTTPS RPC URL>' \
  bidback-controlled-testnet
```

The server RPC is runtime-only and is not a build argument or stamp field. No signing key is needed by the frontend. Omit every `ANVIL_DEV_*PRIVATE_KEY` variable, including empty values. Keep `BIDBACK_CHAIN_ID=84532` and `ENABLE_LOCAL_DEV_ACTIONS=false`. `PORT` defaults to `3000` and accepts only canonical integers from 1 through 65535.

The default command checks configuration before starting `server.js`. It requires:

- The existing offline controlled-testnet validation, plus the exact false local-action flag and absence of Anvil key variable names.
- Exactly four allowed public environment names, matching `hosted-testnet-build.json` byte for byte: chain ID, chain name, wallet RPC URL and explorer URL.
- The stamp's exact version-1 schema and the exact SHA256 of `public/deployments/84532.json` from the build.
- A valid port. Missing/malformed artifacts or any mismatch stop startup with fixed diagnostics containing field names only.

Changing public browser configuration or the deployment manifest requires a new build. Changing only the approved server RPC does not. The offline validator does not establish RPC availability, chain identity actually reached, historical-read capability, contract bytecode, ownership, module wiring or formula identity. Verify those separately for any real session.

## Validate the actual artifact

Before external hosting, retain the source tree, image ID, runtime versions, build inputs and actual command results. Check the actual non-root UID, file hashes, root-owned artifacts protected from runtime-user writes, writable cache and exclusion of environment/local-deployment/session-CA files. Run the guard tests on Node 22 in the image.

Exercise the default startup command with each public mismatch, unsafe chain/flag/key configuration, invalid port, missing/malformed stamp and changed manifest. Require failure before the server listens and no configuration values in diagnostics.

With a valid synthetic configuration, probe the pages, served manifest and RPC-failure behavior. All eight `/api/dev/*` POST routes and `/api/local-create-context` must return `404` before body parsing or a writer. This is a configuration boundary, not administrator authentication: the image filesystem, default command and deployment operator must remain trusted. An administrator can override an entrypoint or replace artifacts.

HTTP checks and a build do not establish browser visual quality, injected-wallet compatibility or a public-chain lifecycle. The image has no external-host access policy, monitoring, DNS/TLS service or operator account merely because it builds. No OCI image push or external hosting service is required to validate it locally.

The local 13 November 2026 validation used Node 22.23.5 and runtime UID1000. All 28 guard tests passed in the actual image. Fourteen unsafe startup cases failed before serving. Thirteen container-loopback HTTP requests passed, including the nine guarded routes returning404, the exact historical manifest and an unavailable-RPC response503 without the synthetic canary value. Network access was disabled for those HTTP probes; host port forwarding, public ingress, browsers and wallets were not validated. An independent build-context export excluded six synthetic environment/secret/local-deployment/test canaries while retaining the required inputs. The runtime image excludes the session CA and server RPC value.

## Before an amount-rank public repetition

Use a separately verified new testnet deployment matching the approved source, its captured parameters and reported formula identifiers. Retain exact source/runtime verification, roles, fee recipient, module wiring, manifest provenance, wallet actions, receipts and the read-only final verifier. Historical `84532` evidence stays historical. Dependency-security acceptance, supported wallets and the relevant beta/production gates remain separate work.
