// utils/storage.ts

// 本地存储的键名
const STORAGE_KEY = "studentMetadata";

// 学生元数据类型定义（包含可选的助记词）
export interface StudentMetadata {
  name: string; // 学生姓名
  fileName: string; // 存储在 Filebase 中的文件名（例如 students/0x123...json）
  mnemonic?: string; // 可选：生成该地址所用的助记词
}

/**
 * 获取所有学生信息的映射表
 * 键为学生地址（统一转为小写），值为 StudentMetadata 对象
 * @returns 映射表对象
 */
export function getMetadataMap(): Record<string, StudentMetadata> {
  // 服务端渲染时避免访问 localStorage
  if (typeof window === "undefined") {
    return {};
  }
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : {};
}

/**
 * 保存单个学生的信息到本地存储
 * @param address 学生钱包地址
 * @param name 学生姓名
 * @param fileName Filebase 中的文件名
 * @param mnemonic 可选助记词
 */
export function saveStudentInfo(
  address: string,
  name: string,
  fileName: string,
  mnemonic?: string,
): void {
  const map = getMetadataMap();
  map[address.toLowerCase()] = { name, fileName, mnemonic };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

/**
 * 获取单个学生的信息
 * @param address 学生钱包地址
 * @returns 学生信息对象，如果不存在则返回 null
 */
export function getStudentInfo(address: string): StudentMetadata | null {
  const map = getMetadataMap();
  return map[address.toLowerCase()] || null;
}

/**
 * 移除单个学生的信息
 * @param address 学生钱包地址
 */
export function removeStudentInfo(address: string): void {
  const map = getMetadataMap();
  delete map[address.toLowerCase()];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}
