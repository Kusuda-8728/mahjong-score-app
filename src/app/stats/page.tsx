"use client";

import { Fragment, useEffect, useMemo, useState, useRef } from "react";
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

type MatchModeFilter = "all" | "yonma" | "sanma";

function resolveEntryMode(entry: HistoryEntry): "yonma" | "sanma" {
  const mode = entry.snapshot?.gameMode;
  if (mode === "yonma" || mode === "sanma") return mode;
  const rows = entry.snapshot?.rows;
  if (!rows || rows.length === 0) return "yonma";
  const hasDPoint = rows.some((r) => typeof r.points?.D === "number");
  return hasDPoint ? "yonma" : "sanma";
}

const CHART_RANKS = [1, 2, 3, 4] as const;
const CHART_COLOR = "#f472b6"; /* rose-400 */

function RankTransitionLineChart({
  items,
  selectedDetail,
  onHoverDetail,
}: {
  items: RankHistoryItem[];
  selectedDetail: RankHistoryItem | null;
  onSelectDetail?: (item: RankHistoryItem | null) => void;
  onHoverDetail: (item: RankHistoryItem | null) => void;
}) {
  const width = 640;
  const height = 180;
  const padding = { top: 16, right: 16, bottom: 24, left: 32 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  const n = items.length;
  const xs =
    n <= 1
      ? items.map(() => padding.left + chartWidth / 2)
      : items.map((_, i) => padding.left + (chartWidth * i) / (n - 1));
  const rankToY = (rank: number) =>
    padding.top + (chartHeight * (rank - 1)) / 3;
  const ys = items.map((item) => rankToY(item.rank));

  const pathD =
    items.length < 2
      ? ""
      : items
          .map((_, i) => `${i === 0 ? "M" : "L"} ${xs[i]} ${ys[i]}`)
          .join(" ");

  return (
    <div className="w-full min-w-0">
      <svg
        width="100%"
        height="auto"
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="block"
        style={{ aspectRatio: `${width} / ${height}` }}
      >
        {/* グリッド線 */}
        {CHART_RANKS.map((r) => (
          <line
            key={r}
            x1={padding.left}
            y1={rankToY(r)}
            x2={width - padding.right}
            y2={rankToY(r)}
            stroke="rgba(113,113,122,0.4)"
            strokeWidth="1"
            strokeDasharray="4 2"
          />
        ))}
        {/* Y軸ラベル */}
        {CHART_RANKS.map((r) => (
          <text
            key={r}
            x={padding.left - 8}
            y={rankToY(r)}
            textAnchor="end"
            dominantBaseline="middle"
            className="fill-zinc-500 text-xs font-medium"
          >
            {r}
          </text>
        ))}
        {/* 折れ線 */}
        {pathD && (
          <path
            d={pathD}
            fill="none"
            stroke={CHART_COLOR}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
        {/* データポイント（当たりを広くするため透明の大きな円を下層に） */}
        {items.map((item, i) => {
          const isSelected = selectedDetail === item;
          return (
            <g key={i}>
              <circle
                cx={xs[i]}
                cy={ys[i]}
                r={20}
                fill="transparent"
                onMouseEnter={() => onHoverDetail(item)}
                onClick={() => onHoverDetail(selectedDetail === item ? null : item)}
                className="cursor-pointer"
              />
              <circle
                cx={xs[i]}
                cy={ys[i]}
                r={isSelected ? 8 : 6}
                fill={CHART_COLOR}
                stroke={isSelected ? "#fda4af" : "rgba(0,0,0,0.2)"}
                strokeWidth={isSelected ? 2 : 1}
                className="pointer-events-none"
              />
              <title>
                {i + 1}戦目: {item.rank}位
              </title>
            </g>
          );
        })}
      </svg>
    </div>
  );
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
  const [chartRange, setChartRange] = useState<5 | 10 | 20 | 50>(10);
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

  /** 期間フィルタ: デフォルトは全期間 */
  const [periodFilter, setPeriodFilter] = useState<"all" | "3m" | "6m" | "1y">("all");
  const [matchModeFilter, setMatchModeFilter] = useState<MatchModeFilter>("all");

  const filteredHistory = useMemo(() => {
    if (periodFilter === "all") return history;
    const now = Date.now();
    const ms =
      periodFilter === "3m"
        ? 3 * 31 * 24 * 60 * 60 * 1000
        : periodFilter === "6m"
          ? 6 * 31 * 24 * 60 * 60 * 1000
          : 12 * 31 * 24 * 60 * 60 * 1000;
    const since = now - ms;
    return history.filter((e) => new Date(e.date).getTime() >= since);
  }, [history, periodFilter]);

  const filteredHistoryByMode = useMemo(() => {
    if (matchModeFilter === "all") return filteredHistory;
    return filteredHistory.filter((entry) => resolveEntryMode(entry) === matchModeFilter);
  }, [filteredHistory, matchModeFilter]);

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
    () => buildAggregateStats(filteredHistoryByMode),
    [filteredHistoryByMode]
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
      const initialFilter =
        userDisplayName && statsPlayerNames.includes(userDisplayName)
          ? new Set([userDisplayName])
          : new Set(statsPlayerNames);
      setStatsPlayerFilter(initialFilter);
      hasInitializedStatsFilter.current = true;
    }
  }, [statsPlayerNames, userDisplayName]);

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

    filteredHistoryByMode.forEach((entry) => {
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
  }, [filteredHistoryByMode, selectedOpponent, selectedSelf]);

  const rankHistoryWithContext = useMemo(
    () => extractRankHistoryWithContext(filteredHistoryByMode, selectedChartPlayer, 50),
    [filteredHistoryByMode, selectedChartPlayer]
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
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value as "all" | "3m" | "6m" | "1y")}
              className="rounded border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-500"
            >
              <option value="all">全期間</option>
              <option value="3m">直近3ヶ月</option>
              <option value="6m">直近6ヶ月</option>
              <option value="1y">直近1年</option>
            </select>
            <select
              value={matchModeFilter}
              onChange={(e) => setMatchModeFilter(e.target.value as MatchModeFilter)}
              className="rounded border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-500"
            >
              <option value="all">全て</option>
              <option value="yonma">四麻</option>
              <option value="sanma">三麻</option>
            </select>
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
                  {displayedStats.map((stat) => {
                    const rentaiRate = stat.games > 0
                      ? ((stat.rankDist[0] + stat.rankDist[1]) / stat.games) * 100
                      : 0;
                    const leftItems: { label: string; value: string }[] = [
                      { label: "通算スコア", value: stat.totalScore.toFixed(1) },
                      { label: "平均順位", value: stat.avgRank.toFixed(2) },
                      { label: "連対率", value: `${rentaiRate.toFixed(1)}%` },
                      { label: "通算トビ率", value: `${stat.tobiRate.toFixed(1)}%` },
                      { label: "平均チップ", value: stat.avgChip !== null ? `${stat.avgChip.toFixed(1)}枚` : "-" },
                    ];
                    const rightItems: { label: string; value: string }[] = [
                      { label: "1位率", value: `${stat.rankPct[0].toFixed(1)}%` },
                      { label: "2位率", value: `${stat.rankPct[1].toFixed(1)}%` },
                      { label: "3位率", value: `${stat.rankPct[2].toFixed(1)}%` },
                      { label: "4位率", value: `${stat.rankPct[3].toFixed(1)}%` },
                    ];
                    const maxRows = Math.max(leftItems.length, rightItems.length);
                    const rows: { left?: { label: string; value: string }; right?: { label: string; value: string } }[] = [];
                    for (let i = 0; i < maxRows; i++) {
                      rows.push({
                        left: leftItems[i],
                        right: rightItems[i],
                      });
                    }
                    return (
                      <div
                        key={stat.name}
                        className="rounded border border-zinc-700 bg-zinc-800/70 p-3 text-xs text-zinc-100"
                      >
                        <div className="flex items-center justify-between text-sm font-medium text-white">
                          <span>{stat.name}</span>
                          <span>対戦数 {stat.games}</span>
                        </div>
                        <div className="mt-2 grid grid-cols-4 gap-x-3 gap-y-2">
                          {rows.map((row, i) => (
                            <Fragment key={i}>
                              {row.left ? (
                                <>
                                  <span className="text-[10px] text-zinc-400">{row.left.label}</span>
                                  <span className="text-zinc-100">{row.left.value}</span>
                                </>
                              ) : (
                                <>
                                  <span />
                                  <span />
                                </>
                              )}
                              {row.right ? (
                                <>
                                  <span className="text-[10px] text-zinc-400">{row.right.label}</span>
                                  <span className="text-zinc-100">{row.right.value}</span>
                                </>
                              ) : (
                                <>
                                  <span />
                                  <span />
                                </>
                              )}
                            </Fragment>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>

        <section className="rounded-lg border border-zinc-700 bg-zinc-900/80 p-4">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <h2 className="text-sm font-medium text-white">
              順位履歴グラフ
            </h2>
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value as "all" | "3m" | "6m" | "1y")}
              className="rounded border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-500"
            >
              <option value="all">全期間</option>
              <option value="3m">直近3ヶ月</option>
              <option value="6m">直近6ヶ月</option>
              <option value="1y">直近1年</option>
            </select>
            <select
              value={matchModeFilter}
              onChange={(e) => setMatchModeFilter(e.target.value as MatchModeFilter)}
              className="rounded border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-500"
            >
              <option value="all">全て</option>
              <option value="yonma">四麻</option>
              <option value="sanma">三麻</option>
            </select>
          </div>
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
          </div>
          {selectedChartPlayer && displayedItems.length > 0 ? (
            <div
              className="rounded border border-zinc-600 bg-zinc-800/50 p-4 flex flex-col md:flex-row gap-4"
              onMouseLeave={() => setSelectedDetail(null)}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1 h-4 rounded bg-emerald-500 shrink-0" />
                  <h3 className="text-sm font-medium text-white">順位推移</h3>
                </div>
                <div className="flex gap-2 mb-3">
                  {(() => {
                    const options: (5 | 10 | 20 | 50)[] = [5, 10, 20, 50];
                    const idx = options.indexOf(chartRange);
                    return (
                      <>
                        <button
                          type="button"
                          onClick={() => setChartRange(options[Math.max(0, idx - 1)])}
                          disabled={idx <= 0}
                          className="rounded-full border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm text-emerald-400/80 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          −
                        </button>
                        <span className="rounded-full border border-zinc-600 bg-zinc-800 px-3 py-1 text-sm text-emerald-400/90">
                          直近{chartRange}戦
                        </span>
                        <button
                          type="button"
                          onClick={() => setChartRange(options[Math.min(3, idx + 1)])}
                          disabled={idx >= 3}
                          className="rounded-full border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm text-emerald-400/80 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          ＋
                        </button>
                      </>
                    );
                  })()}
                </div>
                <RankTransitionLineChart
                  items={displayedItems}
                  selectedDetail={selectedDetail}
                  onSelectDetail={setSelectedDetail}
                  onHoverDetail={setSelectedDetail}
                />
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
              プレイヤーを選択すると、順位推移が折れ線グラフで表示されます。
            </p>
          )}

        </section>

        <section className="rounded-lg border border-zinc-700 bg-zinc-900/80 p-4">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <h2 className="text-sm font-medium text-white">対戦成績（1対1）</h2>
            <select
              value={periodFilter}
              onChange={(e) => setPeriodFilter(e.target.value as "all" | "3m" | "6m" | "1y")}
              className="rounded border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-500"
            >
              <option value="all">全期間</option>
              <option value="3m">直近3ヶ月</option>
              <option value="6m">直近6ヶ月</option>
              <option value="1y">直近1年</option>
            </select>
            <select
              value={matchModeFilter}
              onChange={(e) => setMatchModeFilter(e.target.value as MatchModeFilter)}
              className="rounded border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-500"
            >
              <option value="all">全て</option>
              <option value="yonma">四麻</option>
              <option value="sanma">三麻</option>
            </select>
          </div>
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
