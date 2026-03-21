"use client";

import { useState, useEffect } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useBalance,
} from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { formatEther } from "viem";

// shadcn/ui 组件
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationLink,
} from "@/components/ui/pagination";

// 合约 ABI 和工具
import SchoolMappingList_ABI from "@/contracts/SchoolMappingList.json";
import { uploadJSON, generateFileName, fetchJSON } from "@/services/filebase";
import {
  saveStudentInfo,
  getStudentInfo,
  removeStudentInfo,
} from "@/utils/storage";
import {
  generateRandomWallet,
  deriveAddressFromMnemonic,
  isValidAddress,
} from "@/utils/addressGenerator";

const CONTRACT_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3"; // 替换为实际地址
const PAGE_SIZE = 5;

// 学生行组件
function StudentRow({
  address,
  onDelete,
}: {
  address: `0x${string}`;
  onDelete: (addr: `0x${string}`) => void;
}) {
  const { data: balance } = useBalance({ address });
  const [name, setName] = useState("");
  const [loadingName, setLoadingName] = useState(true);

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
      } catch {
        setName("加载失败");
      } finally {
        setLoadingName(false);
      }
    };
    loadName();
  }, [address]);

  return (
    <TableRow>
      <TableCell className="font-mono text-sm">{address}</TableCell>
      <TableCell>{loadingName ? "加载中..." : name}</TableCell>
      <TableCell className="text-right">
        {balance ? formatEther(balance.value) : "..."} {balance?.symbol}
      </TableCell>
      <TableCell className="text-center">
        <Button
          variant="destructive"
          size="sm"
          onClick={() => onDelete(address)}
        >
          删除
        </Button>
      </TableCell>
    </TableRow>
  );
}

export default function SchoolMappingListClient() {
  // 使用 useAccount 获取连接状态
  const { address, isConnected } = useAccount();

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
  const [currentMnemonic, setCurrentMnemonic] = useState<string | undefined>();

  // 读取学生地址列表
  const { data: studentList, refetch: refetchStudents } = useReadContract({
    address: CONTRACT_ADDRESS,
    abi: SchoolMappingList_ABI,
    functionName: "getStudents",
    query: { enabled: isConnected },
  });

  // 添加学生（wagmi 2.x 用法）
  const { writeContract: addStudent, isPending: isAdding } = useWriteContract({
    mutation: {
      onSuccess: () => {
        refetchStudents();
        setNewStudentAddress("");
        setNewStudentName("");
        setCurrentMnemonic(undefined);
        setDerivedAddress("");
      },
      onError: (error) => {
        console.error("添加学生失败:", error);
        alert(`交易失败: ${error.message}`);
      },
    },
  });

  // 删除学生
  const { writeContract: removeStudent } = useWriteContract({
    mutation: {
      onSuccess: (_, variables) => {
        if (variables?.args?.[0]) {
          removeStudentInfo(variables.args[0] as `0x${string}`);
        }
        refetchStudents();
      },
    },
  });

  // 添加学生处理函数
  const handleAddStudent = async () => {
    if (!newStudentAddress || !newStudentName) {
      alert("请填写地址和姓名");
      return;
    }
    if (!isValidAddress(newStudentAddress)) {
      alert("无效的以太坊地址");
      return;
    }

    console.log("用户输入的地址:", newStudentAddress);
    console.log("当前钱包地址:", address);
    try {
      const metadata = {
        name: newStudentName,
        address: newStudentAddress,
        createdAt: new Date().toISOString(),
        mnemonic: currentMnemonic,
      };
      const fileName = generateFileName(newStudentAddress);
      await uploadJSON(metadata, fileName);
      saveStudentInfo(
        newStudentAddress,
        newStudentName,
        fileName,
        currentMnemonic,
      );

      addStudent({
        address: CONTRACT_ADDRESS,
        abi: SchoolMappingList_ABI,
        functionName: "addStudent",
        args: [newStudentAddress as `0x${string}`],
      });
    } catch (error) {
      console.error("添加失败", error);
      alert("添加失败，请查看控制台");
    }
  };

  // 删除学生
  const handleDeleteStudent = (studentAddr: `0x${string}`) => {
    removeStudent({
      address: CONTRACT_ADDRESS,
      abi: SchoolMappingList_ABI,
      functionName: "removeStudent",
      args: [studentAddr],
    });
  };

  // 生成随机助记词
  const handleGenerateNew = () => {
    const { mnemonic, address } = generateRandomWallet();
    setGeneratedMnemonic(mnemonic);
    setDerivedAddress(address);
    setMnemonicInput(mnemonic);
    setCurrentMnemonic(mnemonic);
  };

  // 从助记词派生地址
  const handleDerive = () => {
    try {
      const { address } = deriveAddressFromMnemonic(
        mnemonicInput,
        derivationIndex,
      );
      setDerivedAddress(address);
      setCurrentMnemonic(mnemonicInput);
    } catch {
      alert("无效的助记词");
    }
  };

  // 使用派生地址
  const handleUseDerived = () => {
    setNewStudentAddress(derivedAddress);
    setShowGenerator(false);
  };

  const students = (studentList as readonly `0x${string}`[]) || [];

  // 当学生列表长度变化时重置到第一页
  useEffect(() => {
    setCurrentPage(1);
  }, [students.length]);

  const totalPages = Math.ceil(students.length / PAGE_SIZE);
  const paginatedStudents = students.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-8 text-center">学生管理</h1>

        {/* RainbowKit 连接按钮区域 */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8 flex justify-between items-center">
          <div>
            <p className="text-gray-600">钱包连接状态</p>
            <p className="text-sm text-gray-500">
              连接状态: {isConnected ? "✅ 已连接" : "❌ 未连接"}
            </p>
          </div>
          <ConnectButton />
        </div>

        {isConnected && (
          <>
            {/* 添加学生区域 */}
            <div className="bg-white rounded-lg shadow-md p-6 mb-8">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold">添加学生</h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowGenerator(!showGenerator)}
                  className="flex items-center gap-1"
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
                </Button>
              </div>

              {/* 地址生成器面板 */}
              {showGenerator && (
                <div className="bg-gray-50 p-4 rounded-lg mb-4 border border-gray-200">
                  <h3 className="font-medium mb-3">地址生成器</h3>
                  <div className="mb-4">
                    <Button
                      onClick={handleGenerateNew}
                      variant="secondary"
                      size="sm"
                    >
                      随机生成新助记词
                    </Button>
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
                        <Input
                          type="number"
                          value={derivationIndex}
                          onChange={(e) =>
                            setDerivationIndex(parseInt(e.target.value) || 0)
                          }
                          min="0"
                        />
                      </div>
                      <div className="flex items-end">
                        <Button onClick={handleDerive}>派生</Button>
                      </div>
                    </div>

                    {derivedAddress && (
                      <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded">
                        <p className="text-sm text-gray-600">派生地址:</p>
                        <p className="font-mono text-sm break-all">
                          {derivedAddress}
                        </p>
                        <Button
                          onClick={handleUseDerived}
                          variant="outline"
                          size="sm"
                          className="mt-2"
                        >
                          使用此地址添加学生
                        </Button>
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

              {/* 添加表单 */}
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  type="text"
                  value={newStudentAddress}
                  onChange={(e) => setNewStudentAddress(e.target.value)}
                  placeholder="学生地址 (0x...)"
                  className="flex-1"
                />
                <Input
                  type="text"
                  value={newStudentName}
                  onChange={(e) => setNewStudentName(e.target.value)}
                  placeholder="学生姓名"
                  className="flex-1"
                />
                <Button
                  onClick={handleAddStudent}
                  disabled={isAdding}
                  className="whitespace-nowrap"
                >
                  {isAdding ? "添加中..." : "添加"}
                </Button>
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
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>学生地址</TableHead>
                        <TableHead>姓名</TableHead>
                        <TableHead className="text-right">余额</TableHead>
                        <TableHead className="text-center">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedStudents.map((studentAddr) => (
                        <StudentRow
                          key={studentAddr}
                          address={studentAddr}
                          onDelete={handleDeleteStudent}
                        />
                      ))}
                    </TableBody>
                  </Table>

                  {/* 分页控件 */}
                  {totalPages > 1 && (
                    <Pagination className="mt-6">
                      <PaginationContent>
                        <PaginationItem>
                          <PaginationPrevious
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              setCurrentPage((p) => Math.max(1, p - 1));
                            }}
                            isActive={currentPage === 1 ? false : undefined}
                            className={
                              currentPage === 1
                                ? "pointer-events-none opacity-50"
                                : ""
                            }
                          />
                        </PaginationItem>
                        {Array.from(
                          { length: totalPages },
                          (_, i) => i + 1,
                        ).map((page) => (
                          <PaginationItem key={page}>
                            <PaginationLink
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                setCurrentPage(page);
                              }}
                              isActive={currentPage === page}
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        ))}
                        <PaginationItem>
                          <PaginationNext
                            href="#"
                            onClick={(e) => {
                              e.preventDefault();
                              setCurrentPage((p) =>
                                Math.min(totalPages, p + 1),
                              );
                            }}
                            className={
                              currentPage === totalPages
                                ? "pointer-events-none opacity-50"
                                : ""
                            }
                          />
                        </PaginationItem>
                      </PaginationContent>
                    </Pagination>
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
