"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AggregatePlayerStats,
  HistoryEntry,
  PlayerKey,
  fetchMatches,
  fetchPlayers,
  fetchUserProfile,
  normalizeHistoryEntries,
  PLAYER_KEYS,
  buildAggregateStats,
} from "@/lib/mahjong-api";
import { supabase } from "@/utils/supabase";

interface HeadToHeadStats {
  games: number;
  totalDiff: number;
  wins: number;
  draws: number;
  losses: number;
  avgRankSelf: number | null;
  avgRankOpponent: number | null;
}

export default function StatsPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null);

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [players, setPlayers] = useState<string[]>([]);
  const [selectedSelf, setSelectedSelf] = useState<string>("");
  const [selectedOpponent, setSelectedOpponent] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) {
        window.location.replace("/login");
        return;
      }
      const userId = session.user.id;
      setCurrentUser(userId);
      setAuthChecked(true);
      try {
        const [profile, fetchPlayersResult, matches] = await Promise.all([
          fetchUserProfile(userId),
          fetchPlayers(userId),
          fetchMatches(userId),
        ]);

        if (profile) {
          setUserDisplayName(profile.display_name);
          setSelectedSelf(profile.display_name);
        }

        const playerNames = Array.from(
          new Set([
            ...(fetchPlayersResult.map((p) => p.name) ?? []),
            ...(profile?.display_name ? [profile.display_name] : []),
          ])
        ).sort((a, b) => a.localeCompare(b, "ja"));
        setPlayers(playerNames);

        const entries = normalizeHistoryEntries(matches);
        setHistory(entries);
      } catch (e) {
        console.error("load stats data failed", e);
        setMessage("データの取得に失敗しました。");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const aggregateStats = useMemo(
    () => buildAggregateStats(history),
    [history]
  );

  const headToHeadStats = useMemo((): HeadToHeadStats | null => {
    if (!selectedSelf || !selectedOpponent || selectedSelf === selectedOpponent) {
      return null;
    }
    let games = 0;
    let totalDiff = 0;
    let wins = 0;
    let draws = 0;
    let losses = 0;
    let rankSumSelf = 0;
    let rankSumOpponent = 0;
    let rankCount = 0;

    history.forEach((entry) => {
      const snap = entry.snapshot;
      if (!snap.rows || !snap.playerNames) return;

      const playerEntries = PLAYER_KEYS.filter(
        (k) => snap.playerNames?.[k]?.trim()
      ).map((k) => ({
        key: k,
        name: snap.playerNames?.[k]?.trim() ?? k,
      }));

      const selfEntries = playerEntries.filter((p) => p.name === selectedSelf);
      const opponentEntries = playerEntries.filter(
        (p) => p.name === selectedOpponent
      );
      if (selfEntries.length === 0 || opponentEntries.length === 0) return;

      snap.rows.forEach((row) => {
        const selfKey = selfEntries[0]?.key;
        const opponentKey = opponentEntries[0]?.key;
        if (!selfKey || !opponentKey) return;

        const selfScore = row.scores?.[selfKey] ?? 0;
        const opponentScore = row.scores?.[opponentKey] ?? 0;
        const selfRank = row.ranks?.[selfKey];
        const opponentRank = row.ranks?.[opponentKey];

        games += 1;
        const diff = (selfScore ?? 0) - (opponentScore ?? 0);
        totalDiff += diff;
        if (diff > 0) wins += 1;
        else if (diff < 0) losses += 1;
        else draws += 1;

        if (typeof selfRank === "number") {
          rankSumSelf += selfRank;
          rankCount += 1;
        }
        if (typeof opponentRank === "number") {
          rankSumOpponent += opponentRank;
        }
      });
    });

    if (games === 0) return null;
    return {
      games,
      totalDiff,
      wins,
      draws,
      losses,
      avgRankSelf: rankCount > 0 ? rankSumSelf / rankCount : null,
      avgRankOpponent: rankCount > 0 ? rankSumOpponent / rankCount : null,
    };
  }, [history, selectedOpponent, selectedSelf]);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-zinc-400">
        読み込み中...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans">
      <main className="mx-auto max-w-5xl px-4 py-6 space-y-6">
        <section className="rounded-lg border border-zinc-700 bg-zinc-900/80 p-4">
          <h1 className="text-lg font-semibold text-white mb-2">
            通算成績ダッシュボード
          </h1>
          {loading ? (
            <p className="text-xs text-zinc-400">読み込み中...</p>
          ) : (
            <>
              {Object.values(aggregateStats).length === 0 ? (
                <p className="text-xs text-zinc-400">
                  まだ対局データがありません。
                </p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {Object.values(aggregateStats)
                    .sort((a, b) => a.name.localeCompare(b.name, "ja"))
                    .map((stat) => (
                      <div
                        key={stat.name}
                        className="rounded border border-zinc-700 bg-zinc-800/70 p-3 text-xs text-zinc-100"
                      >
                        <div className="flex items-center justify-between text-sm font-medium text-white">
                          <span>{stat.name}</span>
                          <span>{stat.games}局</span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                          <span className="text-zinc-400">合計素点</span>
                          <span>{stat.totalScore.toFixed(1)}</span>
                          <span className="text-zinc-400">平均順位</span>
                          <span>{stat.avgRank.toFixed(2)}</span>
                          <span className="text-zinc-400">トップ率</span>
                          <span>{stat.rankPct[0].toFixed(1)}%</span>
                          <span className="text-zinc-400">ラス率</span>
                          <span>{stat.rankPct[3].toFixed(1)}%</span>
                          <span className="text-zinc-400">通算トビ率</span>
                          <span>{stat.tobiRate.toFixed(1)}%</span>
                          <span className="text-zinc-400">平均チップ</span>
                          <span>
                            {stat.avgChip !== null
                              ? `${stat.avgChip.toFixed(1)}枚`
                              : "-"}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </>
          )}
        </section>

        <section className="rounded-lg border border-zinc-700 bg-zinc-900/80 p-4">
          <h2 className="text-sm font-medium text-white">対戦成績（1対1）</h2>
          <div className="mt-3 flex flex-col gap-3 md:flex-row">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-400">自分</label>
              <select
                value={selectedSelf}
                onChange={(e) => setSelectedSelf(e.target.value)}
                className="w-48 rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-500"
              >
                <option value="">選択してください</option>
                {userDisplayName && (
                  <option value={userDisplayName}>{userDisplayName}</option>
                )}
                {players
                  .filter((p) => p !== userDisplayName)
                  .map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-400">対戦相手</label>
              <select
                value={selectedOpponent}
                onChange={(e) => setSelectedOpponent(e.target.value)}
                className="w-48 rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-500"
              >
                <option value="">選択してください</option>
                {players.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {headToHeadStats ? (
            <div className="mt-4 grid gap-2 rounded border border-zinc-700 bg-zinc-800/70 p-3 text-xs text-zinc-100 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-medium text-white">対戦結果</h3>
                <div className="mt-2 grid grid-cols-2 gap-y-1">
                  <span className="text-zinc-400">対局数</span>
                  <span>{headToHeadStats.games}局</span>
                  <span className="text-zinc-400">勝ち</span>
                  <span>{headToHeadStats.wins}</span>
                  <span className="text-zinc-400">引き分け</span>
                  <span>{headToHeadStats.draws}</span>
                  <span className="text-zinc-400">負け</span>
                  <span>{headToHeadStats.losses}</span>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-white">素点差・平均順位</h3>
                <div className="mt-2 grid grid-cols-2 gap-y-1">
                  <span className="text-zinc-400">合計差分</span>
                  <span>{headToHeadStats.totalDiff.toFixed(1)}pt</span>
                  <span className="text-zinc-400">平均順位（自分）</span>
                  <span>
                    {headToHeadStats.avgRankSelf !== null
                      ? headToHeadStats.avgRankSelf.toFixed(2)
                      : "-"}
                  </span>
                  <span className="text-zinc-400">平均順位（相手）</span>
                  <span>
                    {headToHeadStats.avgRankOpponent !== null
                      ? headToHeadStats.avgRankOpponent.toFixed(2)
                      : "-"}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-xs text-zinc-400">
              自分と対戦相手を選択すると、ここに対戦成績が表示されます。
            </p>
          )}
          {message && <div className="mt-2 text-xs text-amber-300">{message}</div>}
        </section>
      </main>
    </div>
  );
}
