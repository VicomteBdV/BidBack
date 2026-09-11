import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { targetChain } from "@/lib/chains";

export const wagmiConfig = createConfig({
  chains: [targetChain],
  connectors: [injected()],
  multiInjectedProviderDiscovery: true,
  transports: {
    [targetChain.id]: http(targetChain.rpcUrls.default.http[0])
  },
  ssr: true
});
