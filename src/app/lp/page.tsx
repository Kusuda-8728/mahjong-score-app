import Link from "next/link";

export const metadata = {
  title: "みんなの麻雀スコア | 簡単・共有・分析で麻雀をもっと楽しく",
  description:
    "面倒な計算は不要。フレンドと対局履歴を共有。詳細な戦績分析で自分の強み・弱みが見える。スマホ最適化の麻雀スコア管理アプリ。",
};

export default function LpPage() {
  return (
    <div className="overflow-x-hidden">
      {/* Hero Section */}
      <section className="relative bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 px-4 py-16 sm:py-24 md:py-32">
        {/* 牌風の装飾 */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -right-32 -top-32 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl" />
          <div className="absolute -bottom-32 -left-32 h-64 w-64 rounded-full bg-red-500/5 blur-3xl" />
          <div className="absolute right-1/2 top-1/4 h-48 w-48 rounded-full bg-amber-500/5 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-5xl text-center">
          <p className="mb-4 text-sm font-medium tracking-wider text-emerald-400">
            麻雀スコア管理の新しいスタンダード
          </p>
          <h1 className="mb-6 text-4xl font-bold tracking-tight text-white sm:text-5xl md:text-6xl">
            みんなの
            <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
              麻雀スコア
            </span>
          </h1>
          <p className="mx-auto mb-10 max-w-2xl text-lg text-zinc-400 sm:text-xl">
            簡単入力・フレンド共有・スマホ最適化。
            <br className="hidden sm:block" />
            面倒な計算はもう不要。麻雀をもっと楽しく、もっと深く。
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-8 py-4 text-base font-semibold text-white shadow-lg shadow-emerald-500/25 transition-all hover:bg-emerald-400 hover:shadow-emerald-500/40"
          >
            今すぐ無料で使う
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
          </Link>
        </div>
      </section>

      {/* Features Section */}
      <section className="border-y border-zinc-800/50 bg-zinc-950 px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-12 text-center text-2xl font-bold text-white sm:text-3xl">
            麻雀愛好家のための、<span className="text-emerald-400">3つの理由</span>
          </h2>
          <div className="grid gap-8 md:grid-cols-3">
            {/* 1. 手軽さ */}
            <div className="group rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 transition-all hover:border-emerald-500/50 hover:bg-zinc-900">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
                <svg
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
              <h3 className="mb-2 text-lg font-semibold text-white">手軽さ</h3>
              <p className="text-zinc-400">
                面倒な計算は不要。直感的な入力画面で、対局中もサクサク記録。ウマ・オカ・チップも自動計算で、終了後にすぐ結果を共有できる。
              </p>
            </div>

            {/* 2. ソーシャル性 */}
            <div className="group rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 transition-all hover:border-emerald-500/50 hover:bg-zinc-900">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/20 text-amber-400">
                <svg
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              </div>
              <h3 className="mb-2 text-lg font-semibold text-white">
                ソーシャル性
              </h3>
              <p className="text-zinc-400">
                フレンド機能で対局履歴をリアルタイム共有。仲間との戦績をすぐ確認できる。麻雀会の記録共有もこれ一本で完結。
              </p>
            </div>

            {/* 3. 分析 */}
            <div className="group rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 transition-all hover:border-emerald-500/50 hover:bg-zinc-900">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400">
                <svg
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
              </div>
              <h3 className="mb-2 text-lg font-semibold text-white">分析</h3>
              <p className="text-zinc-400">
                詳細な戦績データで自分の強み・弱みを見える化。順位履歴グラフ、通算成績、1対1の対戦成績まで。ガチ勢も満足の分析機能。
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Screenshot Section */}
      <section className="bg-zinc-950 px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-6xl">
          <h2 className="mb-4 text-center text-2xl font-bold text-white sm:text-3xl">
            スマホに最適化された
            <span className="text-emerald-400">見やすい画面</span>
          </h2>
          <p className="mx-auto mb-12 max-w-xl text-center text-zinc-400">
            持ち運びやすいスマホで、いつでもどこでもスコア管理。
          </p>

          <div className="flex flex-wrap items-center justify-center gap-8 lg:gap-16">
            {/* スマホ枠 1 */}
            <div className="flex flex-col items-center">
              <div className="relative">
                <div className="rounded-[2.5rem] border-[10px] border-zinc-700 bg-zinc-800 p-2 shadow-2xl">
                  <div className="relative aspect-[9/19] w-[260px] overflow-hidden rounded-[1.5rem] sm:w-[280px]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/images/lp/screenshot-score.png"
                      alt="スコア入力画面"
                      className="h-full w-full object-cover object-top"
                    />
                  </div>
                </div>
                <div className="absolute -left-2 top-1/2 h-3 w-1 -translate-y-1/2 rounded-full bg-zinc-600" />
                <div className="absolute -right-2 top-[18%] h-8 w-1 rounded-full bg-zinc-600" />
                <div className="absolute -right-2 top-[28%] h-12 w-1 rounded-full bg-zinc-600" />
                <div className="absolute -right-2 top-[40%] h-12 w-1 rounded-full bg-zinc-600" />
              </div>
              <p className="mt-3 text-sm text-zinc-500">スコア入力</p>
            </div>

            {/* スマホ枠 2 */}
            <div className="flex flex-col items-center">
              <div className="relative">
                <div className="rounded-[2.5rem] border-[10px] border-zinc-700 bg-zinc-800 p-2 shadow-2xl">
                  <div className="relative aspect-[9/19] w-[260px] overflow-hidden rounded-[1.5rem] sm:w-[280px]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/images/lp/screenshot-stats.png"
                      alt="通算成績・対戦成績画面"
                      className="h-full w-full object-cover object-top"
                    />
                  </div>
                </div>
              </div>
              <p className="mt-3 text-sm text-zinc-500">対戦成績・分析</p>
            </div>

            {/* スマホ枠 3 */}
            <div className="flex flex-col items-center">
              <div className="relative">
                <div className="rounded-[2.5rem] border-[10px] border-zinc-700 bg-zinc-800 p-2 shadow-2xl">
                  <div className="relative aspect-[9/19] w-[260px] overflow-hidden rounded-[1.5rem] sm:w-[280px]">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/images/lp/screenshot-rank-history.png"
                      alt="順位履歴グラフ画面"
                      className="h-full w-full object-cover object-top"
                    />
                  </div>
                </div>
              </div>
              <p className="mt-3 text-sm text-zinc-500">順位履歴グラフ</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="border-t border-zinc-800/50 bg-gradient-to-b from-zinc-900 to-zinc-950 px-4 py-16 sm:py-24">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="mb-4 text-2xl font-bold text-white sm:text-3xl">
            さあ、今日の一戦を記録しよう
          </h2>
          <p className="mb-8 text-zinc-400">
            会員登録は無料。今すぐ始められます。
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-10 py-4 text-base font-semibold text-white shadow-lg shadow-emerald-500/25 transition-all hover:bg-emerald-400 hover:shadow-emerald-500/40"
          >
            今すぐ無料で使う
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 7l5 5m0 0l-5 5m5-5H6"
              />
            </svg>
          </Link>
        </div>
      </section>
    </div>
  );
}
