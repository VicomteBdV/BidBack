# Build from the frontend directory: docker build -f Dockerfile .
FROM node:22-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS builder
COPY . .

# These four values are public browser configuration, never server credentials.
ARG NEXT_PUBLIC_CHAIN_ID=84532
ARG NEXT_PUBLIC_CHAIN_NAME=""
ARG NEXT_PUBLIC_WALLET_RPC_URL
ARG NEXT_PUBLIC_BLOCK_EXPLORER_URL=""
ENV NEXT_PUBLIC_CHAIN_ID=${NEXT_PUBLIC_CHAIN_ID} \
    NEXT_PUBLIC_CHAIN_NAME=${NEXT_PUBLIC_CHAIN_NAME} \
    NEXT_PUBLIC_WALLET_RPC_URL=${NEXT_PUBLIC_WALLET_RPC_URL} \
    NEXT_PUBLIC_BLOCK_EXPLORER_URL=${NEXT_PUBLIC_BLOCK_EXPLORER_URL} \
    BIDBACK_CHAIN_ID=84532 \
    ENABLE_LOCAL_DEV_ACTIONS=false \
    PORT=3000

# The synthetic server RPC exists only during these offline build commands.
# Supply the real server RPC at runtime; it is never a build argument or layer ENV.
# Assemble and clean up in one layer to bound intermediate storage on VFS engines.
RUN npm ci \
    && BIDBACK_RPC_URL=https://build-rpc.example.invalid node scripts/hosted-testnet-runtime.mjs --write-stamp \
    && BIDBACK_RPC_URL=https://build-rpc.example.invalid npm run build \
    && mkdir -p /runtime/.next /runtime/scripts \
    && cp -a .next/standalone/. /runtime/ \
    && cp -a .next/static /runtime/.next/static \
    && cp -a public /runtime/public \
    && cp hosted-testnet-build.json /runtime/hosted-testnet-build.json \
    && cp scripts/hosted-testnet-runtime.mjs scripts/validate-controlled-testnet-env.mjs scripts/deployment-json-validator.mjs /runtime/scripts/ \
    && chmod -R u=rwX,go=rX /runtime \
    && mkdir -p /runtime/.next/cache \
    && chown node:node /runtime/.next/cache \
    && rm -rf node_modules .next /root/.npm

FROM base AS runner
ARG NEXT_PUBLIC_CHAIN_ID=84532
ARG NEXT_PUBLIC_CHAIN_NAME=""
ARG NEXT_PUBLIC_WALLET_RPC_URL
ARG NEXT_PUBLIC_BLOCK_EXPLORER_URL=""
ENV NODE_ENV=production \
    NEXT_PUBLIC_CHAIN_ID=${NEXT_PUBLIC_CHAIN_ID} \
    NEXT_PUBLIC_CHAIN_NAME=${NEXT_PUBLIC_CHAIN_NAME} \
    NEXT_PUBLIC_WALLET_RPC_URL=${NEXT_PUBLIC_WALLET_RPC_URL} \
    NEXT_PUBLIC_BLOCK_EXPLORER_URL=${NEXT_PUBLIC_BLOCK_EXPLORER_URL} \
    BIDBACK_CHAIN_ID=84532 \
    ENABLE_LOCAL_DEV_ACTIONS=false \
    HOSTNAME=0.0.0.0 \
    PORT=3000

COPY --from=builder /runtime/ ./

USER node
EXPOSE 3000
CMD ["sh", "-c", "node scripts/hosted-testnet-runtime.mjs --check && exec node server.js"]
