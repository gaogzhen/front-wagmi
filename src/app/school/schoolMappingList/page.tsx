"use client";

import { useState, useEffect } from "react";
import {
  useConnection,
  useConnect,
  useDisconnect,
  useChainId,
  useChains,
  useReadContract,
  useWriteContract,
  useBalance,
} from "wagmi";
import { injected } from "wagmi/connectors";
import { formatEther } from "viem";

// 导入合约ABI（请确保路径正确）
import SchoolMappingList_ABI from "@/contracts/SchoolMappingList.json";

// 导入 Filebase 服务及本地存储工具
import { uploadJSON, generateFileName, fetchJSON } from "@/services/filebase";
import {
  saveStudentInfo,
  getStudentInfo,
  removeStudentInfo,
} from "@/utils/storage";

// 导入地址生成工具
import {
  generateRandomWallet,
  deriveAddressFromMnemonic,
  isValidAddress,
} from "@/utils/addressGenerator";

// 合约地址（请替换为实际部署地址）
const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

// 每页显示条数
const PAGE_SIZE = 5;

// 学生行组件（显示姓名、余额、删除按钮）
function StudentRow({
  address,
  onDelete,
}: {
  address: `0x${string}`;
  onDelete: (addr: `0x${string}`) => void;
}) {
  const { data: balance } = useBalance({ address });
  const [name, setName] = useState<string>("");
  const [loadingName, setLoadingName] = useState(true);

  // 从 Filebase 加载学生姓名
  useEffect(() => {
    const loadName = async () => {
      try {
        const info = getStudentInfo(address);
        if (!info?.fileName) {
          setLoadingName(false);
          return;
        }
        const metadata = await fetchJSON(info.fileName);
        setName(metadata.name || "未知");
      } catch (error) {
        console.error(`加载学生 ${address} 信息失败:`, error);
        setName("加载失败");
      } finally {
        setLoadingName(false);
      }
    };
    loadName();
  }, [address]);

  return (
    <tr className="border-b hover:bg-gray-50">
      <td className="py-3 px-4 font-mono text-sm">{address}</td>
      <td className="py-3 px-4">{loadingName ? "加载中..." : name}</td>
      <td className="py-3 px-4 text-right">
        {balance ? formatEther(balance.value) : "..."} {balance?.symbol}
      </td>
      <td className="py-3 px-4 text-center">
        <button
          onClick={() => onDelete(address)}
          className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm transition-colors"
        >
          删除
        </button>
      </td>
    </tr>
  );
}

export default function SchoolMappingList() {
  // 钱包连接
  const { address, isConnected } = useConnection();
  const { mutate: connect } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const chainId = useChainId();
  const chains = useChains();
  const currentChain = chains.find((chain) => chain.id === chainId);

  // 分页与表单状态
  const [currentPage, setCurrentPage] = useState(1);
  const [newStudentAddress, setNewStudentAddress] = useState("");
  const [newStudentName, setNewStudentName] = useState("");

  // 地址生成器 UI 状态
  const [showGenerator, setShowGenerator] = useState(false);
  const [mnemonicInput, setMnemonicInput] = useState("");
  const [derivedAddress, setDerivedAddress] = useState("");
  const [derivationIndex, setDerivationIndex] = useState(0);
  const [generatedMnemonic, setGeneratedMnemonic] = useState("");
  // 存储当前派生所使用的助记词（用于后续保存）
  const [currentMnemonic, setCurrentMnemonic] = useState<string | undefined>();

  // 读取学生地址列表
  const { data: studentList, refetch: refetchStudents } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: SchoolMappingList_ABI,
    functionName: "getStudents",
    query: { enabled: isConnected },
  });

  // 写入操作：添加学生
  const { mutate: addStudent, isPending: isAdding } = useWriteContract({
    mutation: {
      onSuccess: () => {
        refetchStudents();
        setNewStudentAddress("");
        setNewStudentName("");
        // 清空助记词
        setCurrentMnemonic(undefined);
        setDerivedAddress("");
      },
    },
  });

  // 写入操作：删除学生
  const { mutate: removeStudent } = useWriteContract({
    mutation: {
      onSuccess: (_, variables) => {
        if (variables?.args?.[0]) {
          removeStudentInfo(variables.args[0] as `0x${string}`);
        }
        refetchStudents();
      },
    },
  });

  // 处理添加学生：上传元数据（包含助记词） → 保存本地映射（包含助记词） → 调用合约
  const handleAddStudent = async () => {
    if (!newStudentAddress || !newStudentName) {
      alert("请填写地址和姓名");
      return;
    }

    if (!isValidAddress(newStudentAddress)) {
      alert("无效的以太坊地址");
      return;
    }

    try {
      // 1. 准备元数据并上传到 Filebase（包含助记词，如果有）
      const metadata = {
        name: newStudentName,
        address: newStudentAddress,
        createdAt: new Date().toISOString(),
        mnemonic: currentMnemonic, // 如果有助记词则保存，否则 undefined
      };
      const fileName = generateFileName(newStudentAddress);
      await uploadJSON(metadata, fileName);

      // 2. 保存到本地存储（关联地址、文件名和助记词）
      saveStudentInfo(
        newStudentAddress,
        newStudentName,
        fileName,
        currentMnemonic,
      );

      // 3. 调用合约添加地址
      addStudent({
        address: CONTRACT_ADDRESS,
        abi: SchoolMappingList_ABI,
        functionName: "addStudent",
        args: [newStudentAddress as `0x${string}`],
      });

      // 注意：清空状态已在 onSuccess 中处理，这里不再重复
    } catch (error) {
      console.error("添加学生失败:", error);
      alert("添加失败，请检查控制台");
    }
  };

  // 处理删除学生
  const handleDeleteStudent = (studentAddr: `0x${string}`) => {
    removeStudent({
      address: CONTRACT_ADDRESS,
      abi: SchoolMappingList_ABI,
      functionName: "removeStudent",
      args: [studentAddr],
    });
  };

  // 生成随机助记词并派生地址
  const handleGenerateNew = () => {
    const { mnemonic, address } = generateRandomWallet();
    setGeneratedMnemonic(mnemonic);
    setDerivedAddress(address);
    setMnemonicInput(mnemonic);
    setCurrentMnemonic(mnemonic); // 保存助记词
  };

  // 从输入的助记词派生地址
  const handleDerive = () => {
    try {
      const { address } = deriveAddressFromMnemonic(
        mnemonicInput,
        derivationIndex,
      );
      setDerivedAddress(address);
      setCurrentMnemonic(mnemonicInput); // 保存助记词
    } catch {
      alert("无效的助记词");
    }
  };

  // 使用派生地址
  const handleUseDerived = () => {
    setNewStudentAddress(derivedAddress);
    setShowGenerator(false);
  };

  // 学生列表数据
  const students = (studentList as readonly `0x${string}`[]) || [];

  // 当学生列表长度变化时重置到第一页
  useEffect(() => {
    setCurrentPage(1);
  }, [students.length]);

  // 分页计算
  const totalPages = Math.ceil(students.length / PAGE_SIZE);
  const paginatedStudents = students.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-center">
          学生管理 (SchoolMappingList)
        </h1>

        {/* 钱包连接卡片 */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          {!isConnected ? (
            <button
              onClick={() => connect({ connector: injected() })}
              className="w-full bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600 transition-colors"
            >
              连接 MetaMask
            </button>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-gray-600">钱包地址:</p>
                <p className="font-mono break-all">{address}</p>
              </div>
              <div>
                <p className="text-gray-600">当前网络:</p>
                <p className="font-mono">
                  {currentChain?.name || "未知网络"} (Chain ID: {chainId})
                </p>
              </div>
              <button
                onClick={() => disconnect()}
                className="bg-red-500 text-white py-2 px-4 rounded hover:bg-red-600 transition-colors"
              >
                断开连接
              </button>
            </div>
          )}
        </div>

        {isConnected && (
          <>
            {/* 添加学生区域 */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">添加学生</h2>
                <button
                  onClick={() => setShowGenerator(!showGenerator)}
                  className="text-blue-500 hover:text-blue-700 text-sm flex items-center gap-1"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  {showGenerator ? "隐藏地址生成器" : "从助记词生成地址"}
                </button>
              </div>

              {/* 地址生成器面板 */}
              {showGenerator && (
                <div className="bg-gray-50 p-4 rounded-lg mb-4 border border-gray-200">
                  <h3 className="font-medium mb-3">地址生成器</h3>
                  <div className="mb-4">
                    <button
                      onClick={handleGenerateNew}
                      className="bg-purple-500 hover:bg-purple-600 text-white px-4 py-2 rounded text-sm"
                    >
                      随机生成新助记词
                    </button>
                    {generatedMnemonic && (
                      <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
                        <p className="text-xs text-gray-600">
                          新生成的助记词（请安全保存）:
                        </p>
                        <p className="font-mono text-sm break-all">
                          {generatedMnemonic}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm text-gray-600 mb-1">
                        助记词
                      </label>
                      <textarea
                        value={mnemonicInput}
                        onChange={(e) => setMnemonicInput(e.target.value)}
                        placeholder="输入12/24个单词，用空格分隔"
                        className="w-full border rounded px-3 py-2 text-sm font-mono"
                        rows={2}
                      />
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="block text-sm text-gray-600 mb-1">
                          索引
                        </label>
                        <input
                          type="number"
                          value={derivationIndex}
                          onChange={(e) =>
                            setDerivationIndex(parseInt(e.target.value) || 0)
                          }
                          min="0"
                          className="w-full border rounded px-3 py-2"
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          onClick={handleDerive}
                          className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
                        >
                          派生
                        </button>
                      </div>
                    </div>

                    {derivedAddress && (
                      <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded">
                        <p className="text-sm text-gray-600">派生地址:</p>
                        <p className="font-mono text-sm break-all">
                          {derivedAddress}
                        </p>
                        <button
                          onClick={handleUseDerived}
                          className="mt-2 bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-sm"
                        >
                          使用此地址添加学生
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 text-xs text-gray-500 border-t pt-2">
                    ⚠️
                    安全提示：助记词等同于私钥，请勿泄露。所有操作在本地完成，但助记词会存储在浏览器本地存储和
                    Filebase 云端，存在安全风险，请谨慎使用。
                  </div>
                </div>
              )}

              {/* 输入表单 */}
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={newStudentAddress}
                  onChange={(e) => setNewStudentAddress(e.target.value)}
                  placeholder="学生地址 (0x...)"
                  className="flex-1 border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <input
                  type="text"
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  placeholder="学生姓名"
                  className="flex-1 border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-300"
                />
                <button
                  onClick={handleAddStudent}
                  disabled={isAdding}
                  className="bg-green-500 hover:bg-green-600 text-white px-6 py-2 rounded disabled:opacity-50 transition-colors whitespace-nowrap"
                >
                  {isAdding ? "添加中..." : "添加"}
                </button>
              </div>
              <p className="text-sm text-gray-500 mt-2">
                当前学生总数: {students.length}
              </p>
            </div>

            {/* 学生列表表格 */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">学生列表</h2>
              {students.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  暂无学生地址，请添加
                </p>
              ) : (
                <>
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b-2">
                        <th className="py-3 px-4">学生地址</th>
                        <th className="py-3 px-4">姓名</th>
                        <th className="py-3 px-4 text-right">余额</th>
                        <th className="py-3 px-4 text-center">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedStudents.map((studentAddr) => (
                        <StudentRow
                          key={studentAddr}
                          address={studentAddr}
                          onDelete={handleDeleteStudent}
                        />
                      ))}
                    </tbody>
                  </table>

                  {/* 分页控件 */}
                  {totalPages > 1 && (
                    <div className="flex justify-center items-center gap-4 mt-6">
                      <button
                        onClick={() =>
                          setCurrentPage((p) => Math.max(1, p - 1))
                        }
                        disabled={currentPage === 1}
                        className="px-4 py-2 border rounded disabled:opacity-50 hover:bg-gray-50"
                      >
                        上一页
                      </button>
                      <span className="text-sm">
                        第 {currentPage} 页 / 共 {totalPages} 页
                      </span>
                      <button
                        onClick={() =>
                          setCurrentPage((p) => Math.min(totalPages, p + 1))
                        }
                        disabled={currentPage === totalPages}
                        className="px-4 py-2 border rounded disabled:opacity-50 hover:bg-gray-50"
                      >
                        下一页
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
