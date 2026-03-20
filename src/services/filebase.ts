// services/filebase.ts
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

// 从环境变量读取 Filebase 配置
const FILEBASE_CONFIG = {
  // Filebase S3 兼容端点
  endpoint: "https://s3.filebase.com",
  // Filebase 固定使用 us-east-1
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.NEXT_PUBLIC_FILEBASE_ACCESS_KEY || "",
    secretAccessKey: process.env.NEXT_PUBLIC_FILEBASE_SECRET_KEY || "",
  },
  bucket: process.env.NEXT_PUBLIC_FILEBASE_BUCKET || "student-metadata",
  // Filebase 需要强制 path style
  forcePathStyle: true,
};

const PREFIX_PATH = "student";

// 初始化 S3 客户端
const s3Client = new S3Client(FILEBASE_CONFIG);

/**
 * 将流对象转换为字符串 (用于 GetObjectCommand 的响应)
 */
async function streamToString(stream: any): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

/**
 * 根据学生地址生成 Filebase 中存储的文件名（统一放在 ${PREFIX_PATH}/ 目录下）
 * @param address 学生钱包地址
 * @returns 文件名 (例如: ${PREFIX_PATH}/0x123...abc.json)
 */
export function generateFileName(address: string): string {
  return `${PREFIX_PATH}/${address.toLowerCase()}.json`;
}

/**
 * 上传 JSON 对象到 Filebase
 * @param data 要存储的 JSON 对象
 * @param fileName 文件名（可选，若不传则自动生成）
 * @returns 上传成功后的文件公开访问 URL
 */
export async function uploadJSON(
  data: object,
  fileName?: string,
): Promise<string> {
  try {
    // 如果未传入文件名，则自动生成（基于当前时间戳和随机数）
    const actualFileName =
      fileName ||
      `${PREFIX_PATH}/${Date.now()}-${Math.random().toString(36).substring(7)}.json`;

    // 准备上传参数
    const command = new PutObjectCommand({
      Bucket: FILEBASE_CONFIG.bucket,
      Key: actualFileName,
      Body: JSON.stringify(data, null, 2),
      ContentType: "application/json",
      // 如果希望文件公开读取，可添加 ACL: "public-read"
      // ACL: "public-read",
    });

    await s3Client.send(command);

    // 返回文件的公开访问 URL（根据 Filebase 的访问方式构造）
    // 这里使用 S3 兼容的 URL 格式
    return `https://${FILEBASE_CONFIG.bucket}.s3.filebase.com/${actualFileName}`;
  } catch (error) {
    console.error("Filebase 上传失败:", error);
    throw new Error(
      `上传失败: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * 从 Filebase 读取 JSON 对象
 * @param fileName 文件名（例如 ${PREFIX_PATH}/0x123...abc.json）
 * @returns 解析后的 JSON 对象
 */
export async function fetchJSON(fileName: string): Promise<any> {
  try {
    const command = new GetObjectCommand({
      Bucket: FILEBASE_CONFIG.bucket,
      Key: fileName,
    });

    const response = await s3Client.send(command);
    const bodyContents = await streamToString(response.Body);
    return JSON.parse(bodyContents);
  } catch (error) {
    console.error("Filebase 读取失败:", error);
    throw new Error(
      `读取失败: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * 可选：从 Filebase 删除文件（若需要）
 */
export async function deleteFile(fileName: string): Promise<void> {
  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  try {
    const command = new DeleteObjectCommand({
      Bucket: FILEBASE_CONFIG.bucket,
      Key: fileName,
    });
    await s3Client.send(command);
  } catch (error) {
    console.error("Filebase 删除失败:", error);
    throw new Error(
      `删除失败: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
