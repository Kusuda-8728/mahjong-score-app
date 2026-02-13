"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "スコア表" },
  { href: "/profile", label: "プロフィール" },
  { href: "/friends", label: "フレンド" },
  { href: "/stats", label: "対戦成績" },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-zinc-800 bg-zinc-950/95 text-sm text-zinc-300 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3 sm:px-6">
        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span className="font-semibold text-zinc-200">麻雀スコア表</span>
          <span className="hidden sm:inline">Mahjong Score Manager</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {links.map((link) => {
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  active
                    ? "border-emerald-500/60 bg-emerald-600/20 text-emerald-200"
                    : "border-zinc-700/60 bg-zinc-900/60 hover:border-zinc-500 hover:text-zinc-100"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
