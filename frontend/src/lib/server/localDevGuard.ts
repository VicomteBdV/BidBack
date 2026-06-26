const REQUIRED_CHAIN_ID = 31337;
const REQUIRED_CHAIN_ID_HEX = "0x7a69";

type JsonRpcResponse = {
  jsonrpc?: string;
  id?: number;
  result?: string;
  error?: {
    code?: number;
    message?: string;
  };
};

export class LocalDevGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalDevGuardError";
  }
}

export async function assertLocalDevActionsEnabled(): Promise<void> {
  if (process.env.ENABLE_LOCAL_DEV_ACTIONS !== "true") {
    throw new LocalDevGuardError(
      "Local dev actions are disabled. Set ENABLE_LOCAL_DEV_ACTIONS=true in frontend/.env.local.",
    );
  }

  const rpcUrl = process.env.ANVIL_RPC_URL;

  if (!rpcUrl) {
    throw new LocalDevGuardError(
      "ANVIL_RPC_URL is required for local dev actions.",
    );
  }

  let response: Response;

  try {
    response = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_chainId",
        params: [],
        id: 1,
      }),
      cache: "no-store",
    });
  } catch {
    throw new LocalDevGuardError(
      "Unable to reach ANVIL_RPC_URL. Start Anvil on http://127.0.0.1:8545.",
    );
  }

  if (!response.ok) {
    throw new LocalDevGuardError(
      `Unable to reach ANVIL_RPC_URL. HTTP status: ${response.status}.`,
    );
  }

  const payload = (await response.json()) as JsonRpcResponse;

  if (payload.error) {
    throw new LocalDevGuardError(
      `Unable to read Anvil chainId: ${payload.error.message ?? "unknown JSON-RPC error"}.`,
    );
  }

  if (!payload.result) {
    throw new LocalDevGuardError(
      "Unable to read Anvil chainId: empty JSON-RPC result.",
    );
  }

  const chainId = Number.parseInt(payload.result, 16);

  if (payload.result.toLowerCase() !== REQUIRED_CHAIN_ID_HEX || chainId !== REQUIRED_CHAIN_ID) {
    throw new LocalDevGuardError(
      "Local dev actions require Anvil chainId 31337.",
    );
  }
}