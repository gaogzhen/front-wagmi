import type { AppKitNetwork } from "@reown/appkit/networks";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { foundry, optimism } from "@reown/appkit/networks"; // ⚠️ 从 AppKit 导入网络
import { cookieStorage, createStorage, http } from "wagmi";

export const projectId = process.env.NEXT_PUBLIC_PROJECT_ID as string;
export const networks = [foundry, optimism] as [
  AppKitNetwork,
  ...AppKitNetwork[],
];

// 创建适配器（只传必要参数）
export const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks,
  // 可选：传入 storage（例如使用 cookieStorage 支持 SSR）
  storage: createStorage({
    storage: cookieStorage,
  }),
  // 可选：指定 transports（如果不指定，适配器会自动生成默认 transports）
  transports: {
    [foundry.id]: http(),
    [optimism.id]: http(),
  },
});

// 导出 config（类型自动为 Wagmi v2 的 Config）
export const wagmiConfig = wagmiAdapter.wagmiConfig;
