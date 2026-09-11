import { NextResponse } from "next/server";
import { isLocalDevEnvironment } from "@/lib/localDevEnvironment";

export class LocalDevGuardError extends Error {
  constructor() {
    super("Not available.");
    this.name = "LocalDevGuardError";
  }
}

export function localDevGuardResponse(error: unknown) {
  return error instanceof LocalDevGuardError
    ? NextResponse.json({ error: "Not available." }, { status: 404 })
    : null;
}

export async function assertLocalDevActionsEnabled(): Promise<void> {
  // Reject the application configuration before reading an RPC or entering a writer.
  if (!isLocalDevEnvironment()) {
    throw new LocalDevGuardError();
  }

  const rpcUrl = process.env.ANVIL_RPC_URL;
  if (!rpcUrl?.trim()) {
    throw new LocalDevGuardError();
  }

  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "eth_chainId",
        params: [],
        id: 1
      }),
      cache: "no-store"
    });

    if (!response.ok) throw new LocalDevGuardError();

    const payload = (await response.json()) as { result?: unknown; error?: unknown } | null;
    if (payload?.error || typeof payload?.result !== "string" || payload.result.toLowerCase() !== "0x7a69") {
      throw new LocalDevGuardError();
    }
  } catch {
    // Never expose a URL, an upstream error, or configuration instructions.
    throw new LocalDevGuardError();
  }
}
