import { anvilChainId, targetChainId } from "@/lib/chains";

export function isLocalDevUiEnabled(
  chainId = targetChainId,
  enabledValue = process.env.ENABLE_LOCAL_DEV_ACTIONS
) {
  return chainId === anvilChainId && enabledValue === "true";
}
