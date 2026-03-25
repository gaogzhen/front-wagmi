import { MerkleTree } from "merkletreejs";
import { keccak256, encodePacked, getAddress } from "viem";

// 1. 定义适配 merkletreejs 的哈希函数
// merkletreejs 期望输入是 Buffer 或 string，输出是 Buffer 或 string
// viem 的 keccak256 输入是 hex 字符串，输出是 hex 字符串
const hashFunction = (data: Buffer | string): string => {
  // 确保输入是 hex 字符串格式 (如果传入 Buffer 需转换)
  const hexData = Buffer.isBuffer(data)
    ? "0x" + data.toString("hex")
    : data.toString();

  // 使用 viem 的 keccak256
  // 注意：如果 data 不是严格的 0x 前缀 hex，可能需要处理，但通常 encodePacked 输出带 0x
  return keccak256(hexData as `0x${string}`);
};

// 2. 生成叶子节点 (必须与 Solidity 完全一致)
export function getLeaf(address: string, amount: bigint): string {
  const addressHex = getAddress(address).toLowerCase() as `0x${string}`;

  // Solidity: abi.encodePacked(address, uint256)
  const packed = encodePacked(["address", "uint256"], [addressHex, amount]);

  // Solidity: keccak256(...)
  return keccak256(packed);
}

// 3. 生成树
export function generateMerkleTree(
  data: { address: string; amount: bigint }[],
) {
  const leaves = data.map((item) => getLeaf(item.address, item.amount));

  // 【关键点】这里必须传入 hashFunction (基于 keccak256)，而不是 SHA256
  return new MerkleTree(leaves, hashFunction, { sortPairs: true });
}

// 4. 获取证明
export function getProof(
  tree: MerkleTree,
  address: string,
  amount: bigint,
): string[] {
  const leaf = getLeaf(address, amount);
  // getHexProof 返回带 0x 的字符串数组，符合 wagmi/viem 要求
  return tree.getHexProof(leaf);
}
