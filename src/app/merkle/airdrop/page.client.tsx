// src/app/page.tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useBalance,
  useReadContracts,
} from "wagmi";
import {
  parseEther,
  formatEther,
  Address,
  Hex,
  Abi,
  keccak256,
  encodePacked,
} from "viem";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useQueryClient } from "@tanstack/react-query";
import { MerkleTree } from "merkletreejs";

// 导入 ABI (请确保路径正确，如果找不到请检查 contracts/merkle/MerkleAirdrop.json)
import MERKLE_AIRDROP_ABI_JSON from "@/contracts/merkle/MerkleAirdrop.json";
const MERKLE_AIRDROP_ABI = MERKLE_AIRDROP_ABI_JSON as Abi;

// --- 配置 ---
const AIRDROP_CONTRACT_ADDRESS: Address =
  "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

// 类型定义
interface AirdropEntry {
  id: string; // 前端唯一标识
  address: string;
  amount: bigint;
}

// 初始默认数据
const DEFAULT_DATA: AirdropEntry[] = [
  {
    id: "1",
    address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    amount: parseEther("100"),
  },
  {
    id: "2",
    address: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
    amount: parseEther("50"),
  },
  {
    id: "3",
    address: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    amount: parseEther("200"),
  },
];

// --- 工具函数 ---
function generateMerkleTree(data: AirdropEntry[]) {
  const leaves = data.map((item) => {
    return keccak256(
      encodePacked(
        ["address", "uint256"],
        [item.address.toLowerCase() as `0x${string}`, item.amount],
      ),
    );
  });
  return new MerkleTree(leaves, keccak256, { sortPairs: true });
}

function getProof(tree: MerkleTree, address: string, amount: bigint) {
  const leaf = keccak256(
    encodePacked(
      ["address", "uint256"],
      [address.toLowerCase() as `0x${string}`, amount],
    ),
  );
  return tree.getHexProof(leaf);
}

export default function AirdropDashboard() {
  const { address, isConnected } = useAccount();
  const queryClient = useQueryClient();

  // ================= 状态管理 =================

  // 1. 空投列表状态 (可编辑)
  const [airdropList, setAirdropList] = useState<AirdropEntry[]>(DEFAULT_DATA);

  // 2. 充值输入状态
  const [depositAmountInput, setDepositAmountInput] = useState<string>("");

  // 3. 交易状态
  // pendingTxHash 将由 useEffect 自动填充，不再手动赋值 void
  const [pendingTxHash, setPendingTxHash] = useState<Hex | undefined>(
    undefined,
  );
  const [txType, setTxType] = useState<
    "claim" | "setRoot" | "deposit" | "withdraw" | null
  >(null);

  // ================= 计算属性 (Memoized) =================

  // 计算当前列表所需的总金额
  const requiredTotalAmount = useMemo(() => {
    return airdropList.reduce((sum, item) => sum + item.amount, 0n);
  }, [airdropList]);

  // 计算当前的 Merkle Root
  const { currentRoot, treeInstance } = useMemo(() => {
    if (airdropList.length === 0)
      return { currentRoot: null, treeInstance: null };
    const tree = generateMerkleTree(airdropList);
    return {
      currentRoot: tree.getHexRoot() as Hex,
      treeInstance: tree,
    };
  }, [airdropList]);

  // 校验充值金额是否合法
  const isDepositValid = useMemo(() => {
    if (!depositAmountInput) return false;
    try {
      const inputVal = parseEther(depositAmountInput);
      return inputVal >= requiredTotalAmount && inputVal > 0n;
    } catch {
      return false;
    }
  }, [depositAmountInput, requiredTotalAmount]);

  // ================= 合约读取 =================

  const { data: owner } = useReadContract({
    address: AIRDROP_CONTRACT_ADDRESS,
    abi: MERKLE_AIRDROP_ABI,
    functionName: "owner",
  }) as { data: Address | undefined };

  const { data: chainRoot } = useReadContract({
    address: AIRDROP_CONTRACT_ADDRESS,
    abi: MERKLE_AIRDROP_ABI,
    functionName: "merkleRoot",
  }) as { data: Hex | undefined };

  const { data: tokenAddress } = useReadContract({
    address: AIRDROP_CONTRACT_ADDRESS,
    abi: MERKLE_AIRDROP_ABI,
    functionName: "token",
  }) as { data: Address | undefined };

  // 合约余额
  const { data: contractBalance } = useBalance({
    address: AIRDROP_CONTRACT_ADDRESS,
    token: tokenAddress as Address,
    query: { enabled: !!tokenAddress },
  });

  // 批量查询领取状态
  const contractsQuery = useReadContracts({
    contracts: airdropList.map((item) => ({
      address: AIRDROP_CONTRACT_ADDRESS,
      abi: MERKLE_AIRDROP_ABI,
      functionName: "hasClaimed",
      args: [item.address as Address],
    })),
    query: {
      enabled: isConnected && airdropList.length > 0,
      refetchInterval: 5000,
    },
  });

  // ================= 效应钩子 =================

  const isAdmin = useMemo(() => {
    return owner && address && owner.toLowerCase() === address.toLowerCase();
  }, [owner, address]);

  const isRootSynced = useMemo(() => {
    if (!chainRoot || !currentRoot) return false;
    return chainRoot.toLowerCase() === currentRoot.toLowerCase();
  }, [chainRoot, currentRoot]);

  // ================= 合约写入 Hooks (关键修复) =================
  // wagmi v2: writeContract 返回 void，hash 在 data 字段中

  const {
    writeContract: writeDeposit,
    data: depositHash,
    isError: isDepositError,
    error: depositError,
  } = useWriteContract();

  const { writeContract: writeSetRoot, data: setRootHash } = useWriteContract();

  const { writeContract: writeClaim, data: claimHash } = useWriteContract();

  const { writeContract: writeWithdraw, data: withdrawHash } =
    useWriteContract();

  // ================= 监听交易 Hash (核心修复逻辑) =================
  useEffect(() => {
    if (depositHash) {
      setTxType("deposit");
      setPendingTxHash(depositHash);
    } else if (setRootHash) {
      setTxType("setRoot");
      setPendingTxHash(setRootHash);
    } else if (claimHash) {
      setTxType("claim");
      setPendingTxHash(claimHash);
    } else if (withdrawHash) {
      setTxType("withdraw");
      setPendingTxHash(withdrawHash);
    }
  }, [depositHash, setRootHash, claimHash, withdrawHash]);

  // 监听交易确认
  const { isLoading: isConfirming, isSuccess: isConfirmed } =
    useWaitForTransactionReceipt({
      hash: pendingTxHash,
      query: { enabled: !!pendingTxHash },
    });

  // 交易成功后的处理
  useEffect(() => {
    if (isConfirmed && txType) {
      // 刷新相关查询
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey.includes(AIRDROP_CONTRACT_ADDRESS) ||
          query.queryKey.includes("balance"),
      });

      const type = txType;
      // 重置状态
      setPendingTxHash(undefined);
      setTxType(null);

      // 延迟提示
      setTimeout(() => {
        if (type === "deposit") alert("✅ 充值成功！请继续同步 Merkle Root。");
        else if (type === "setRoot")
          alert("✅ Merkle Root 已同步！空投已激活。");
        else if (type === "claim") alert("✅ 领取成功！");
        else if (type === "withdraw") alert("✅ 提取成功！");
      }, 100);
    }
  }, [isConfirmed, txType, queryClient]);

  // 监听错误
  // 替换原有的错误监听 useEffect
  // ================= 监听错误 (修复 TS 类型错误) =================
  // ================= 监听错误 (修复 TS 类型错误) =================
  useEffect(() => {
    if (isDepositError && depositError) {
      // --- 1. 安全地检测 AbortError (绕过 TS 检查) ---
      // 方法：先检查 'name' 属性是否存在，再比较值；或者直接检查 message 内容
      const errorName = (depositError as any).name;
      const errorMessage = depositError.message || "";

      const isAbort =
        errorName === "AbortError" ||
        errorMessage.toLowerCase().includes("aborted") ||
        errorMessage.toLowerCase().includes("signal");

      if (isAbort) {
        console.warn("⚠️ 交易请求被中止 (用户取消操作、切换页面或组件卸载)");
        // 中止通常不需要弹窗报警，直接重置状态即可，避免打扰用户
        setPendingTxHash(undefined);
        setTxType(null);
        return;
      }

      // --- 2. 处理其他真实错误 ---
      console.error("❌ 充值失败详细日志:", depositError);

      let detailedReason = "未知错误";

      // 安全提取错误信息 (处理 wagmi/viem 的错误结构)
      if (
        "shortMessage" in depositError &&
        typeof depositError.shortMessage === "string"
      ) {
        detailedReason = depositError.shortMessage;
      } else if ("cause" in depositError) {
        // 尝试从 cause 中获取 (viem 常见结构)
        const cause = depositError.cause as any;
        if (cause && typeof cause.message === "string") {
          detailedReason = cause.message;
        } else if (cause && typeof cause.reason === "string") {
          detailedReason = cause.reason;
        } else {
          detailedReason = String(cause);
        }
      } else if (
        "message" in depositError &&
        typeof depositError.message === "string"
      ) {
        detailedReason = depositError.message;
      }

      // 3. 常见错误映射与用户提示
      let userFriendlyMsg = "充值失败";
      const lowerReason = detailedReason.toLowerCase();

      if (
        lowerReason.includes("user rejected") ||
        lowerReason.includes("cancelled")
      ) {
        userFriendlyMsg = "您在钱包中取消了交易。";
      } else if (lowerReason.includes("insufficient funds")) {
        userFriendlyMsg =
          "余额不足！请检查：\n1. 代币余额是否足够？\n2. 钱包是否有足够的 ETH/BNB 支付 Gas 费？";
      } else if (lowerReason.includes("allowance")) {
        userFriendlyMsg =
          "授权失败！该代币可能需要先 Approve。\n(当前代码直接调用 transfer，某些代币不支持)";
      } else if (lowerReason.includes("exceeds balance")) {
        userFriendlyMsg = "转账金额超过了您的代币余额。";
      } else if (lowerReason.includes("reverted")) {
        // 尝试提取 revert 的具体字符串 (viem 标准格式)
        const match = detailedReason.match(
          /reverted with reason string '([^']+)'/,
        );
        if (match && match[1]) {
          userFriendlyMsg = `合约拒绝交易: ${match[1]}`;
        } else {
          // 尝试另一种格式
          const match2 = detailedReason.match(/reverted:\s*(.+)/i);
          userFriendlyMsg = `交易被合约拒绝: ${match2 ? match2[1] : detailedReason}`;
        }
      } else if (lowerReason.includes("execution reverted")) {
        userFriendlyMsg = "交易执行失败 (可能是合约逻辑限制或 Gas 不足)。";
      }

      alert(`❌ ${userFriendlyMsg}\n\n技术详情:\n${detailedReason}`);

      // 重置状态
      setPendingTxHash(undefined);
      setTxType(null);
    }
  }, [isDepositError, depositError]);

  // ================= 操作 Handlers =================

  // 1. 列表管理：添加
  const handleAddEntry = () => {
    const newId = Date.now().toString();
    setAirdropList([
      ...airdropList,
      { id: newId, address: "", amount: parseEther("0") },
    ]);
  };

  // 1. 列表管理：更新
  const handleUpdateEntry = (
    id: string,
    field: keyof AirdropEntry,
    value: string,
  ) => {
    setAirdropList((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (field === "amount") {
          try {
            const val = value === "" ? 0n : parseEther(value);
            return { ...item, amount: val };
          } catch {
            return item;
          }
        }
        return { ...item, [field]: value };
      }),
    );
  };

  // 1. 列表管理：删除
  const handleRemoveEntry = (id: string) => {
    setAirdropList((prev) => prev.filter((item) => item.id !== id));
  };

  // 2. 充值 (不再 await，直接调用)
  const handleDeposit = () => {
    if (!tokenAddress || !isDepositValid) return;
    const amount = parseEther(depositAmountInput);

    writeDeposit({
      address: tokenAddress,
      abi: [
        {
          inputs: [
            { name: "to", type: "address" },
            { name: "amount", type: "uint256" },
          ],
          name: "transfer",
          outputs: [{ name: "", type: "bool" }],
          stateMutability: "nonpayable",
          type: "function",
        },
      ] as any,
      functionName: "transfer",
      args: [AIRDROP_CONTRACT_ADDRESS, amount],
    });
  };

  // 3. 同步 Root
  const handleSyncRoot = () => {
    if (!currentRoot) return;
    writeSetRoot({
      address: AIRDROP_CONTRACT_ADDRESS,
      abi: MERKLE_AIRDROP_ABI,
      functionName: "setMerkleRoot",
      args: [currentRoot],
    });
  };

  // 4. 领取
  const handleClaim = (entry: AirdropEntry) => {
    if (!treeInstance) return;
    const proof = getProof(treeInstance, entry.address, entry.amount);

    writeClaim({
      address: AIRDROP_CONTRACT_ADDRESS,
      abi: MERKLE_AIRDROP_ABI,
      functionName: "claim",
      args: [entry.amount, proof as Hex[]],
    });
  };

  // 5. 提取剩余
  const handleWithdraw = () => {
    writeWithdraw({
      address: AIRDROP_CONTRACT_ADDRESS,
      abi: MERKLE_AIRDROP_ABI,
      functionName: "withdrawTokens",
      args: [],
    });
  };

  // ================= UI 渲染 =================

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Header */}
        <header className="flex flex-col md:flex-row justify-between items-center gap-4 border-b border-gray-800 pb-6">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
              高级空投管理台
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              动态列表管理 • 智能充值校验 • 实时状态追踪
            </p>
          </div>
          <ConnectButton />
        </header>

        {/* 全局加载提示 */}
        {isConfirming && (
          <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-blue-600 text-white px-6 py-3 rounded-full shadow-xl flex items-center gap-3 animate-pulse">
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
            <span>
              交易确认中 (
              {txType === "claim"
                ? "领取"
                : txType === "setRoot"
                  ? "同步根"
                  : "充值"}
              )...
            </span>
          </div>
        )}

        {!isConnected ? (
          <div className="text-center py-20 bg-gray-900 rounded-xl border border-gray-800">
            <p className="text-xl text-gray-400">请连接钱包以管理空投</p>
          </div>
        ) : (
          <>
            {/* 状态概览卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* 卡片 1: 资金状态 */}
              <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 shadow-lg">
                <h3 className="text-gray-400 text-sm font-medium mb-2">
                  合约代币余额
                </h3>
                <div
                  className={`text-2xl font-bold ${
                    contractBalance &&
                    contractBalance.value >= requiredTotalAmount
                      ? "text-green-400"
                      : "text-red-400"
                  }`}
                >
                  {contractBalance ? formatEther(contractBalance.value) : "0"}{" "}
                  <span className="text-sm text-gray-500">
                    {contractBalance?.symbol || "TOKEN"}
                  </span>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  需满足最低: {formatEther(requiredTotalAmount)}
                </div>
              </div>

              {/* 卡片 2: Merkle 状态 */}
              <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 shadow-lg">
                <h3 className="text-gray-400 text-sm font-medium mb-2">
                  Merkle Root 状态
                </h3>
                {isRootSynced ? (
                  <div className="flex items-center text-green-400 gap-2">
                    <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    <span className="font-bold">已同步</span>
                  </div>
                ) : (
                  <div className="flex items-center text-yellow-400 gap-2">
                    <span className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse"></span>
                    <span className="font-bold">待同步</span>
                  </div>
                )}
                <div className="mt-2 text-xs font-mono text-gray-600 break-all">
                  {chainRoot ? `${chainRoot.slice(0, 10)}...` : "未设置"}
                </div>
              </div>

              {/* 卡片 3: 统计 */}
              <div className="bg-gray-900 p-6 rounded-xl border border-gray-800 shadow-lg">
                <h3 className="text-gray-400 text-sm font-medium mb-2">
                  列表统计
                </h3>
                <div className="text-2xl font-bold text-white">
                  {airdropList.length}{" "}
                  <span className="text-sm text-gray-500">个地址</span>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  总计发放: {formatEther(requiredTotalAmount)}
                </div>
              </div>
            </div>

            {/* 管理员控制台 */}
            {isAdmin && (
              <section className="space-y-6">
                {/* 1. 充值区域 (带校验) */}
                <div className="bg-gray-900 p-6 rounded-xl border border-purple-900/30 shadow-lg">
                  <h2 className="text-xl font-bold text-purple-300 mb-4 flex items-center gap-2">
                    <span>💰 步骤 1: 充值代币</span>
                  </h2>

                  <div className="flex flex-col md:flex-row gap-4 items-end">
                    <div className="flex-1 w-full">
                      <label className="block text-xs text-gray-400 mb-1">
                        输入充值数量 (必须 ≥ 所需总量)
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={depositAmountInput}
                          onChange={(e) =>
                            setDepositAmountInput(e.target.value)
                          }
                          placeholder={`Min: ${formatEther(requiredTotalAmount)}`}
                          className={`w-full bg-gray-950 border rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 transition-all
                            ${
                              isDepositValid
                                ? "border-green-800 focus:ring-green-900 text-green-100"
                                : "border-red-900 focus:ring-red-900 text-red-100"
                            }`}
                        />
                        <span className="absolute right-4 top-3.5 text-gray-500 text-sm">
                          {contractBalance?.symbol || "TOKEN"}
                        </span>
                      </div>
                      {!isDepositValid && depositAmountInput && (
                        <p className="text-red-400 text-xs mt-2">
                          ❌ 数量不足！当前列表需要至少{" "}
                          <strong>{formatEther(requiredTotalAmount)}</strong>。
                        </p>
                      )}
                      {isDepositValid && (
                        <p className="text-green-400 text-xs mt-2">
                          ✅ 数量充足，覆盖需求后剩余:{" "}
                          {formatEther(
                            parseEther(depositAmountInput) -
                              requiredTotalAmount,
                          )}
                        </p>
                      )}
                    </div>

                    <button
                      onClick={handleDeposit}
                      disabled={!isDepositValid || isConfirming}
                      className="px-8 py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-gray-800 disabled:text-gray-500 text-white font-bold rounded-lg transition-all shadow-lg whitespace-nowrap"
                    >
                      {isConfirming && txType === "deposit"
                        ? "确认中..."
                        : "确认充值"}
                    </button>
                  </div>
                </div>

                {/* 2. 列表管理与同步 */}
                <div className="bg-gray-900 p-6 rounded-xl border border-blue-900/30 shadow-lg overflow-hidden">
                  <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-blue-300">
                      步骤 2: 管理列表 & 同步
                    </h2>
                    <button
                      onClick={handleAddEntry}
                      className="px-4 py-2 bg-blue-900/50 text-blue-300 border border-blue-800 rounded-lg hover:bg-blue-900 transition-colors text-sm font-medium"
                    >
                      + 添加地址
                    </button>
                  </div>

                  {/* 列表表格 */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-gray-950 text-gray-400 uppercase text-xs">
                        <tr>
                          <th className="px-4 py-3 rounded-l-lg">地址</th>
                          <th className="px-4 py-3">数量</th>
                          <th className="px-4 py-3">状态</th>
                          <th className="px-4 py-3 rounded-r-lg text-right">
                            操作
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        {airdropList.map((entry, index) => {
                          const claimStatus = contractsQuery.data?.[index];
                          const hasClaimed = claimStatus?.result === true;

                          return (
                            <tr
                              key={entry.id}
                              className="hover:bg-gray-800/50 transition-colors"
                            >
                              <td className="px-4 py-3">
                                <input
                                  type="text"
                                  value={entry.address}
                                  onChange={(e) =>
                                    handleUpdateEntry(
                                      entry.id,
                                      "address",
                                      e.target.value,
                                    )
                                  }
                                  placeholder="0x..."
                                  className="w-full bg-transparent border-b border-gray-700 focus:border-blue-500 focus:outline-none text-gray-300 font-mono text-xs pb-1"
                                />
                              </td>
                              <td className="px-4 py-3">
                                <input
                                  type="text"
                                  value={formatEther(entry.amount)}
                                  onChange={(e) =>
                                    handleUpdateEntry(
                                      entry.id,
                                      "amount",
                                      e.target.value,
                                    )
                                  }
                                  className="w-24 bg-transparent border-b border-gray-700 focus:border-blue-500 focus:outline-none text-gray-300 text-xs pb-1"
                                />
                              </td>
                              <td className="px-4 py-3">
                                {hasClaimed ? (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-900/30 text-green-400 border border-green-800">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                                    已领取
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-800 text-gray-400 border border-gray-700">
                                    <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span>
                                    未领取
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  onClick={() => handleRemoveEntry(entry.id)}
                                  className="text-red-400 hover:text-red-300 text-xs font-medium transition-colors"
                                >
                                  删除
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                        {airdropList.length === 0 && (
                          <tr>
                            <td
                              colSpan={4}
                              className="px-4 py-8 text-center text-gray-500 italic"
                            >
                              列表为空，请点击"添加地址"
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* 同步按钮区域 */}
                  <div className="mt-6 pt-4 border-t border-gray-800 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="text-sm text-gray-400">
                      本地 Root:{" "}
                      <span className="font-mono text-xs text-blue-300">
                        {currentRoot
                          ? `${currentRoot.slice(0, 10)}...`
                          : "计算中..."}
                      </span>
                    </div>
                    <button
                      onClick={handleSyncRoot}
                      disabled={
                        !currentRoot ||
                        isRootSynced ||
                        isConfirming ||
                        (contractBalance?.value || 0n) < requiredTotalAmount
                      }
                      className={`px-8 py-3 rounded-lg font-bold shadow-lg transition-all flex items-center gap-2
                        ${
                          isRootSynced
                            ? "bg-green-900/20 text-green-500 cursor-default border border-green-900"
                            : (contractBalance?.value || 0n) <
                                requiredTotalAmount
                              ? "bg-gray-800 text-gray-500 cursor-not-allowed"
                              : "bg-blue-600 hover:bg-blue-500 text-white hover:-translate-y-0.5"
                        }`}
                    >
                      {isConfirming && txType === "setRoot" ? (
                        <span>同步中...</span>
                      ) : isRootSynced ? (
                        <>
                          <span>✅ 已同步至链上</span>
                        </>
                      ) : (contractBalance?.value || 0n) <
                        requiredTotalAmount ? (
                        <span>⚠️ 余额不足，无法同步</span>
                      ) : (
                        <span>🚀 同步 Merkle Root 到合约</span>
                      )}
                    </button>
                  </div>
                </div>

                {/* 提取剩余 */}
                <div className="flex justify-end">
                  <button
                    onClick={handleWithdraw}
                    disabled={isConfirming}
                    className="text-xs text-red-400 hover:text-red-300 underline decoration-red-900 underline-offset-4"
                  >
                    提取合约内剩余代币
                  </button>
                </div>
              </section>
            )}

            {/* 用户领取区域 */}
            <section className="bg-gray-900 p-6 rounded-xl border border-gray-800 shadow-lg">
              <h2 className="text-xl font-bold text-green-300 mb-6">
                我的空投状态
              </h2>

              {isConnected && address ? (
                (() => {
                  const myEntry = airdropList.find(
                    (e) => e.address.toLowerCase() === address.toLowerCase(),
                  );
                  if (!myEntry) {
                    return (
                      <div className="text-center py-10 text-gray-500 bg-gray-950/50 rounded-lg border border-gray-800">
                        <p>😕 当前地址不在空投列表中</p>
                        {isAdmin && (
                          <p className="text-xs mt-2 text-gray-600">
                            (请在上方列表中添加此地址)
                          </p>
                        )}
                      </div>
                    );
                  }

                  const index = airdropList.indexOf(myEntry);
                  const hasClaimed =
                    contractsQuery.data?.[index]?.result === true;

                  if (hasClaimed) {
                    return (
                      <div className="flex items-center gap-4 p-6 bg-green-900/20 border border-green-800 rounded-lg">
                        <div className="p-3 bg-green-500/20 rounded-full">
                          <svg
                            className="w-8 h-8 text-green-400"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M5 13l4 4L19 7"
                            ></path>
                          </svg>
                        </div>
                        <div>
                          <p className="text-xl font-bold text-green-400">
                            领取成功!
                          </p>
                          <p className="text-sm text-green-300/80">
                            您已领取 {formatEther(myEntry.amount)}{" "}
                            {contractBalance?.symbol}
                          </p>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center p-4 bg-gray-950 rounded-lg border border-gray-800">
                        <span className="text-gray-400">可领取金额</span>
                        <span className="text-2xl font-bold text-white">
                          {formatEther(myEntry.amount)}
                        </span>
                      </div>

                      {!isRootSynced ? (
                        <button
                          disabled
                          className="w-full py-4 bg-gray-800 text-gray-500 rounded-lg cursor-not-allowed"
                        >
                          ⏳ 等待管理员同步 Merkle Root
                        </button>
                      ) : (
                        <button
                          onClick={() => handleClaim(myEntry)}
                          disabled={isConfirming}
                          className="w-full py-4 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg shadow-lg hover:-translate-y-1 transition-all"
                        >
                          {isConfirming && txType === "claim"
                            ? "确认交易中..."
                            : "立即领取"}
                        </button>
                      )}
                    </div>
                  );
                })()
              ) : (
                <p className="text-gray-500 text-center">连接钱包查看资格</p>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
