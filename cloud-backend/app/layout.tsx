import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "佳和盛达 · 私有经营后台",
  description: "登录后管理客户跟进、实际工时、回款流水与设备档期。",
  robots: { index: false, follow: false },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
