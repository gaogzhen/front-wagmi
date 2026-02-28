import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { mainnet, sepolia, foundry } from "wagmi/chains";

export function getConfig() {
  return createConfig({
    chains: [mainnet, sepolia, foundry],
    storage: createStorage({
      storage: cookieStorage,
    }),
    ssr: true,
    transports: {
      [mainnet.id]: http(),
      [sepolia.id]: http(),
      [foundry.id]: http(),
    },
  });
}

declare module "wagmi" {
  interface Register {
    config: ReturnType<typeof getConfig>;
  }
}
