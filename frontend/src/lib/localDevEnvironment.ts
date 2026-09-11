type LocalDevEnvironment = {
  NEXT_PUBLIC_CHAIN_ID?: string;
  BIDBACK_CHAIN_ID?: string;
  ENABLE_LOCAL_DEV_ACTIONS?: string;
};

export function isLocalDevEnvironment(
  environment: LocalDevEnvironment = {
    // Keep the direct public env access so Next.js uses the build's public target.
    NEXT_PUBLIC_CHAIN_ID: process.env.NEXT_PUBLIC_CHAIN_ID,
    BIDBACK_CHAIN_ID: process.env.BIDBACK_CHAIN_ID,
    ENABLE_LOCAL_DEV_ACTIONS: process.env.ENABLE_LOCAL_DEV_ACTIONS
  }
) {
  // Do not inherit the read-only chain helpers' fallback to Anvil on invalid input.
  return environment.NEXT_PUBLIC_CHAIN_ID === "31337" &&
    environment.BIDBACK_CHAIN_ID === "31337" &&
    environment.ENABLE_LOCAL_DEV_ACTIONS === "true";
}
