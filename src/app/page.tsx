"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/utils/supabase";
import type { User } from "@supabase/supabase-js";

const STARTING_POINTS = 30000;
const VALID_TOTALS = [100000, 120000] as const;

const UMA_PRESETS: Record<string, [number, number, number, number]> = {
  // values are in pt and follow the sequence [1位,2位,3位,4位]
  "10-20": [20, 10, -10, -20],
  "10-30": [30, 10, -10, -30],
  "5-10": [10, 5, -5, -10],
};
type UmaTypeOption = "10-20" | "10-30" | "5-10" | "custom";
const UMA_OPTIONS: UmaTypeOption[] = ["10-20", "10-30", "5-10", "custom"];
const isUmaType = (value: string): value is UmaTypeOption =>
  (UMA_OPTIONS as readonly string[]).includes(value);

type ChipTypeOption = "none" | "500" | "1000" | "custom";
const CHIP_TYPE_OPTIONS: ChipTypeOption[] = ["none", "500", "1000", "custom"];
const isChipType = (value: string): value is ChipTypeOption =>
  (CHIP_TYPE_OPTIONS as readonly string[]).includes(value);

type PlayerKey = "A" | "B" | "C" | "D";

interface RowData {
  points: Record<PlayerKey, number | "">;
  ranks: Record<PlayerKey, number>;
  scores: Record<PlayerKey, number>;
  tobiPlayer: PlayerKey | "";
}

interface SnapshotRowData {
  points?: Record<PlayerKey, number | "">;
  ranks?: Record<PlayerKey, number>;
  scores?: Record<PlayerKey, number>;
  tobiPlayer?: PlayerKey | "";
}

interface SnapshotData {
  rows?: SnapshotRowData[];
  playerNames?: Record<PlayerKey, string>;
  umaType?: string;
  customUma?: [string, string, string, string];
  tobiBonus?: number | string;
  oka?: number | string;
  chipValueType?: "none" | "500" | "1000" | "custom";
  chipCustomValue?: number | string;
  gameDate?: string;
  chipTotals?: Record<PlayerKey, number | string | "" | "-">;
}

interface MatchRow {
  id: string;
  created_at: string;
  game_date: string | null;
  player_a: string | null;
  player_b: string | null;
  player_c: string | null;
  player_d: string | null;
  score_a: number | null;
  score_b: number | null;
  score_c: number | null;
  score_d: number | null;
  chip_a: number | null;
  chip_b: number | null;
  chip_c: number | null;
  chip_d: number | null;
  uma_type: string | null;
  custom_uma: number[] | null;
  tobi_bonus: number | null;
  oka: number | null;
  chip_value_type: string | null;
  chip_custom_value: number | null;
  snapshot: SnapshotData | null;
}

interface HistoryEntry {
  id: string;
  name: string;
  date: string;
  players: Record<PlayerKey, string>;
  topPlayer: PlayerKey;
  snapshot: SnapshotData;
}

interface AggregatePlayerStats {
  name: string;
  games: number;
  totalScore: number;
  sumRank: number;
  rankDist: [number, number, number, number];
  tobiCount: number;
  gamesWithTobiRule: number;
  chipSum: number;
  chipGames: number;
  avgRank: number;
  rankPct: number[];
  tobiRate: number;
  avgChip: number | null;
}

function calculateRankAndScore(
  points: Record<PlayerKey, number | "">,
  uma: [number, number, number, number],
  tobiBonus: number,
  tobiPlayer: PlayerKey | "",
  okaPt: number
): {
  ranks: Record<PlayerKey, number>;
  scores: Record<PlayerKey, number>;
} {
  const players: PlayerKey[] = ["A", "B", "C", "D"];
  const filledPoints = players.map((p) => ({
    key: p,
    points: typeof points[p] === "number" ? (points[p] as number) : null,
  }));

  const filledCount = filledPoints.filter((x) => x.points !== null).length;
  if (filledCount < 4) {
    return {
      ranks: { A: 0, B: 0, C: 0, D: 0 },
      scores: { A: 0, B: 0, C: 0, D: 0 },
    };
  }

  const sorted = [...filledPoints]
    .filter((x): x is { key: PlayerKey; points: number } => x.points !== null)
    .sort((a, b) => b.points - a.points);

  const ranks: Record<PlayerKey, number> = { A: 0, B: 0, C: 0, D: 0 };
  const scores: Record<PlayerKey, number> = { A: 0, B: 0, C: 0, D: 0 };

  sorted.forEach((item, index) => {
    const rank = index + 1;
    ranks[item.key] = rank;
    const pts = item.points;
    let score =
      Math.round(((pts - STARTING_POINTS) / 1000 + uma[rank - 1]) * 10) / 10;

    // オカ（1位へのボーナス）を反映
    if (rank === 1 && okaPt) {
      score += okaPt;
    }

    // トビ発生時: 4位が飛ばされた人、選択された人が飛ばした人
    const hasTobi = sorted.some((x) => x.points < 0);
    const tobashita = tobiPlayer as PlayerKey | "";
    if (hasTobi && tobashita && tobiBonus > 0) {
      if (item.key === tobashita) {
        score += tobiBonus;
      } else if (rank === 4) {
        score -= tobiBonus;
      }
    }

    scores[item.key] = Math.round(score * 10) / 10;
  });

  return { ranks, scores };
}

function checkTotal(
  points: Record<PlayerKey, number | "" | "-">
): "OK" | "NG" | null {
  const players: PlayerKey[] = ["A", "B", "C", "D"];
  const vals = players.map((p) => points[p]);
  if (vals.some((v) => typeof v !== "number")) return null;
  const total = (vals as number[]).reduce((a, b) => a + b, 0);
  return VALID_TOTALS.includes(total as (typeof VALID_TOTALS)[number])
    ? "OK"
    : "NG";
}

const initialRow: RowData = {
  points: { A: "", B: "", C: "", D: "" },
  ranks: { A: 0, B: 0, C: 0, D: 0 },
  scores: { A: 0, B: 0, C: 0, D: 0 },
  tobiPlayer: "",
};
const PLAYER_KEYS: PlayerKey[] = ["A", "B", "C", "D"];

export default function Home() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [rows, setRows] = useState<RowData[]>([
    {
      ...initialRow,
      points: { A: "", B: "", C: "", D: "" },
      ranks: { A: 0, B: 0, C: 0, D: 0 },
      scores: { A: 0, B: 0, C: 0, D: 0 },
      tobiPlayer: "",
    },
  ]);

  const [chipTotals, setChipTotals] = useState<
    Record<PlayerKey, number | "" | "-">
  >({ A: "", B: "", C: "", D: "" });
  const [oka, setOka] = useState<string>("0"); // オカ（pt単位、例: 20.0）
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [backupText, setBackupText] = useState<string>("");
  const [showAggregateModal, setShowAggregateModal] = useState(false);
  const [aggregateStats, setAggregateStats] = useState<Record<string, AggregatePlayerStats> | null>(null);
  const [playerRegistry, setPlayerRegistry] = useState<Array<{ id: string; name: string }>>([]);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [playerMessage, setPlayerMessage] = useState<string | null>(null);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState<Record<PlayerKey, string | null>>({
    A: null,
    B: null,
    C: null,
    D: null,
  });
  const [selectedSelfPlayer, setSelectedSelfPlayer] = useState("");
  const [selectedOpponentPlayer, setSelectedOpponentPlayer] = useState("");

  const [gameDate, setGameDate] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

  const [chipValueType, setChipValueType] = useState<
    "none" | "500" | "1000" | "custom"
  >("none");
  const [chipCustomValue, setChipCustomValue] = useState<string>("500");

  const [playerNames, setPlayerNames] = useState<Record<PlayerKey, string>>({
    A: "A",
    B: "B",
    C: "C",
    D: "D",
  });

  const [umaType, setUmaType] = useState<"10-20" | "10-30" | "5-10" | "custom">(
    "10-30"
  );
  const [customUma, setCustomUma] = useState<[string, string, string, string]>([
    "30",
    "10",
    "-10",
    "-30",
  ]);
  const [tobiBonus, setTobiBonus] = useState<string>("20");

  const uma: [number, number, number, number] =
    umaType === "custom"
      ? customUma.map((v, i) => {
          const n = parseFloat(v);
          return isNaN(n) ? (UMA_PRESETS["10-30"] as [number, number, number, number])[i] : n;
        }) as [number, number, number, number]
      : UMA_PRESETS[umaType] ?? UMA_PRESETS["10-30"];

  const tobiBonusNum = Math.max(0, parseInt(tobiBonus, 10) || 0);
  const okaNum = parseFloat(oka) || 0;

  const chipValuePerPoint =
    chipValueType === "none"
      ? 0
      : chipValueType === "500"
        ? 500
        : chipValueType === "1000"
          ? 1000
          : Math.max(0, parseInt(chipCustomValue, 10) || 0);

  useEffect(() => {
    setRows((prev) =>
      prev.map((row) => {
        const { ranks, scores } = calculateRankAndScore(
          row.points,
          uma,
          tobiBonusNum,
          row.tobiPlayer,
          okaNum
        );
        return { ...row, ranks, scores };
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- derived from state
  }, [umaType, customUma.join(","), tobiBonus, oka]);

  const fetchPlayers = async () => {
    try {
      setPlayersLoading(true);
      const { data, error } = await supabase
        .from("players")
        .select("id, name")
        .order("name", { ascending: true });
      if (error) throw error;
      setPlayerRegistry((data ?? []).map((p) => ({ id: p.id, name: p.name })));
    } catch (e) {
      console.error("fetch players failed", e);
      setPlayerMessage("プレイヤー一覧の取得に失敗しました。");
    } finally {
      setPlayersLoading(false);
    }
  };

  const fetchHistory = async () => {
    try {
      const { data, error } = await supabase
        .from("matches")
        .select("*")
        .order("game_date", { ascending: false });
      if (error) throw error;
      const matches = (data ?? []) as MatchRow[];
      const entries: HistoryEntry[] = matches.map((m) => {
        const players = {
          A: (m.player_a ?? "A") || "A",
          B: (m.player_b ?? "B") || "B",
          C: (m.player_c ?? "C") || "C",
          D: (m.player_d ?? "D") || "D",
        };
        const scores = { A: m.score_a ?? 0, B: m.score_b ?? 0, C: m.score_c ?? 0, D: m.score_d ?? 0 };
        let top: PlayerKey = "A";
        (["A", "B", "C", "D"] as const).forEach((k) => {
          if (scores[k] > scores[top]) top = k;
        });
        const gd = m.game_date ?? "";
        const name =
          gd.length >= 10
            ? `${gd.slice(0, 4)}/${gd.slice(5, 7)}/${gd.slice(8, 10)} ${Object.values(players).join("、")}`
            : `${Object.values(players).join("、")}`;
        const snap: SnapshotData = m.snapshot ?? {};
        return {
          id: m.id,
          name,
          date: m.created_at,
          players,
          topPlayer: top,
          snapshot: {
            rows: snap.rows,
            playerNames: snap.playerNames ?? players,
            umaType: snap.umaType ?? m.uma_type ?? undefined,
            customUma:
              snap.customUma ??
              [
                String(m.custom_uma?.[0] ?? 30),
                String(m.custom_uma?.[1] ?? 10),
                String(m.custom_uma?.[2] ?? -10),
                String(m.custom_uma?.[3] ?? -30),
              ],
            tobiBonus: snap.tobiBonus ?? m.tobi_bonus ?? undefined,
            oka: snap.oka ?? m.oka ?? undefined,
            chipValueType: snap.chipValueType ?? (m.chip_value_type as SnapshotData["chipValueType"]) ?? undefined,
            chipCustomValue: snap.chipCustomValue ?? m.chip_custom_value ?? undefined,
            gameDate: snap.gameDate ?? gd,
            chipTotals:
              snap.chipTotals ??
              ({
                A: m.chip_a ?? "",
                B: m.chip_b ?? "",
                C: m.chip_c ?? "",
                D: m.chip_d ?? "",
              } as Record<PlayerKey, number | string | "" | "-">),
          },
        };
      });
      setHistory(entries);
    } catch (e) {
      console.error("load history failed", e);
    }
  };

  // -- Auth check & persistence: load saved state & history on mount
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }
      setCurrentUser(session.user);
      setAuthChecked(true);

      try {
        const saved = localStorage.getItem("mahjong_saved");
        if (saved) {
          const data = JSON.parse(saved);
          if (data) {
            if (data.rows) setRows(data.rows);
            if (data.playerNames) setPlayerNames(data.playerNames);
            if (data.umaType) setUmaType(data.umaType);
            if (data.customUma) setCustomUma(data.customUma);
            if (data.tobiBonus) setTobiBonus(String(data.tobiBonus));
            if (data.oka) setOka(String(data.oka));
            if (data.chipValueType) setChipValueType(data.chipValueType);
            if (data.chipCustomValue) setChipCustomValue(String(data.chipCustomValue));
            if (data.gameDate) setGameDate(data.gameDate);
            if (data.chipTotals) setChipTotals(data.chipTotals);
          }
        }
      } catch (e) {
        console.error("load saved failed", e);
      }
      await Promise.all([fetchPlayers(), fetchHistory()]);
    };
    init();
  }, [router]);
  const handleAddPlayer = async () => {
    const trimmed = newPlayerName.trim();
    if (!trimmed) {
      setPlayerMessage("プレイヤー名を入力してください。");
      return;
    }
    if (!currentUser) {
      setPlayerMessage("ユーザー情報を取得できません。再度ログインしてください。");
      return;
    }
    try {
      setPlayerMessage(null);
      const exists = playerRegistry.some(
        (p) => p.name.toLowerCase() === trimmed.toLowerCase()
      );
      if (exists) {
        setPlayerMessage("同じ名前のプレイヤーが登録されています。");
        return;
      }
      const { error } = await supabase
        .from("players")
        .insert({ name: trimmed, user_id: currentUser.id });
      if (error) throw error;
      setNewPlayerName("");
      setPlayerMessage("プレイヤーを追加しました。");
      await fetchPlayers();
    } catch (e) {
      console.error("add player failed", e);
      setPlayerMessage("プレイヤーの追加に失敗しました。");
    }
  };

  const handleDeletePlayer = async (id: string) => {
    if (!confirm("このプレイヤーを削除しますか？")) return;
    try {
      const { error } = await supabase.from("players").delete().eq("id", id);
      if (error) throw error;
      setPlayerMessage("プレイヤーを削除しました。");
      await fetchPlayers();
    } catch (e) {
      console.error("delete player failed", e);
      setPlayerMessage("プレイヤーの削除に失敗しました。");
    }
  };

  const playerOptions = useMemo(
    () => playerRegistry.map((p) => ({ value: p.name, label: p.name, id: p.id })),
    [playerRegistry]
  );
  const opponentOptions = useMemo(() => {
    const set = new Set<string>();
    history.forEach((h) => {
      if (h?.snapshot?.playerNames) {
        Object.values(h.snapshot.playerNames).forEach((name) => {
          const trimmed = name.trim();
          if (trimmed) set.add(trimmed);
        });
      }
    });
    playerRegistry.forEach((p) => set.add(p.name));
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ja"));
  }, [history, playerRegistry]);


  // -- Auto-save current state
  useEffect(() => {
    const payload = {
      rows,
      playerNames,
      umaType,
      customUma,
      tobiBonus,
      oka,
      chipValueType,
      chipCustomValue,
      gameDate,
      chipTotals,
    };
    try {
      localStorage.setItem("mahjong_saved", JSON.stringify(payload));
    } catch (e) {
      console.error("autosave failed", e);
    }
  }, [rows, playerNames, umaType, customUma, tobiBonus, oka, chipValueType, chipCustomValue, gameDate, chipTotals]);

  const updatePoint = (rowIndex: number, player: PlayerKey, value: string) => {
    const parsed: number | "" = value === "" ? "" : parseInt(value, 10);
    if (value !== "" && isNaN(parsed as number)) return;

    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[rowIndex] };
      row.points = { ...row.points, [player]: parsed };
      const { ranks, scores } = calculateRankAndScore(
        row.points,
        uma,
        tobiBonusNum,
        row.tobiPlayer,
        okaNum
      );
      row.ranks = ranks;
      row.scores = scores;
      next[rowIndex] = row;
      return next;
    });
  };

  const updateTobiPlayer = (rowIndex: number, value: PlayerKey | "") => {
    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[rowIndex] };
      row.tobiPlayer = value;
      const { ranks, scores } = calculateRankAndScore(
        row.points,
        uma,
        tobiBonusNum,
        value,
        okaNum
      );
      row.ranks = ranks;
      row.scores = scores;
      next[rowIndex] = row;
      return next;
    });
  };

  const addRow = () => {
    setRows((prev) => [...prev, { ...initialRow }]);
  };

  const totalScores: Record<PlayerKey, number> = rows.reduce(
    (acc, row) => ({
      A: acc.A + row.scores.A,
      B: acc.B + row.scores.B,
      C: acc.C + row.scores.C,
      D: acc.D + row.scores.D,
    }),
    { A: 0, B: 0, C: 0, D: 0 }
  );

  const updateChipTotal = (player: PlayerKey, value: string) => {
    const parsed: number | "" | "-" =
      value === "" ? "" : value === "-" ? "-" : parseInt(value, 10);
    if (
      value !== "" &&
      value !== "-" &&
      (isNaN(parsed as number) || !/^-?\d*$/.test(value))
    )
      return;
    setChipTotals((prev) => ({ ...prev, [player]: parsed }));
  };

  // Save current session to Supabase matches table
  const saveCurrentToHistory = async () => {
    const completed = rows.filter((r) =>
      ["A", "B", "C", "D"].every((k) => typeof r.points[k as PlayerKey] === "number")
    );
    const lastRow = completed[completed.length - 1];
    if (!lastRow) {
      alert("1局以上完了してから保存してください。");
      return;
    }

    const gameDateVal =
      gameDate ||
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-${String(new Date().getDate()).padStart(2, "0")}`;

    const parseChip = (v: number | "" | "-"): number | null =>
      typeof v === "number" ? v : null;

    const row = lastRow;
    const pts = row.points as Record<PlayerKey, number>;
    const ranks = row.ranks;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert("ログインしてください。");
      router.replace("/login");
      return;
    }

    const record = {
      user_id: user.id,
      game_date: gameDateVal,
      player_a: playerNames.A || "A",
      player_b: playerNames.B || "B",
      player_c: playerNames.C || "C",
      player_d: playerNames.D || "D",
      score_a: pts.A ?? 0,
      score_b: pts.B ?? 0,
      score_c: pts.C ?? 0,
      score_d: pts.D ?? 0,
      rank_a: ranks.A || null,
      rank_b: ranks.B || null,
      rank_c: ranks.C || null,
      rank_d: ranks.D || null,
      tobi_a: ranks.A === 4 && (pts.A ?? 0) < 0,
      tobi_b: ranks.B === 4 && (pts.B ?? 0) < 0,
      tobi_c: ranks.C === 4 && (pts.C ?? 0) < 0,
      tobi_d: ranks.D === 4 && (pts.D ?? 0) < 0,
      chip_a: parseChip(chipTotals.A),
      chip_b: parseChip(chipTotals.B),
      chip_c: parseChip(chipTotals.C),
      chip_d: parseChip(chipTotals.D),
      uma_type: umaType,
      custom_uma:
        umaType === "custom"
          ? customUma.map((s) => parseInt(s, 10) || 0)
          : null,
      tobi_bonus: parseInt(String(tobiBonus), 10) || 0,
      oka: parseInt(String(oka), 10) || 0,
      chip_value_type: chipValueType,
      chip_custom_value:
        chipValueType === "custom"
          ? parseInt(String(chipCustomValue), 10) || null
          : null,
      snapshot: {
        rows,
        playerNames,
        umaType,
        customUma,
        tobiBonus,
        oka,
        chipValueType,
        chipCustomValue,
        gameDate,
        chipTotals,
      },
    };

    try {
      const { error } = await supabase.from("matches").insert(record);
      if (error) throw error;
      await fetchHistory();
      alert("保存しました。");
    } catch (e) {
      console.error("save failed", e);
      alert("保存に失敗しました。\n" + (e instanceof Error ? e.message : String(e)));
    }
  };

  const buildAggregateStats = (source: HistoryEntry[]): Record<string, AggregatePlayerStats> => {
    const map: Record<string, AggregatePlayerStats> = {};

    source.forEach((entry) => {
      const snap = entry.snapshot;
      if (!snap.rows || !snap.playerNames) return;

      const tobiBonusNum = Math.max(0, parseInt(String(snap.tobiBonus ?? 0), 10) || 0);
      const chipVal =
        !snap.chipValueType || snap.chipValueType === "none"
          ? 0
          : snap.chipValueType === "500"
            ? 500
            : snap.chipValueType === "1000"
              ? 1000
              : Math.max(0, parseInt(String(snap.chipCustomValue ?? 0), 10) || 0);
      const hasTobiRule = tobiBonusNum > 0;
      const hasChipRule = chipVal > 0;

      snap.rows.forEach((row) => {
        const pts = PLAYER_KEYS.map((k) => row.points?.[k]);
        if (pts.some((v) => typeof v !== "number")) return;

        const hasTobi = pts.some((v) => typeof v === "number" && v < 0);

        PLAYER_KEYS.forEach((k) => {
          const name = snap.playerNames?.[k] ?? k;
          const normalized = String(name).trim();
          if (!map[normalized]) {
            map[normalized] = {
              name: normalized,
              games: 0,
              totalScore: 0,
              sumRank: 0,
              rankDist: [0, 0, 0, 0],
              tobiCount: 0,
              gamesWithTobiRule: 0,
              chipSum: 0,
              chipGames: 0,
              avgRank: 0,
              rankPct: [0, 0, 0, 0],
              tobiRate: 0,
              avgChip: null,
            };
          }
          const entryStats = map[normalized];
          const rankVal = row.ranks?.[k];
          const scoreVal = row.scores?.[k] ?? 0;

          if (typeof rankVal === "number" && rankVal >= 1 && rankVal <= 4) {
            entryStats.games += 1;
            entryStats.totalScore += scoreVal;
            entryStats.sumRank += rankVal;
            entryStats.rankDist[rankVal - 1] += 1;

            if (hasTobiRule) {
              entryStats.gamesWithTobiRule += 1;
              if (hasTobi && rankVal === 4) entryStats.tobiCount += 1;
            }
          }
        });
      });

      if (hasChipRule && snap.chipTotals) {
        PLAYER_KEYS.forEach((k) => {
          const name = snap.playerNames?.[k] ?? k;
          const normalized = String(name).trim();
          if (!map[normalized]) return;
          const raw = snap.chipTotals?.[k];
          let chipCount = 0;
          if (typeof raw === "number") chipCount = raw;
          else if (typeof raw === "string") {
            const trimmed = raw.trim();
            if (trimmed !== "" && trimmed !== "-") {
              const parsed = Number(trimmed);
              chipCount = Number.isFinite(parsed) ? parsed : 0;
            }
          }
          if (chipCount !== 0) {
            map[normalized].chipSum += chipCount;
            map[normalized].chipGames += 1;
          }
        });
      }
    });

    Object.values(map).forEach((v) => {
      v.avgRank = v.games > 0 ? v.sumRank / v.games : 0;
      v.rankPct = v.games > 0 ? v.rankDist.map((c) => (c / v.games) * 100) : [0, 0, 0, 0];
      v.tobiRate =
        v.gamesWithTobiRule > 0 ? (v.tobiCount / v.gamesWithTobiRule) * 100 : 0;
      v.avgChip = v.chipGames > 0 ? v.chipSum / v.chipGames : null;
    });

    return map;
  };

  // Compute aggregated stats from Supabase history (rule-based filtering)
  const computeAggregateStats = () => {
    const map = buildAggregateStats(history);
    setAggregateStats(map);
    setShowAggregateModal(true);
  };

  // 履歴が更新された際、ダッシュボード表示中なら即座に再計算
  useEffect(() => {
    if (!showAggregateModal) return;
    setAggregateStats(buildAggregateStats(history));
  }, [history, showAggregateModal]);

  // Export history to text for backup display
  const exportHistoryBackup = () => {
    try {
      setBackupText(JSON.stringify(history, null, 2));
    } catch (e) {
      setBackupText("// export failed: " + String(e));
    }
    setShowBackupModal(true);
  };

  // Import backup JSON and overwrite localStorage
  const importHistoryBackup = () => {
    try {
      const text = backupText.trim();
      if (!text || text.startsWith("//")) {
        alert("有効なJSONデータを貼り付けてください。");
        return;
      }
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        alert("バックアップデータは配列形式である必要があります。");
        return;
      }
      const next = parsed.slice(0, 100);
      setHistory(next);
      localStorage.setItem("mahjong_history", JSON.stringify(next));
      alert(`インポートしました。（${next.length}件の履歴）`);
      setShowBackupModal(false);
    } catch (e) {
      alert("インポートに失敗しました。JSON形式が正しいか確認してください。\n" + String(e));
    }
  };

  const loadHistoryEntry = (id: number) => {
    const entry = history.find((h) => h.id === String(id));
    if (!entry) return;
    const s = entry.snapshot;
    if (s) {
      if (s.rows) {
        const normalizedRows: RowData[] = s.rows.map((row) => ({
          points: {
            A: row.points?.A ?? "",
            B: row.points?.B ?? "",
            C: row.points?.C ?? "",
            D: row.points?.D ?? "",
          },
          ranks: {
            A: row.ranks?.A ?? 0,
            B: row.ranks?.B ?? 0,
            C: row.ranks?.C ?? 0,
            D: row.ranks?.D ?? 0,
          },
          scores: {
            A: row.scores?.A ?? 0,
            B: row.scores?.B ?? 0,
            C: row.scores?.C ?? 0,
            D: row.scores?.D ?? 0,
          },
          tobiPlayer: row.tobiPlayer ?? "",
        }));
        setRows(normalizedRows);
      }
      if (s.playerNames) setPlayerNames(s.playerNames);
      if (s.umaType && isUmaType(s.umaType)) {
        setUmaType(s.umaType);
      }
      if (s.customUma && s.customUma.length === 4) {
        setCustomUma(
          s.customUma.map((v) => String(v ?? "")) as [string, string, string, string]
        );
      }
      if (s.tobiBonus !== undefined) setTobiBonus(String(s.tobiBonus));
      if (s.oka !== undefined) setOka(String(s.oka));
      if (s.chipValueType && isChipType(s.chipValueType)) {
        setChipValueType(s.chipValueType);
      }
      if (s.chipCustomValue !== undefined)
        setChipCustomValue(String(s.chipCustomValue));
      if (s.gameDate) setGameDate(s.gameDate);
      if (s.chipTotals) {
        const normalizeChipValue = (val: number | string | "" | "-"): number | "" | "-" => {
          if (val === "" || val === "-") return val;
          if (typeof val === "number" && Number.isFinite(val)) return val;
          const trimmed = String(val).trim();
          if (trimmed === "" || trimmed === "-") return trimmed as "" | "-";
          const parsed = Number(trimmed);
          return Number.isFinite(parsed) ? parsed : "" ;
        };
        setChipTotals({
          A: normalizeChipValue(s.chipTotals.A ?? ""),
          B: normalizeChipValue(s.chipTotals.B ?? ""),
          C: normalizeChipValue(s.chipTotals.C ?? ""),
          D: normalizeChipValue(s.chipTotals.D ?? ""),
        });
      }
    }
    setShowHistoryModal(false);
  };

  const newGame = () => {
    if (!confirm("現在の対局をリセットして新規作成しますか？ 保存していない変更は失われます。")) return;
    setRows([{ ...initialRow }]);
    setPlayerNames({ A: "A", B: "B", C: "C", D: "D" });
    setUmaType("10-30");
    setCustomUma(["30", "10", "-10", "-30"]);
    setTobiBonus("20");
    setOka("0");
    setChipValueType("none");
    setChipCustomValue("500");
    setChipTotals({ A: "", B: "", C: "", D: "" });
  };

  const players = PLAYER_KEYS;
  useEffect(() => {
    setSelectedPlayers((prev) => {
      const next: Record<PlayerKey, string | null> = { A: null, B: null, C: null, D: null };
      let changed = false;
      players.forEach((p) => {
        const match = playerOptions.find((opt) => opt.value === playerNames[p]);
        next[p] = match ? match.value : null;
        if (prev[p] !== next[p]) changed = true;
      });
      return changed ? next : prev;
    });
  }, [playerOptions, playerNames, players]);
  const totalWithChips: Record<PlayerKey, number> = players.reduce(
    (acc, p) => {
      const base = totalScores[p];
      const chip =
        typeof chipTotals[p] === "number"
          ? ((chipTotals[p] as number) * chipValuePerPoint) / 1000
          : 0;
      acc[p] = Math.round((base + chip) * 10) / 10;
      return acc;
    },
    { A: 0, B: 0, C: 0, D: 0 } as Record<PlayerKey, number>
  );

  const completedRows = rows.filter(
    (r) =>
      [r.points.A, r.points.B, r.points.C, r.points.D].every(
        (v) => typeof v === "number"
      )
  );

  const playerStats = players.map((p) => {
    const games = completedRows.length;
    if (games === 0) {
      return {
        player: p,
        avgRank: 0,
        topRate: 0,
        renpaiRate: 0,
        rankDist: [0, 0, 0, 0],
        tobiRate: 0,
        games: 0,
      };
    }
    const ranks = completedRows.map((r) => r.ranks[p]);
    const avgRank =
      ranks.reduce((a, b) => a + b, 0) / games;
    const topCount = ranks.filter((r) => r === 1).length;
    const renpaiCount = ranks.filter((r) => r <= 2).length;
    const rankDist: [number, number, number, number] = [0, 0, 0, 0];
    ranks.forEach((r) => {
      if (r >= 1 && r <= 4) rankDist[r - 1]++;
    });
    const tobiCount = completedRows.filter((r) => {
      const hasTobi = [r.points.A, r.points.B, r.points.C, r.points.D].some(
        (v) => typeof v === "number" && v < 0
      );
      return hasTobi && r.ranks[p] === 4;
    }).length;
    return {
      player: p,
      avgRank,
      topRate: topCount / games,
      renpaiRate: renpaiCount / games,
      rankDist,
      tobiRate: tobiCount / games,
      games,
    };
  });

  const headToHeadStats = useMemo(() => {
    const selfName = selectedSelfPlayer.trim();
    const opponentName = selectedOpponentPlayer.trim();
    if (!selfName || !opponentName || selfName === opponentName) return null;

    const stats = {
      matches: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      totalScoreSelf: 0,
      totalScoreOpponent: 0,
      totalRankSelf: 0,
      totalRankOpponent: 0,
    };

    history.forEach((h) => {
      const snap = h.snapshot;
      if (!snap || !snap.rows || !snap.playerNames) return;
      const entries = Object.entries(snap.playerNames) as Array<[PlayerKey, string]>;
      const selfEntry = entries.find(([, name]) => String(name ?? "").trim() === selfName);
      const opponentEntry = entries.find(([, name]) => String(name ?? "").trim() === opponentName);
      if (!selfEntry || !opponentEntry) return;

      const rows = snap.rows ?? [];
      const finalRow = [...rows]
        .reverse()
        .find((row) =>
          players.every(
            (p) =>
              typeof row.points?.[p] === "number" &&
              typeof row.ranks?.[p] === "number" &&
              typeof row.scores?.[p] === "number"
          )
        );
      if (!finalRow) return;

      const scoreTotals = players.reduce<Record<PlayerKey, number>>((acc, key) => {
        acc[key] = rows.reduce((sum, row) => {
          const val = row.scores?.[key];
          return sum + (typeof val === "number" ? val : 0);
        }, 0);
        return acc;
      }, { A: 0, B: 0, C: 0, D: 0 });

      const chipValue =
        snap.chipValueType === "none"
          ? 0
          : snap.chipValueType === "500"
            ? 500
            : snap.chipValueType === "1000"
              ? 1000
              : Math.max(0, parseInt(String(snap.chipCustomValue ?? 0), 10) || 0);

      const chipTotals = players.reduce<Record<PlayerKey, number>>((acc, key) => {
        const raw = snap.chipTotals?.[key];
        if (typeof raw === "number") acc[key] = raw;
        else if (typeof raw === "string") {
          const trimmed = raw.trim();
          if (trimmed === "" || trimmed === "-") acc[key] = 0;
          else {
            const parsed = Number(trimmed);
            acc[key] = Number.isFinite(parsed) ? parsed : 0;
          }
        } else acc[key] = 0;
        return acc;
      }, { A: 0, B: 0, C: 0, D: 0 });

      const totalsWithChips = players.reduce<Record<PlayerKey, number>>((acc, key) => {
        const chipScore = chipValue > 0 ? (chipTotals[key] * chipValue) / 1000 : 0;
        acc[key] = Math.round((scoreTotals[key] + chipScore) * 10) / 10;
        return acc;
      }, { A: 0, B: 0, C: 0, D: 0 });

      const selfKey = selfEntry[0];
      const opponentKey = opponentEntry[0];
      const selfScore = totalsWithChips[selfKey];
      const opponentScore = totalsWithChips[opponentKey];

      stats.matches += 1;
      stats.totalScoreSelf += selfScore;
      stats.totalScoreOpponent += opponentScore;

      const selfRank = finalRow.ranks?.[selfKey] ?? 0;
      const opponentRank = finalRow.ranks?.[opponentKey] ?? 0;
      stats.totalRankSelf += selfRank;
      stats.totalRankOpponent += opponentRank;

      if (selfScore > opponentScore) stats.wins += 1;
      else if (selfScore < opponentScore) stats.losses += 1;
      else stats.draws += 1;
    });

    if (stats.matches === 0) {
      return {
        ...stats,
        averageRankSelf: 0,
        averageRankOpponent: 0,
        averageScoreSelf: 0,
        averageScoreOpponent: 0,
        winRate: 0,
        scoreDiff: 0,
      };
    }

    return {
      ...stats,
      averageRankSelf: stats.totalRankSelf / stats.matches,
      averageRankOpponent: stats.totalRankOpponent / stats.matches,
      averageScoreSelf: stats.totalScoreSelf / stats.matches,
      averageScoreOpponent: stats.totalScoreOpponent / stats.matches,
      winRate: stats.wins / stats.matches,
      scoreDiff: stats.totalScoreSelf - stats.totalScoreOpponent,
    };
  }, [history, players, selectedOpponentPlayer, selectedSelfPlayer]);

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-zinc-400">
        読み込み中...
      </div>
    );
  }

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans">
      <main className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-100">麻雀スコア表</h1>
          <button
            onClick={handleLogout}
            className="text-xs text-zinc-400 hover:text-zinc-200"
          >
            ログアウト
          </button>
        </div>

        {/* プレイヤー管理 */}
        <section className="mb-6 rounded-lg border border-zinc-700 bg-zinc-900/80 p-4">
          <h2 className="text-sm font-medium text-white">プレイヤー管理</h2>
          <p className="mt-1 text-xs text-zinc-400">
            よく使うプレイヤー名を登録しておくと、スコア表で素早く選択できます。
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="text"
              value={newPlayerName}
              onChange={(e) => setNewPlayerName(e.target.value)}
              placeholder="プレイヤー名"
              className="w-full sm:w-60 rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-500"
            />
            <button
              onClick={handleAddPlayer}
              className="w-full sm:w-auto rounded border border-emerald-500 bg-emerald-600/80 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-60"
              disabled={playersLoading}
            >
              {playersLoading ? "追加中..." : "プレイヤーを追加"}
            </button>
          </div>
          {playerMessage && (
            <div className="mt-2 text-xs text-amber-300">{playerMessage}</div>
          )}
          <div className="mt-4">
            <h3 className="text-xs font-medium text-zinc-300">登録済みプレイヤー</h3>
            {playerRegistry.length === 0 ? (
              <p className="mt-2 text-xs text-zinc-500">まだ登録されていません。</p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-2">
                {playerRegistry.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-2 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100"
                  >
                    <span>{p.name}</span>
                    <button
                      onClick={() => handleDeletePlayer(p.id)}
                      className="rounded bg-red-700 px-1 py-0.5 text-[10px] text-white hover:bg-red-600"
                    >
                      削除
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* 基本情報 */}
        <section className="mb-4 rounded-lg border border-zinc-700 bg-zinc-900/80 p-3">
          <label className="mb-1 block text-xs text-zinc-400">
            対局日（YYYY/MM/DD）
          </label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={gameDate}
              onChange={(e) => setGameDate(e.target.value)}
              className="rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-500"
            />
            <span className="text-xs text-zinc-500">
              {gameDate
                ? `${gameDate.slice(0, 4)}/${gameDate.slice(5, 7)}/${gameDate.slice(8, 10)}`
                : ""}
            </span>
          </div>
        </section>

        {/* ルール設定 */}
        <section className="mb-6 rounded-lg border border-zinc-700 bg-zinc-900/80 p-4">
          <h2 className="mb-3 text-sm font-medium text-zinc-300">
            ルール設定
          </h2>
          <div className="flex flex-wrap gap-6">
            <div>
              <label className="mb-1 block text-xs text-zinc-400">ウマ</label>
              <select
                value={umaType}
                onChange={(e) =>
                  setUmaType(e.target.value as typeof umaType)
                }
                className="rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-500"
              >
                <option value="10-20">10-20</option>
                <option value="10-30">10-30</option>
                <option value="5-10">5-10</option>
                <option value="custom">カスタム</option>
              </select>
              {umaType === "custom" && (
                <div className="mt-2 flex gap-1">
                  {([0, 1, 2, 3] as const).map((i) => (
                    <input
                      key={i}
                      type="text"
                      value={customUma[i]}
                      onChange={(e) => {
                        const next: [string, string, string, string] = [
                          ...customUma,
                        ];
                        next[i] = e.target.value;
                        setCustomUma(next);
                      }}
                      placeholder={["1位", "2位", "3位", "4位"][i]}
                      className="w-14 rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-center text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-500"
                    />
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">
                トビ賞（pt）
              </label>
              <input
                type="number"
                min={0}
                value={tobiBonus}
                onChange={(e) => setTobiBonus(e.target.value)}
                className="w-20 rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">オカ（pt）</label>
              <input
                type="number"
                step="0.1"
                value={oka}
                onChange={(e) => setOka(e.target.value)}
                className="w-24 rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">
                チップ価値
              </label>
              <select
                value={chipValueType}
                onChange={(e) =>
                  setChipValueType(e.target.value as typeof chipValueType)
                }
                className="rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-500"
              >
                <option value="none">なし</option>
                <option value="500">1枚500点相当</option>
                <option value="1000">1枚1000点相当</option>
                <option value="custom">カスタム</option>
              </select>
              {chipValueType === "custom" && (
                <input
                  type="number"
                  min={0}
                  value={chipCustomValue}
                  onChange={(e) => setChipCustomValue(e.target.value)}
                  placeholder="点"
                  className="mt-2 w-20 rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-500"
                />
              )}
            </div>
          </div>
        </section>

        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="border border-zinc-600 bg-zinc-900 px-1 py-1" rowSpan={2}>局数</th>
                <th className="border border-zinc-600 bg-zinc-900 px-1 py-1" rowSpan={2}>✅ / 飛賞</th>
                {players.map((p, idx) => (
                  <th key={p} className={`border border-zinc-600 bg-zinc-900 px-1 py-1 text-center font-bold ${idx < players.length - 1 ? 'border-r-4 border-black' : ''}`}>
                    {p}
                  </th>
                ))}
              </tr>
              <tr>
                {players.map((p, idx) => (
                  <th
                    key={p}
                    className={`border border-zinc-600 bg-zinc-800 px-1 py-1 text-center ${idx < players.length - 1 ? "border-r-4 border-black" : ""}`}
                  >
                    <div className="flex flex-col gap-1">
                      <select
                        value={selectedPlayers[p] ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          setSelectedPlayers((prev) => ({
                            ...prev,
                            [p]: value ? value : null,
                          }));
                          if (value) {
                            setPlayerNames((prev) => ({ ...prev, [p]: value }));
                          }
                        }}
                        className="rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-xs text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-500"
                      >
                        <option value="">登録から選択</option>
                        {playerOptions.map((opt) => (
                          <option key={opt.id} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={playerNames[p]}
                        onChange={(e) => {
                          const value = e.target.value;
                          setSelectedPlayers((prev) => ({ ...prev, [p]: null }));
                          setPlayerNames((prev) => ({
                            ...prev,
                            [p]: value || p,
                          }));
                        }}
                        placeholder={`${p}の名前を入力`}
                        className="w-full rounded border border-zinc-700 bg-transparent px-1 py-0.5 text-center text-xs font-medium text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-500"
                      />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const check = checkTotal(row.points);
                const checkIcon = check === 'OK' ? '✅' : check === 'NG' ? '❌' : '—';
                return (
                  <Fragment key={i}>
                    <tr>
                      <td className="border border-zinc-600 px-1 py-0.5 align-top" rowSpan={2}>{i + 1}</td>
                      <td className="border border-zinc-600 px-1 py-0.5 align-top" rowSpan={2}>
                        <div className="text-xs">{checkIcon}</div>
                        {tobiBonusNum > 0 && (() => {
                          const ptsArr = ["A","B","C","D"].map((k) => row.points[k as PlayerKey]);
                          const hasTobi = ptsArr.every((v) => typeof v === "number") && ptsArr.some((v: unknown) => typeof v === "number" && v < 0);
                          if (hasTobi && !row.tobiPlayer) {
                            return <div className="mt-1 text-red-400 text-xs">✖</div>;
                          }
                          return null;
                        })()}
                        <div className="mt-1">
                          <select
                            value={row.tobiPlayer}
                            onChange={(e) => updateTobiPlayer(i, e.target.value as PlayerKey | '')}
                            className="w-full rounded border border-zinc-700 bg-zinc-800 px-1 py-1 text-xs text-zinc-100"
                          >
                            <option value="">-</option>
                            <option value="A">A</option>
                            <option value="B">B</option>
                            <option value="C">C</option>
                            <option value="D">D</option>
                          </select>
                        </div>
                      </td>
                      {players.map((p, idx) => (
                        <td key={p} className={`border border-zinc-600 px-1 py-0.5 text-center ${idx < players.length - 1 ? 'border-r-4 border-black' : ''}`}>
                          <input
                            type="number"
                            value={row.points[p] === "" ? "" : String(row.points[p])}
                            onChange={(e) => updatePoint(i, p, e.target.value)}
                            className="w-full bg-transparent text-center text-xs text-zinc-100 outline-none p-0"
                          />
                        </td>
                      ))}
                    </tr>
                    <tr>
                      {players.map((p, idx) => (
                        <td key={p} className={`border border-zinc-600 px-1 py-0.5 font-medium tabular-nums ${idx < players.length - 1 ? 'border-r-4 border-black' : ''}`}>
                          <div className="flex items-center gap-2">
                            <span className={`w-4 shrink-0 text-left text-xs ${rows[i].ranks[p] === 1 ? 'text-amber-300 font-semibold' : 'text-zinc-100'}`}>
                              {check === "OK" ? (rows[i].ranks[p] > 0 ? rows[i].ranks[p] : "-") : "-"}
                            </span>
                            <span className="flex-1 text-center">
                              {check === "OK" ? (() => {
                                const sc = rows[i].scores[p];
                                if (sc === 0) return <span className="text-xs text-zinc-500">-</span>;
                                const positive = sc > 0;
                                const text = positive ? "text-blue-300" : "text-red-400";
                                return <span className={`${text} text-xs`}>{positive ? `+${sc}` : sc}</span>;
                              })() : <span className="text-xs text-zinc-500">-</span>}
                            </span>
                          </div>
                        </td>
                      ))}
                    </tr>
                  </Fragment>
                );
              })}
              <tr className="bg-zinc-800 font-medium">
                <td className="border border-zinc-600 px-1 py-1">計</td>
                <td className="border border-zinc-600 px-1 py-1">-</td>
                {players.map((p, idx) => {
                  const stat = playerStats.find((s) => s.player === p);
                  return (
                    <td key={p} className={`border border-zinc-600 px-1 py-1 text-center ${idx < players.length - 1 ? 'border-r-4 border-black' : ''}`}>
                      <div className="text-xs text-zinc-400">{stat && stat.games ? stat.avgRank.toFixed(2) : '-'}</div>
                      <div className="text-sm tabular-nums">{totalScores[p] > 0 ? `+${Math.round(totalScores[p] * 10) / 10}` : Math.round(totalScores[p] * 10) / 10}</div>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>

        {/* 履歴 / 操作ボタン */} 
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={addRow}
            className="rounded border border-zinc-600 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700"
          >
            局を追加
          </button>
          <button
            onClick={saveCurrentToHistory}
            className="rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
          >
            今の対局を保存
          </button>
          <button
            onClick={() => setShowHistoryModal(true)}
            className="rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
          >
            履歴を見る
          </button>
          <button
            onClick={computeAggregateStats}
            className="rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
          >
            通算成績
          </button>
          <button
            onClick={() => { if (confirm('新規作成しますか？ 現在のデータは保存されていない場合失われます')) newGame(); }}
            className="rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
          >
            新規作成
          </button>
        </div>

        {/* 履歴モーダル */} 
        {showHistoryModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="w-full max-w-2xl rounded-lg bg-zinc-900 border border-zinc-700 p-4 text-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="text-base font-medium text-white">対局履歴</div>
                <button className="text-xs text-zinc-300" onClick={() => setShowHistoryModal(false)}>閉じる</button>
              </div>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {history.length === 0 && <div className="text-zinc-500">履歴がありません</div>}
        {history.map((h) => (
          <div key={h.id} className="flex items-center justify-between border border-zinc-700 rounded px-3 py-2">
                    <div>
                      <div className="text-sm text-zinc-200">{h.name}</div>
                      <div className="text-xs text-zinc-500">
                        対局日: {h.snapshot?.gameDate ? `${h.snapshot.gameDate.slice(0,4)}/${h.snapshot.gameDate.slice(5,7)}/${h.snapshot.gameDate.slice(8,10)}` : new Date(h.date).toLocaleDateString()} / 参加: {Object.values(h.players).join(', ')} / トップ: {h.players?.[h.topPlayer] ?? h.topPlayer}
                      </div>
                    </div>
                    <div className="flex gap-2">
              <button onClick={() => loadHistoryEntry(Number(h.id))} className="rounded bg-emerald-600 px-2 py-1 text-xs">読み込み</button>
                      <button onClick={async () => {
                        if (!confirm('この履歴を削除しますか？')) return;
                        try {
                          const { error } = await supabase.from("matches").delete().eq("id", h.id);
                          if (error) throw error;
                          await fetchHistory();
                        } catch (e) {
                          alert("削除に失敗しました。\n" + (e instanceof Error ? e.message : String(e)));
                        }
                      }} className="rounded bg-red-700 px-2 py-1 text-xs">削除</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {/* 通算成績モーダル */ }
        {showAggregateModal && aggregateStats && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="w-full max-w-3xl rounded-lg bg-zinc-900 border border-zinc-700 p-4 text-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="text-base font-medium text-white">通算成績</div>
                <button className="text-xs text-zinc-300" onClick={() => setShowAggregateModal(false)}>閉じる</button>
              </div>
              <div className="grid gap-4 max-h-80 overflow-y-auto">
                {Object.values(aggregateStats).map((s: AggregatePlayerStats) => (
                  <div key={s.name} className="rounded border border-zinc-700 bg-zinc-800/60 p-3">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium text-white">{s.name}</div>
                      <div className="text-xs text-zinc-400">対局数: {s.games}</div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                      <div>合計スコア: <span className="font-medium tabular-nums">{Math.round(s.totalScore*10)/10}</span></div>
                      <div>平均順位: <span className="font-medium">{s.games ? s.avgRank.toFixed(2) : '-'}</span></div>
                      <div>通算トビ率: <span className="font-medium">{s.tobiRate.toFixed(1)}%</span></div>
                      <div>平均チップ獲得数: <span className="font-medium">{s.avgChip != null ? s.avgChip.toFixed(1) : '-'}</span></div>
                    </div>
                    <div className="mt-2 text-xs text-zinc-400">順位分布</div>
                    <div className="mt-1 space-y-1">
                      {s.rankDist.map((count: number, idx: number) => {
                        const pct = s.games ? (count / s.games) * 100 : 0;
                        const colors = ['bg-amber-400','bg-blue-400','bg-amber-700','bg-zinc-600'];
                        return (
                          <div key={idx} className="flex items-center gap-2">
                            <div className="w-8 text-xs text-zinc-300">{idx+1}位</div>
                            <div className="h-3 flex-1 bg-zinc-700 rounded">
                              <div className={`${colors[idx]} h-3 rounded`} style={{width: `${Math.min(Math.max(pct,0),100)}%`}}/>
                            </div>
                            <div className="w-14 text-right text-xs text-zinc-200">{count}回 ({pct.toFixed(1)}%)</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        {/* バックアップモーダル */}
        {showBackupModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="w-full max-w-3xl rounded-lg bg-zinc-900 border border-zinc-700 p-4 text-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="text-base font-medium text-white">履歴バックアップ</div>
                <div className="flex gap-2">
                  <button className="text-xs text-zinc-300 hover:text-white" onClick={() => { navigator.clipboard?.writeText(backupText).then(()=> alert('コピーしました')) }}>全てコピー</button>
                  <button className="text-xs text-emerald-400 hover:text-emerald-300 font-medium" onClick={importHistoryBackup}>インポート</button>
                  <button className="text-xs text-zinc-300 hover:text-white" onClick={() => setShowBackupModal(false)}>閉じる</button>
                </div>
              </div>
              <p className="text-xs text-zinc-500 mb-2">バックアップJSONを貼り付けて「インポート」でLocalStorageを上書きします。</p>
              <textarea
                value={backupText}
                onChange={(e) => setBackupText(e.target.value)}
                placeholder="ここにバックアップJSONを貼り付け..."
                className="w-full h-64 rounded bg-zinc-800 text-xs text-zinc-100 p-2 outline-none border border-zinc-600 focus:border-zinc-500"
              />
            </div>
          </div>
        )}
        {/* 合計（平均順位 と スコア合計） */ }
        <div className="mt-4 rounded-lg border border-zinc-700 bg-zinc-900/80 p-3">
          <h3 className="text-sm font-medium text-zinc-200 mb-2">計</h3>
          <div className="flex flex-wrap gap-6">
            {players.map((p) => {
              const stat = playerStats.find((s) => s.player === p);
              return (
                <div key={p} className="min-w-[120px]">
                  <div className="text-xs text-zinc-400">{playerNames[p] || p}</div>
                  <div className="mt-1 text-sm text-zinc-100">
                    平均順位:{" "}
                    <span className="font-medium">
                      {stat && stat.games ? stat.avgRank.toFixed(2) : "-"}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-zinc-100">
                    スコア合計:{" "}
                    <span className="font-medium tabular-nums">
                      {totalScores[p] > 0 ? `+${Math.round(totalScores[p] * 10) / 10}` : Math.round(totalScores[p] * 10) / 10}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 対戦成績 */}
        <section className="mt-6 rounded-lg border border-zinc-700 bg-zinc-900/80 p-4">
          <h2 className="mb-3 text-sm font-medium text-white">対戦成績（1対1）</h2>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label className="text-xs text-zinc-400">自分（登録済みプレイヤーから選択）</label>
              <select
                value={selectedSelfPlayer}
                onChange={(e) => setSelectedSelfPlayer(e.target.value)}
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-500"
              >
                <option value="">選択してください</option>
                {playerOptions.map((opt) => (
                  <option key={`self-${opt.id}`} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="text-xs text-zinc-400">対戦相手</label>
              <select
                value={selectedOpponentPlayer}
                onChange={(e) => setSelectedOpponentPlayer(e.target.value)}
                className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-500"
              >
                <option value="">選択してください</option>
                {opponentOptions.map((name) => (
                  <option key={`opponent-${name}`} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4">
            {!headToHeadStats ? (
              <p className="text-xs text-zinc-500">
                自分と相手を選択すると、該当する対局の成績を表示します。
              </p>
            ) : headToHeadStats.matches === 0 ? (
              <p className="text-xs text-zinc-500">
                選択した組み合わせの対局は見つかりませんでした。
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 text-xs">
                <div className="rounded border border-zinc-700 bg-zinc-800/60 p-3">
                  <div className="text-zinc-400">対戦数</div>
                  <div className="mt-1 text-lg font-semibold text-white">{headToHeadStats.matches}</div>
                  <div className="mt-2 text-zinc-400">
                    勝 {headToHeadStats.wins} / 負 {headToHeadStats.losses} / 分 {headToHeadStats.draws}
                  </div>
                  <div className="mt-1 text-zinc-400">
                    勝率 {Math.round(headToHeadStats.winRate * 1000) / 10}%
                  </div>
                </div>
                <div className="rounded border border-zinc-700 bg-zinc-800/60 p-3">
                  <div className="text-zinc-400">平均順位（自分 / 相手）</div>
                  <div className="mt-2 text-lg font-semibold text-white">
                    {headToHeadStats.averageRankSelf.toFixed(2)} / {headToHeadStats.averageRankOpponent.toFixed(2)}
                  </div>
                </div>
                <div className="rounded border border-zinc-700 bg-zinc-800/60 p-3">
                  <div className="text-zinc-400">通算収支差（順位点＋チップ）</div>
                  <div className="mt-2 text-lg font-semibold text-white">
                    {headToHeadStats.scoreDiff > 0 ? "+" : ""}
                    {headToHeadStats.scoreDiff.toFixed(1)}
                  </div>
                  <div className="mt-1 text-zinc-400">
                    自分平均 {headToHeadStats.averageScoreSelf.toFixed(1)} / 相手平均 {headToHeadStats.averageScoreOpponent.toFixed(1)}
                  </div>
                </div>
                <div className="rounded border border-zinc-700 bg-zinc-800/60 p-3">
                  <div className="text-zinc-400">最新対戦日</div>
                  <div className="mt-2 text-sm text-white">
                    {(() => {
                      const latest = history.find((h) => {
                        const snap = h.snapshot;
                        if (!snap?.playerNames) return false;
                        const names = Object.values(snap.playerNames).map((n) => String(n ?? "").trim());
                        return names.includes(selectedSelfPlayer.trim()) && names.includes(selectedOpponentPlayer.trim());
                      });
                      if (!latest) return "―";
                      const gd = latest.snapshot?.gameDate;
                      if (gd && gd.length >= 10) {
                        return `${gd.slice(0, 4)}/${gd.slice(5, 7)}/${gd.slice(8, 10)}`;
                      }
                      return latest.date ? new Date(latest.date).toLocaleDateString() : "―";
                    })()}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        <div className="mt-4 flex flex-wrap items-start gap-4">
          {/* チップ精算 */}
          {chipValuePerPoint > 0 && (
            <section className="rounded-lg border border-zinc-600 bg-zinc-900/80 p-4">
              <h3 className="mb-3 text-sm font-medium text-zinc-200">
                チップ精算
              </h3>
              <p className="mb-2 text-xs text-zinc-500">
                全対局終了後にチップ総枚数（±）を入力
              </p>
              <div className="flex flex-wrap gap-4">
                {players.map((p) => (
                  <div key={p} className="flex items-center gap-2">
                    <label className="text-xs text-zinc-400">
                      {playerNames[p] || p}
                    </label>
                    <input
                      type="number"
                      step="1"
                      value={chipTotals[p] === "" ? "" : (chipTotals[p] as number)}
                      onChange={(e) =>
                        updateChipTotal(p, e.target.value)
                      }
                      placeholder="±"
                      className="w-16 rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-center text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-500"
                    />
                    <span className="text-xs text-zinc-500">枚</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* 総収支（チップ価値が設定されている場合のみ表示） */}
        {chipValuePerPoint > 0 && (
          <div className="mt-4 flex items-center gap-6 rounded border border-zinc-600 bg-zinc-800 px-4 py-3">
            <span className="text-sm font-medium text-zinc-200">
              総収支（順位点＋チップ）
            </span>
            <div className="flex flex-wrap gap-4">
              {players.map((p) => (
                <span key={p} className="text-sm">
                  <span className="text-zinc-500">
                    {playerNames[p] || p}:
                  </span>{" "}
                  <span className="tabular-nums font-medium text-zinc-100">
                    {totalWithChips[p] > 0
                      ? `+${totalWithChips[p]}`
                      : totalWithChips[p]}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* 対局データ分析 */}
        <section className="mt-8 rounded-lg border border-zinc-700 bg-zinc-900/80 p-4">
          <h2 className="mb-4 text-base font-medium text-white">
            対局データ分析
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {playerStats.map((stat) => {
              const barColors = [
                "bg-amber-400", // 1着: ゴールド/黄
                "bg-blue-400", // 2着: シルバー/青
                "bg-amber-700", // 3着: ブロンズ/茶
                "bg-zinc-600", // 4着: ダークグレー/黒
              ];
              const rankLabels = ["1着", "2着", "3着", "4着"];
              return (
                <div
                  key={stat.player}
                  className="rounded-lg border border-zinc-700 bg-zinc-800/60 p-4"
                >
                  <h3 className="mb-3 text-sm font-medium text-white">
                    {playerNames[stat.player] || stat.player}
                    {stat.games !== undefined && stat.games > 0 && (
                      <span className="ml-2 text-xs font-normal text-zinc-400">
                        （{stat.games}局）
                      </span>
                    )}
                  </h3>
                  <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <div>
                      <span className="text-zinc-400">平均順位</span>
                      <span className="ml-1 font-medium text-white">
                        {stat.games ? stat.avgRank.toFixed(2) : "-"}位
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-400">トップ率</span>
                      <span className="ml-1 font-medium text-white">
                        {stat.games
                          ? (stat.topRate * 100).toFixed(1)
                          : "-"}
                        %
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-400">連対率</span>
                      <span className="ml-1 font-medium text-white">
                        {stat.games
                          ? (stat.renpaiRate * 100).toFixed(1)
                          : "-"}
                        %
                      </span>
                    </div>
                    <div>
                      <span className="text-zinc-400">トビ率</span>
                      <span className="ml-1 font-medium text-white">
                        {stat.games
                          ? (stat.tobiRate * 100).toFixed(1)
                          : "-"}
                        %
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-xs text-zinc-400">順位分布</div>
                    <div className="space-y-1.5">
                      {([0, 1, 2, 3] as const).map((i) => {
                        const pct = stat.games
                          ? (stat.rankDist[i] / stat.games) * 100
                          : 0;
                        return (
                          <div
                            key={i}
                            className="flex items-center gap-2"
                          >
                            <span className="w-8 shrink-0 text-xs text-zinc-400">
                              {rankLabels[i]}
                            </span>
                            <div className="h-4 min-w-[60px] flex-1 overflow-hidden rounded-md bg-zinc-700">
                              <div
                                className={`h-full ${barColors[i]} rounded-md transition-all`}
                                style={{
                                  width: `${Math.min(Math.max(pct, 0), 100)}%`,
                                }}
                              />
                            </div>
                            <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums text-zinc-200">
                              {pct.toFixed(1)}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* バックアップ・インポート・結果コピー（アプリ最下部） */}
        <div className="mt-8 flex flex-wrap gap-3 pb-8">
          <button
            onClick={exportHistoryBackup}
            className="rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
          >
            バックアップ表示
          </button>
          <button
            onClick={() => { setBackupText(""); setShowBackupModal(true); }}
            className="rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
          >
            インポート
          </button>
          <button
            onClick={() => {
              const lastCompletedIndex = rows.map((r) =>
                players.every((p) => typeof r.points[p] === "number")
              ).lastIndexOf(true);
              const totals = chipValuePerPoint > 0 ? totalWithChips : totalScores;
              const dateStr = gameDate ? `${gameDate.slice(0,4)}/${gameDate.slice(5,7)}/${gameDate.slice(8,10)}` : '';
              const lines: string[] = [];
              lines.push(`【対局結果】${dateStr}`);
              const order = [...players].sort((a,b)=> totals[b]-totals[a]);
              order.forEach((p, idx) => {
                const place = idx+1;
                const name = playerNames[p] || p;
                const val = totals[p] > 0 ? `+${totals[p]}` : `${totals[p]}`;
                let tob = '';
                if (lastCompletedIndex >= 0) {
                  const r = rows[lastCompletedIndex];
                  if (r.ranks && r.ranks[p] === 4) tob = ' (飛)';
                }
                lines.push(`${place}位: ${name} ${val}${tob}`);
              });
              const text = lines.join('\n');
              navigator.clipboard?.writeText(text).then(()=> alert('結果をコピーしました'));
            }}
            className="rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
          >
            結果をコピー
          </button>
        </div>
      </main>
    </div>
  );
}
