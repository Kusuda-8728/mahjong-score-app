import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppNav } from "@/components/AppNav";
import { AppFooter } from "@/components/AppFooter";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "https://mahjong-score-app-mu.vercel.app");

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: {
    default: "みんなの麻雀スコア | 麻雀スコア管理・共有アプリ",
    template: "%s | みんなの麻雀スコア",
  },
  description:
    "面倒な計算は不要。フレンドと対局履歴を共有。詳細な戦績分析で自分の強み・弱みが見える。スマホ最適化の麻雀スコア管理アプリ。",
  keywords: [
    "麻雀",
    "スコア",
    "スコア表",
    "成績管理",
    "麻雀アプリ",
    "麻雀記録",
    "スコア共有",
  ],
  openGraph: {
    title: "みんなの麻雀スコア | 麻雀スコア管理・共有アプリ",
    description:
      "簡単入力・フレンド共有・スマホ最適化。麻雀をもっと楽しく、もっと深く。",
    type: "website",
    locale: "ja_JP",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <meta
          name="google-site-verification"
          content="vUpt_WlSvdl8OKF8JO-XACVF8z2GqH2Z2oPs1Sv_Pc8"
        />
        <meta httpEquiv="Cache-Control" content="no-cache, no-store, must-revalidate" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen flex-col bg-black text-zinc-100 antialiased`}
      >
        <AppNav />
        <div className="flex-1">{children}</div>
        <AppFooter />
      </body>
    </html>
  );
}
