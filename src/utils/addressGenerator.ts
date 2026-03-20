// utils/addressGenerator.ts
import { ethers } from 'ethers';

/**
 * 生成随机钱包（助记词+地址+私钥）
 */
export function generateRandomWallet() {
  const wallet = ethers.Wallet.createRandom();
  return {
    mnemonic: wallet.mnemonic?.phrase || '',
    address: wallet.address,
    privateKey: wallet.privateKey,
  };
}

/**
 * 从助记词派生地址（BIP44路径 m/44'/60'/0'/0/index）
 */
export function deriveAddressFromMnemonic(mnemonic: string, index: number = 0) {
  if (!ethers.Mnemonic.isValidMnemonic(mnemonic)) {
    throw new Error('无效的助记词');
  }
  const path = `m/44'/60'/0'/0/${index}`;
  const hdNode = ethers.HDNodeWallet.fromMnemonic(
    ethers.Mnemonic.fromPhrase(mnemonic),
    path
  );
  return {
    address: hdNode.address,
    privateKey: hdNode.privateKey,
    path,
  };
}

/**
 * 验证以太坊地址格式
 */
export function isValidAddress(address: string): boolean {
  return ethers.isAddress(address);
}