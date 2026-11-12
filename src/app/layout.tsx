import type { Metadata, Viewport } from "next";
import "./figma.css";

export const metadata: Metadata = {
  title: "同类人口碑 · AI 搜",
  description: "把别人的经验，变成对你适用、可以验证的决策答案",
  icons: { icon: "/favicon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
