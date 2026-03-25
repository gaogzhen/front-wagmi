// app/page.tsx
"use client";

import { useState, useEffect } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { keccak256, toBytes, Address, parseEther } from "viem";
import { MerkleTree } from "merkletreejs";

import WhitelistNFT_ABI from "@/contracts/WhitelistNFT.json";

const CONTRACT_ADDRESS: Address = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const ADMIN_ADDRESS: Address = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

// 定义一个单一数据源的白名单，确保前后端计算一致性
const PRESET_WHITELIST: Address[] = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", // Admin
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", // Anvil 账户 1
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", // Anvil 账户 2
  // 你可以在这里添加更多初始白名单地址
];

const MINT_PRICE_WEI = parseEther("0.01");
const MAX_SUPPLY = 1000;

export default function WhitelistNFTClient() {
  const { address, isConnected, chain } = useAccount();

  const [adminMode, setAdminMode] = useState(false);
  const [batchAddresses, setBatchAddresses] = useState("");
  const [transactionStatus, setTransactionStatus] = useState<string>("");
  const [isInitializing, setIsInitializing] = useState(true);

  const { data: owner } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: WhitelistNFT_ABI,
    functionName: "owner",
  }) as { data: Address | undefined };

  const { data: currentMerkleRoot, refetch: refetchMerkleRoot } =
    useReadContract({
      address: CONTRACT_ADDRESS,
      abi: WhitelistNFT_ABI,
      functionName: "_merkleRoot",
      query: { staleTime: 0 },
    }) as { data: `0x${string}` | undefined; refetch: () => void };

  // balance
  const { data: balance, refetch: refetchBalance } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: WhitelistNFT_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: isConnected },
  });

  const { data: hasMintedData, refetch: refetchHasMinted } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: WhitelistNFT_ABI,
    functionName: "hasMinted",
    args: address ? [address] : undefined,
    query: { enabled: isConnected },
  });

  const { data: totalSupply, refetch: refetchTotalSupply } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: WhitelistNFT_ABI,
    functionName: "totalSupply",
  }) as { data: bigint | undefined };

  const { writeContract: mintSingle, isPending: isMinting } =
    useWriteContract();
  const { writeContract: mintBatch, isPending: isBatchMinting } =
    useWriteContract();
  const { writeContract: withdraw, isPending: isWithdrawing } =
    useWriteContract();
  const { writeContract: setMerkleRoot, isPending: isSettingRoot } =
    useWriteContract();

  // 用于跟踪交易哈希，以便 useWaitForTransactionReceipt 可以监听它
  const [transactionHash, setTransactionHash] = useState<
    `0x${string}` | undefined
  >(undefined);

  const {
    isLoading: isConfirming,
    isSuccess: isConfirmed,
    isError: isReceiptError,
    data: transactionReceipt,
  } = useWaitForTransactionReceipt({
    hash: transactionHash,
  });

  useEffect(() => {
    setAdminMode(
      address && owner ? address.toLowerCase() === owner.toLowerCase() : false,
    );
  }, [address, owner]);

  // 初始化逻辑：检查并设置 Merkle Root
  useEffect(() => {
    const initializeMerkleRoot = async () => {
      if (!isConnected || !adminMode) {
        setIsInitializing(false);
        return;
      }

      if (
        currentMerkleRoot &&
        currentMerkleRoot !==
          "0x0000000000000000000000000000000000000000000000000000000000000000"
      ) {
        console.log("Merkle Root already set:", currentMerkleRoot);
        setIsInitializing(false);
        return;
      }

      console.log("Merkle Root not found, setting it now...");

      try {
        const leaves = PRESET_WHITELIST.map((addr) =>
          keccak256(toBytes(addr.toLowerCase())),
        );
        const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
        const root = tree.getHexRoot();

        console.log("Calculated Root:", root);

        setMerkleRoot(
          {
            address: CONTRACT_ADDRESS,
            abi: WhitelistNFT_ABI,
            functionName: "setMerkleRoot",
            args: [root as `0x${string}`],
          },
          {
            onSuccess(data) {
              console.log("Set Merkle Root TX sent:", data);
              setTransactionStatus("正在设置 Merkle Root...");
              setTransactionHash(data); // 设置哈希以供监听
            },
            onError(error) {
              console.error("Set Merkle Root Error:", error);
              setTransactionStatus(`设置 Merkle Root 失败: ${error.message}`);
              setIsInitializing(false);
            },
          },
        );
      } catch (err) {
        console.error("Initialization error:", err);
        setTransactionStatus(`初始化失败: ${(err as Error).message}`);
        setIsInitializing(false);
      }
    };

    initializeMerkleRoot();
  }, [
    isConnected,
    adminMode,
    currentMerkleRoot,
    setMerkleRoot,
    refetchMerkleRoot,
  ]);

  // Helper: generate merkle proof (修正：使用固定列表)
  const generateProof = (userAddress: Address): string[] => {
    // 使用与设置 Merkle Root 时完全相同的白名单列表
    const whitelist: Address[] = PRESET_WHITELIST;

    const leaves = whitelist.map((addr) =>
      keccak256(toBytes(addr.toLowerCase())),
    );
    const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
    const leaf = keccak256(toBytes(userAddress.toLowerCase()));

    return tree.getHexProof(leaf);
  };

  const handleSingleMint = () => {
    if (!address) {
      setTransactionStatus("请先连接钱包");
      return;
    }
    if (hasMintedData) {
      setTransactionStatus("你已经铸造过了！");
      return;
    }
    if ((totalSupply ?? BigInt(0)) >= BigInt(MAX_SUPPLY)) {
      setTransactionStatus("NFT 已售罄！");
      return;
    }

    try {
      const proof = generateProof(address);
      console.log("Generated Proof:", proof);

      mintSingle(
        {
          address: CONTRACT_ADDRESS,
          abi: WhitelistNFT_ABI,
          functionName: "mint",
          args: [proof],
          value: MINT_PRICE_WEI,
        },
        {
          onSuccess(data) {
            console.log("Transaction sent:", data);
            setTransactionStatus("交易已发送，等待确认...");
            setTransactionHash(data); // 设置哈希以供监听
          },
          onError(error) {
            console.error("Mint Error (Simulated):", error);
            setTransactionStatus(`铸造失败 (模拟阶段): ${error.message}`);
          },
        },
      );
    } catch (err) {
      console.error("Proof generation error:", err);
      setTransactionStatus(`生成证明失败: ${(err as Error).message}`);
    }
  };

  const handleBatchMint = () => {
    if (!adminMode) {
      setTransactionStatus("权限不足，仅管理员可执行批量铸造");
      return;
    }

    const addresses: Address[] = batchAddresses
      .split(",")
      .map((a) => a.trim())
      .filter((a) => a.startsWith("0x")) as Address[];

    if (addresses.length === 0) {
      setTransactionStatus("请输入有效的地址列表");
      return;
    }

    mintBatch(
      {
        address: CONTRACT_ADDRESS,
        abi: WhitelistNFT_ABI,
        functionName: "batchMint",
        args: [addresses],
      },
      {
        onSuccess(data) {
          console.log("Batch Mint Transaction sent:", data);
          setTransactionStatus("批量铸造交易已发送，等待确认...");
          setTransactionHash(data); // 设置哈希以供监听
        },
        onError(error) {
          console.error("Batch Mint Error (Simulated):", error);
          setTransactionStatus(`批量铸造失败 (模拟阶段): ${error.message}`);
        },
      },
    );
  };

  const handleWithdraw = () => {
    if (!adminMode) {
      setTransactionStatus("权限不足，仅管理员可提款");
      return;
    }
    withdraw(
      {
        address: CONTRACT_ADDRESS,
        abi: WhitelistNFT_ABI,
        functionName: "withdraw",
      },
      {
        onSuccess(data) {
          console.log("Withdraw transaction sent:", data);
          setTransactionStatus("提款交易已发送，等待确认...");
          setTransactionHash(data); // 设置哈希以供监听
        },
        onError(error) {
          console.error("Withdraw Error (Simulated):", error);
          setTransactionStatus(`提款失败 (模拟阶段): ${error.message}`);
        },
      },
    );
  };

  // 当交易成功确认后，刷新所有相关的读取数据
  useEffect(() => {
    if (isConfirmed) {
      console.log("Transaction confirmed, refetching data...");
      // 并行刷新所有相关的链上数据
      Promise.all([
        refetchBalance(),
        refetchHasMinted(),
        refetchTotalSupply(),
        refetchMerkleRoot(), // 如果需要的话，也可以刷新 Merkle Root
      ])
        .then(() => {
          console.log("All data refetched.");
        })
        .catch((error) => {
          console.error("Error refetching data:", error);
        });
    }
  }, [
    isConfirmed,
    refetchBalance,
    refetchHasMinted,
    refetchTotalSupply,
    refetchMerkleRoot,
  ]);

  // 监听交易收据的变化
  useEffect(() => {
    if (isReceiptError) {
      // 收据本身获取失败
      setTransactionStatus("❌ 交易收据获取失败。");
      setTransactionHash(undefined); // 清空哈希
    } else if (transactionReceipt) {
      if (transactionReceipt.status === "success") {
        // 交易成功
        setTransactionStatus("✅ 交易成功！");
        // 注意：数据刷新由上面的 useEffect 处理
        setTimeout(() => setTransactionStatus(""), 3000); // 3秒后清空状态
      } else {
        // 交易失败 (status === 'reverted')
        setTransactionStatus(
          "❌ 交易失败！交易已被打包，但执行状态为失败。请检查您的操作或联系开发者。",
        );
        console.error("Transaction reverted:", transactionReceipt);
      }
      // 无论成功或失败，交易都已结束，可以重置哈希
      setTransactionHash(undefined);
    }
  }, [transactionReceipt, isReceiptError]);

  const isPageDisabled = !isConnected || isInitializing;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-gray-900 text-white">
      <div className="z-10 w-full max-w-4xl items-center justify-between font-mono text-sm">
        <h1 className="text-3xl font-bold mb-6 text-center">
          Local Anvil Whitelist NFT
        </h1>
        <div className="flex justify-end">
          <ConnectButton />
        </div>
      </div>

      <div className="mt-8 w-full max-w-2xl bg-gray-800 p-6 rounded-lg shadow-xl">
        {isConnected ? (
          <>
            <div className="mb-6">
              <p className="text-gray-300">
                <strong>连接的地址:</strong> {address}
              </p>
              <p className="text-gray-300">
                <strong>当前网络:</strong> {chain?.name || "Unknown"}
              </p>
              <p className="text-gray-300">
                <strong>合约地址:</strong> {CONTRACT_ADDRESS}
              </p>
              <p className="text-gray-300">
                <strong>Merkle Root:</strong>{" "}
                {currentMerkleRoot?.substring(0, 10)}...
              </p>
              <p className="text-gray-300">
                <strong>我的 NFT 数量:</strong> {balance?.toString() || "0"}
              </p>
              <p className="text-gray-300">
                <strong>总供应量:</strong> {totalSupply?.toString() || "0"} /{" "}
                {MAX_SUPPLY}
              </p>
              <p
                className={`font-semibold ${hasMintedData ? "text-green-400" : "text-red-400"}`}
              >
                <strong>铸造状态:</strong> {hasMintedData ? "已完成" : "未铸造"}
              </p>
              {adminMode && (
                <p className="text-yellow-400 font-bold mt-2">[管理员模式]</p>
              )}
            </div>

            {/* 初始化状态提示 */}
            {isInitializing && (
              <div className="mb-4 p-3 bg-yellow-900/30 text-yellow-300 rounded-md">
                <p>正在初始化合约，请稍候...</p>
                <p>（作为管理员，正在为您设置白名单根）</p>
              </div>
            )}

            {/* Single Mint Section */}
            <div className="mb-8">
              <h3 className="text-xl font-semibold mb-3">铸造你的 NFT</h3>
              <p className="text-gray-400 mb-2">价格: 0.01 ETH</p>
              <button
                onClick={handleSingleMint}
                disabled={
                  isPageDisabled ||
                  isMinting ||
                  isConfirming ||
                  !!hasMintedData ||
                  (totalSupply !== undefined &&
                    totalSupply >= BigInt(MAX_SUPPLY))
                }
                className={`w-full py-3 px-4 rounded-md font-medium ${
                  isPageDisabled ||
                  isMinting ||
                  isConfirming ||
                  !!hasMintedData ||
                  (totalSupply !== undefined &&
                    totalSupply >= BigInt(MAX_SUPPLY))
                    ? "bg-gray-600 cursor-not-allowed"
                    : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {isMinting
                  ? "正在发送交易..."
                  : isConfirming
                    ? "等待确认..."
                    : isInitializing
                      ? "初始化中..."
                      : hasMintedData
                        ? "已铸造"
                        : "点击铸造 (Mint for 0.01 ETH)"}
              </button>
            </div>

            {/* Admin Actions Section */}
            {adminMode && (
              <div className="border-t border-gray-700 pt-6">
                <h3 className="text-xl font-semibold mb-3 text-yellow-400">
                  管理员操作
                </h3>

                <div className="mb-6">
                  <h4 className="text-lg font-medium mb-2">批量铸造</h4>
                  <textarea
                    className="w-full p-3 text-black rounded mb-3 h-24"
                    placeholder={`输入多个钱包地址，用逗号分隔\n例如: 0x123..., 0x456...`}
                    value={batchAddresses}
                    onChange={(e) => setBatchAddresses(e.target.value)}
                    disabled={isPageDisabled}
                  />
                  <button
                    onClick={handleBatchMint}
                    disabled={
                      isPageDisabled || isBatchMinting || !batchAddresses.trim()
                    }
                    className={`py-2 px-4 rounded-md font-medium ${
                      isPageDisabled || isBatchMinting || !batchAddresses.trim()
                        ? "bg-gray-600 cursor-not-allowed"
                        : "bg-green-600 hover:bg-green-700"
                    }`}
                  >
                    {isBatchMinting ? "铸造中..." : "执行批量铸造"}
                  </button>
                </div>

                <div>
                  <h4 className="text-lg font-medium mb-2">提款</h4>
                  <button
                    onClick={handleWithdraw}
                    disabled={isPageDisabled || isWithdrawing}
                    className={`py-2 px-4 rounded-md font-medium ${
                      isPageDisabled || isWithdrawing
                        ? "bg-gray-600 cursor-not-allowed"
                        : "bg-purple-600 hover:bg-purple-700"
                    }`}
                  >
                    {isWithdrawing ? "提款中..." : "提取合约余额"}
                  </button>
                </div>
              </div>
            )}

            {/* Transaction Status */}
            {(transactionStatus || isConfirmed || isReceiptError) && (
              <div
                className={`mt-6 p-4 rounded-md ${
                  isConfirmed
                    ? "bg-green-900/30 text-green-400"
                    : isReceiptError
                      ? "bg-red-900/30 text-red-400"
                      : "bg-blue-900/30 text-blue-400"
                }`}
              >
                <p>
                  <strong>状态:</strong> {transactionStatus}
                </p>
                {isConfirmed && <p className="text-green-400">✅ 交易成功！</p>}
                {isReceiptError && transactionReceipt && (
                  <p className="text-red-400">
                    ❌ 交易在区块中执行失败 (Reverted)。
                  </p>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="text-center text-xl">请连接钱包以开始。</p>
        )}
      </div>

      <footer className="mt-12 text-gray-500 text-sm">
        <p>在本地 Anvil 环境中测试 NFT 铸造</p>
      </footer>
    </main>
  );
}
