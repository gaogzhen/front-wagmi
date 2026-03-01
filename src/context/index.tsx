"use client";

import { wagmiAdapter, projectId, networks, wagmiConfig } from "@/config"; // 引入 wagmiConfig
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createAppKit } from "@reown/appkit/react";
import { type ReactNode } from "react";
import { WagmiProvider } from "wagmi"; // 不再需要 Config 类型

import { getConfig } from "@/wagmi";

const queryClient = new QueryClient();

const metadata = {
  name: "upchaintest",
  description: "AppKit Example",
  url: "https://reown.com/appkit",
  icons: ["https://learnblockchain.cn/image/avatar/412_big.jpg"],
};
// 创建 modal
export const modal = createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks,
  metadata,
  themeMode: "light",
  features: { analytics: true },
  themeVariables: { "--w3m-accent": "#000000" },
});

function ContextProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={getConfig()}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}

export default ContextProvider;
