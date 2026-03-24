"use client";

import { PageProvider } from "@/context/rainbow/page-provider";
import WhitelistNFTClient from "./page.client";

export default function WhitelistNFT() {
  return (
    <PageProvider>
      <WhitelistNFTClient />
    </PageProvider>
  );
}
