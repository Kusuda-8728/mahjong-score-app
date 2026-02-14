"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import {
  HistoryEntry,
  PlayerKey,
  fetchMatches,
  fetchPlayers,
  fetchUserProfile,
  normalizeHistoryEntries,
  PLAYER_KEYS,
  buildAggregateStats,
  extractRankHistoryWithContext,
  RankHistoryItem,
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

function SearchableSelect({
  value,
  options,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.trim().toLowerCase();
    return options.filter((p) => p.toLowerCase().includes(q));
  }, [options, search]);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  return (
    <div className={`relative ${className ?? ""}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-left text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-500"
      >
        {value || placeholder}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 min-w-[180px] rounded border border-zinc-600 bg-zinc-900 shadow-xl">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="検索..."
            className="m-2 w-[calc(100%-1rem)] rounded border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none"
          />
          <div className="max-h-40 overflow-y-auto p-1">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="w-full rounded px-2 py-1.5 text-left text-sm text-zinc-400 hover:bg-zinc-800"
            >
              {placeholder}
            </button>
            {filtered.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => {
                  onChange(p);
                  setOpen(false);
                }}
                className={`w-full rounded px-2 py-1.5 text-left text-sm hover:bg-zinc-800 ${
                  value === p ? "text-emerald-300" : "text-zinc-100"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function StatsPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [userDisplayName, setUserDisplayName] = useState<string | null>(null);

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [players, setPlayers] = useState<string[]>([]);
  const [selectedSelf, setSelectedSelf] = useState<string>("");
  const [selectedOpponent, setSelectedOpponent] = useState<string>("");
  const [selectedChartPlayer, setSelectedChartPlayer] = useState<string>("");
  const [chartRange, setChartRange] = useState<10 | 20 | 50>(10);
  const [selectedDetail, setSelectedDetail] = useState<RankHistoryItem | null>(
    null
  );
  const [statsPlayerFilter, setStatsPlayerFilter] = useState<Set<string>>(
    new Set()
  );
  const [statsFilterOpen, setStatsFilterOpen] = useState(false);
  const [statsFilterSearch, setStatsFilterSearch] = useState("");
  const statsFilterRef = useRef<HTMLDivElement>(null);

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
      setAuthChecked(true);
      try {
        const [profile, fetchPlayersResult, matchResult] = await Promise.all([
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

        if (playerNames.length > 0) {
          setSelectedChartPlayer((prev) =>
            prev ? prev : profile?.display_name ?? playerNames[0] ?? ""
          );
        }

        const entries = normalizeHistoryEntries(matchResult.matches, matchResult.sharedIds);
        setHistory(entries);
      } catch (e) {
        console.error("load stats data failed", e);
        setMessage("データの取得に失敗しました。");
      } finally {
        setLoading(false);
      }
    };
    init();
    // 初回ロード時のみ実行。selectedChartPlayer を deps に含めると
    // ドロップダウン変更のたびに再フェッチしてしまうため除外。
  }, []);

  const aggregateStats = useMemo(
    () => buildAggregateStats(history),
    [history]
  );

  const statsPlayerNames = useMemo(
    () =>
      Object.values(aggregateStats)
        .map((s) => s.name)
        .sort((a, b) => a.localeCompare(b, "ja")),
    [aggregateStats]
  );

  const hasInitializedStatsFilter = useRef(false);
  useEffect(() => {
    if (
      statsPlayerNames.length > 0 &&
      !hasInitializedStatsFilter.current
    ) {
      setStatsPlayerFilter(new Set(statsPlayerNames));
      hasInitializedStatsFilter.current = true;
    }
  }, [statsPlayerNames]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        statsFilterRef.current &&
        !statsFilterRef.current.contains(e.target as Node)
      ) {
        setStatsFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredStatsPlayerNames = useMemo(() => {
    if (!statsFilterSearch.trim())
      return statsPlayerNames;
    const q = statsFilterSearch.trim().toLowerCase();
    return statsPlayerNames.filter((n) =>
      n.toLowerCase().includes(q)
    );
  }, [statsPlayerNames, statsFilterSearch]);

  const toggleStatsPlayer = (name: string) => {
    setStatsPlayerFilter((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleAllStatsPlayers = () => {
    const allSelected =
      statsPlayerNames.length > 0 &&
      statsPlayerNames.every((n) => statsPlayerFilter.has(n));
    setStatsPlayerFilter(allSelected ? new Set() : new Set(statsPlayerNames));
  };

  const displayedStats = useMemo(
    () =>
      Object.values(aggregateStats)
        .filter((s) => statsPlayerFilter.has(s.name))
        .sort((a, b) => a.name.localeCompare(b.name, "ja")),
    [aggregateStats, statsPlayerFilter]
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

  const rankHistoryWithContext = useMemo(
    () => extractRankHistoryWithContext(history, selectedChartPlayer, 50),
    [history, selectedChartPlayer]
  );

  const displayedItems = useMemo(
    () => rankHistoryWithContext.slice(-chartRange),
    [rankHistoryWithContext, chartRange]
  );

  const getRowDetail = (item: RankHistoryItem) => {
    const row = item.entry.snapshot.rows?.[item.rowIndex];
    const playerNames = item.entry.snapshot.playerNames;
    if (!row?.ranks || !playerNames) return null;
    const result: { rank: number; name: string; score: number; points: number }[] = [];
    for (let r = 1; r <= 4; r++) {
      const key = (PLAYER_KEYS as readonly PlayerKey[]).find(
        (k) => row.ranks?.[k] === r
      );
      if (!key) continue;
      const name = playerNames[key] ?? key;
      const score = typeof row.scores?.[key] === "number" ? row.scores[key]! : 0;
      const pts = row.points?.[key];
      const points = typeof pts === "number" ? pts : 0;
      result.push({ rank: r, name, score, points });
    }
    return result;
  };

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
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <h1 className="text-lg font-semibold text-white">
              通算成績
            </h1>
            {statsPlayerNames.length > 0 && (
              <div className="relative" ref={statsFilterRef}>
                <button
                  type="button"
                  onClick={() => setStatsFilterOpen((o) => !o)}
                  className="flex items-center gap-2 rounded border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 hover:bg-zinc-700"
                >
                  <span>プレイヤー絞り込み</span>
                  <span className="text-xs text-zinc-400">
                    {statsPlayerFilter.size}件選択
                  </span>
                  <span className="text-zinc-500">
                    {statsFilterOpen ? "▼" : "▶"}
                  </span>
                </button>
                {statsFilterOpen && (
                  <div className="absolute left-0 top-full z-20 mt-1 min-w-[200px] rounded border border-zinc-600 bg-zinc-900 shadow-xl">
                    <div className="border-b border-zinc-700 p-2">
                      <input
                        type="text"
                        value={statsFilterSearch}
                        onChange={(e) => setStatsFilterSearch(e.target.value)}
                        placeholder="検索..."
                        className="w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 outline-none"
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto p-1">
                      <button
                        type="button"
                        onClick={toggleAllStatsPlayers}
                        className="mb-1 w-full rounded px-2 py-1 text-left text-xs text-zinc-400 hover:bg-zinc-800"
                      >
                        {statsPlayerNames.every((n) => statsPlayerFilter.has(n))
                          ? "全て解除"
                          : "全て選択"}
                      </button>
                      {filteredStatsPlayerNames.map((name) => (
                        <label
                          key={name}
                          className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-zinc-800"
                        >
                          <input
                            type="checkbox"
                            checked={statsPlayerFilter.has(name)}
                            onChange={() => toggleStatsPlayer(name)}
                            className="h-4 w-4 rounded border-zinc-600 bg-zinc-800 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="text-sm text-zinc-100">{name}</span>
                        </label>
                      ))}
                      {filteredStatsPlayerNames.length === 0 && (
                        <p className="px-2 py-2 text-xs text-zinc-500">
                          該当なし
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          {loading ? (
            <p className="text-xs text-zinc-400">読み込み中...</p>
          ) : (
            <>
              {Object.values(aggregateStats).length === 0 ? (
                <p className="text-xs text-zinc-400">
                  まだ対局データがありません。
                </p>
              ) : displayedStats.length === 0 ? (
                <p className="text-xs text-zinc-400">
                  表示するプレイヤーを選択してください。
                </p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {displayedStats.map((stat) => (
                      <div
                        key={stat.name}
                        className="rounded border border-zinc-700 bg-zinc-800/70 p-3 text-xs text-zinc-100"
                      >
                        <div className="flex items-center justify-between text-sm font-medium text-white">
                          <span>{stat.name}</span>
                          <span>対戦数 {stat.games}</span>
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
          <h2 className="text-sm font-medium text-white mb-3">
            順位履歴グラフ
          </h2>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-400">プレイヤー</label>
              <SearchableSelect
                value={selectedChartPlayer}
                options={players}
                onChange={setSelectedChartPlayer}
                placeholder="選択してください"
                className="w-48"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-400">表示期間</label>
              <div className="flex gap-1">
                {([10, 20, 50] as const).map((n) => (
                  <button
                    key={n}
                    onClick={() => setChartRange(n)}
                    className={`rounded px-3 py-2 text-sm ${
                      chartRange === n
                        ? "bg-zinc-500 text-white"
                        : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                    }`}
                  >
                    直近{n}戦
                  </button>
                ))}
              </div>
            </div>
          </div>
          {selectedChartPlayer && displayedItems.length > 0 ? (
            <div
              className="rounded border border-zinc-600 bg-zinc-800/50 p-3 overflow-x-auto flex flex-col md:flex-row gap-4"
              onMouseLeave={() => setSelectedDetail(null)}
            >
              <div className="min-w-0">
                <div className="text-xs text-zinc-400 mb-2">
                  縦軸: 順位（1位〜4位）　横軸: 左＝古い → 右＝直近（ホバーで詳細表示）
                </div>
                <div className="flex flex-col gap-0.5 min-w-max">
                  {[1, 2, 3, 4].map((rank) => (
                    <div key={rank} className="flex items-center gap-1">
                      <span className="w-6 text-xs text-zinc-500 shrink-0">
                        {rank}位
                      </span>
                      <div className="flex gap-0.5">
                        {displayedItems.map((item, i) => {
                          const isRankCell = item.rank === rank;
                          const isDisplaying =
                            selectedDetail === item && isRankCell;
                          return (
                            <div
                              key={i}
                              role="button"
                              tabIndex={0}
                              onMouseEnter={() =>
                                isRankCell ? setSelectedDetail(item) : undefined
                              }
                              onFocus={() =>
                                isRankCell ? setSelectedDetail(item) : undefined
                              }
                              className={`h-4 w-3 rounded-sm shrink-0 transition-colors ${
                                isRankCell
                                  ? isDisplaying
                                    ? "bg-amber-300 ring-1 ring-amber-200"
                                    : "bg-amber-500 hover:bg-amber-400 cursor-pointer"
                                  : "bg-zinc-700/50"
                              }`}
                              title={
                                isRankCell
                                  ? `${i + 1}戦目: ${item.rank}位`
                                  : undefined
                              }
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {selectedDetail && (
                <div className="flex-shrink-0 w-full md:w-64 rounded-lg border border-zinc-600 bg-zinc-900 p-3 text-xs">
                  <h3 className="text-sm font-medium text-white mb-2">
                    対局詳細
                  </h3>
                  <p className="text-zinc-300 mb-2">
                    {(() => {
                      const raw =
                        selectedDetail.entry.snapshot.gameDate ??
                        selectedDetail.entry.date;
                      try {
                        const d = new Date(raw);
                        return Number.isNaN(d.getTime())
                          ? raw
                          : d.toLocaleDateString("ja-JP", {
                              year: "numeric",
                              month: "long",
                              day: "numeric",
                            });
                      } catch {
                        return raw;
                      }
                    })()}
                  </p>
                  <div className="space-y-1.5">
                    {getRowDetail(selectedDetail)?.map((p) => (
                      <div
                        key={p.rank}
                        className="flex justify-between items-center py-1 border-b border-zinc-700"
                      >
                        <span className="text-zinc-400 w-8">{p.rank}位</span>
                        <span className="text-zinc-100 flex-1 truncate mx-2">
                          {p.name}
                        </span>
                        <span className="text-zinc-300 shrink-0">
                          スコア {p.score.toLocaleString()} /{" "}
                          {p.points > 0 ? "+" : ""}
                          {p.points}pt
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-zinc-400">
              プレイヤーを選択すると、順位履歴が棒グラフで表示されます。
            </p>
          )}

        </section>

        <section className="rounded-lg border border-zinc-700 bg-zinc-900/80 p-4">
          <h2 className="text-sm font-medium text-white">対戦成績（1対1）</h2>
          <div className="mt-3 flex flex-col gap-3 md:flex-row">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-400">自分</label>
              <SearchableSelect
                value={selectedSelf}
                options={
                  userDisplayName
                    ? [
                        userDisplayName,
                        ...players.filter((p) => p !== userDisplayName),
                      ]
                    : players
                }
                onChange={setSelectedSelf}
                placeholder="選択してください"
                className="w-48"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-zinc-400">対戦相手</label>
              <SearchableSelect
                value={selectedOpponent}
                options={players}
                onChange={setSelectedOpponent}
                placeholder="選択してください"
                className="w-48"
              />
            </div>
          </div>
          {headToHeadStats ? (
            <div className="mt-4 grid gap-2 rounded border border-zinc-700 bg-zinc-800/70 p-3 text-xs text-zinc-100 md:grid-cols-2">
              <div>
                <h3 className="text-sm font-medium text-white">対戦結果</h3>
                <div className="mt-2 grid grid-cols-2 gap-y-1">
                  <span className="text-zinc-400">対戦数</span>
                  <span>{headToHeadStats.games}</span>
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
