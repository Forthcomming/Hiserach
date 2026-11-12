import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "同境检索 · 同类人口碑 MVP",
  description: "同类人口碑检索：Agent 链路、确定性统计与可追溯证据链",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body style={{ margin: 0, background: "#fff", color: "#1a1a1a" }}>{children}</body>
    </html>
  );
}
