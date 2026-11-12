import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 规格第 11 节：密钥只在服务端，禁止把 server-only 依赖打进客户端 bundle。
  serverExternalPackages: ["@supabase/supabase-js"],
  poweredByHeader: false,
};

export default nextConfig;
