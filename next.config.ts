import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.101"], // 添加您的 IP 地址
};

export default nextConfig;
