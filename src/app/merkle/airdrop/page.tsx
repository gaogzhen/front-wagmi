"use client";

import { PageProvider } from "@/context/rainbow/page-provider";
import MerkleAirdrop from "./page.client";

export default function WhitelistNFT() {
  return (
    <PageProvider>
      <MerkleAirdrop />
    </PageProvider>
  );
}
