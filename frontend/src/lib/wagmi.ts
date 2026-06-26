import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { anvil } from "@/lib/chains";

export const wagmiConfig = createConfig({
  chains: [anvil],
  connectors: [injected()],
  transports: {
    [anvil.id]: http(anvil.rpcUrls.default.http[0])
  },
  ssr: true
});