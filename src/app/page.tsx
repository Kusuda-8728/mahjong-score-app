"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/utils/supabase";
import type { User } from "@supabase/supabase-js";
import {
  ChipTypeOption,
  HistoryEntry,
  PlayerKey,
  PlayerRecord,
  UserProfile,
  SnapshotRowData,
  UMA_PRESETS,
  UmaTypeOption,
  fetchMatches,
  fetchPlayers,
  fetchUserProfile,
  fetchFriends,
  shareMatchWithUser,
  isChipType,
  isUmaType,
  normalizeHistoryEntries,
} from "@/lib/mahjong-api";

interface RowData {
  points: Record<PlayerKey, number | "">;
  ranks: Record<PlayerKey, number>;
  scores: Record<PlayerKey, number>;
  tobiPlayer: PlayerKey | "";
  manualTieRanks?: Partial<Record<PlayerKey, number>>;
}

type TieRankMode = "shared_split" | "manual_order";
type GameMode = "yonma" | "sanma";

function getTieRankCandidateMap(
  points: Record<PlayerKey, number | "">,
  activePlayers: PlayerKey[]
): Partial<Record<PlayerKey, number[]>> {
  const filled = activePlayers
    .map((p) => ({ key: p, points: points[p] }))
    .filter((x): x is { key: PlayerKey; points: number } => typeof x.points === "number")
    .sort((a, b) => b.points - a.points);
  if (filled.length < activePlayers.length) return {};

  const map: Partial<Record<PlayerKey, number[]>> = {};
  let i = 0;
  while (i < filled.length) {
    let j = i + 1;
    while (j < filled.length && filled[j].points === filled[i].points) j++;
    const size = j - i;
    if (size >= 2) {
      const ranks = Array.from({ length: size }, (_, idx) => i + idx + 1);
      for (let k = i; k < j; k++) {
        map[filled[k].key] = ranks;
      }
    }
    i = j;
  }
  return map;
}

function normalizeManualTieRanks(
  points: Record<PlayerKey, number | "">,
  manualTieRanks: Partial<Record<PlayerKey, number>> | undefined,
  activePlayers: PlayerKey[]
): Partial<Record<PlayerKey, number>> {
  const candidateMap = getTieRankCandidateMap(points, activePlayers);
  if (!manualTieRanks) return {};
  const next: Partial<Record<PlayerKey, number>> = {};
  const usedByGroup = new Map<string, Set<number>>();

  activePlayers.forEach((p) => {
    const candidates = candidateMap[p];
    const raw = manualTieRanks[p];
    if (!candidates || typeof raw !== "number") return;
    if (!candidates.includes(raw)) return;
    const key = candidates.join(",");
    if (!usedByGroup.has(key)) usedByGroup.set(key, new Set<number>());
    const used = usedByGroup.get(key)!;
    if (used.has(raw)) return;
    used.add(raw);
    next[p] = raw;
  });

  return next;
}

function calculateRankAndScore(
  points: Record<PlayerKey, number | "">,
  uma: number[],
  tobiBonus: number,
  tobiPlayer: PlayerKey | "",
  okaPt: number,
  tieRankMode: TieRankMode,
  manualTieRanks: Partial<Record<PlayerKey, number>> | undefined,
  activePlayers: PlayerKey[],
  returnPoints: number
): {
  ranks: Record<PlayerKey, number>;
  scores: Record<PlayerKey, number>;
} {
  const filledPoints = activePlayers.map((p) => ({
    key: p,
    points: typeof points[p] === "number" ? (points[p] as number) : null,
  }));

  const filledCount = filledPoints.filter((x) => x.points !== null).length;
  if (filledCount < activePlayers.length) {
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

  const hasTobi = sorted.some((x) => x.points < 0);
  const tobashita = tobiPlayer as PlayerKey | "";
  const lastRank = activePlayers.length;
  const resolvedManual = normalizeManualTieRanks(points, manualTieRanks, activePlayers);

  const computeScore = (pts: number, umaVal: number, okaBonus: number): number => {
    let score =
      Math.round(((pts - returnPoints) / 1000 + umaVal) * 10) / 10;
    if (okaBonus) score += okaBonus;
    return Math.round(score * 10) / 10;
  };

  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && sorted[j].points === sorted[i].points) j++;
    const group = sorted.slice(i, j);
    const startRank = i + 1;
    const endRank = j;

    if (group.length === 1) {
      const player = group[0];
      const rank = startRank;
      ranks[player.key] = rank;
      const okaBonus = rank === 1 ? okaPt : 0;
      scores[player.key] = computeScore(player.points, uma[rank - 1], okaBonus);
    } else if (tieRankMode === "shared_split") {
      const umaSlice = uma.slice(startRank - 1, endRank);
      const splitUma = umaSlice.reduce((a, b) => a + b, 0) / group.length;
      const splitOka = startRank === 1 ? okaPt / group.length : 0;
      group.forEach((player) => {
        ranks[player.key] = startRank;
        scores[player.key] = computeScore(player.points, splitUma, splitOka);
      });
    } else {
      const candidates = Array.from(
        { length: group.length },
        (_, idx) => startRank + idx
      );
      const selected = group.map((p) => resolvedManual[p.key] ?? 0);
      const valid =
        selected.every((r) => candidates.includes(r)) &&
        new Set(selected).size === group.length;
      if (!valid) {
        group.forEach((player) => {
          ranks[player.key] = 0;
          scores[player.key] = 0;
        });
      } else {
        group.forEach((player, idx) => {
          const rank = selected[idx];
          ranks[player.key] = rank;
          const okaBonus = rank === 1 ? okaPt : 0;
          scores[player.key] = computeScore(player.points, uma[rank - 1], okaBonus);
        });
      }
    }
    i = j;
  }

  if (hasTobi && tobashita && tobiBonus > 0) {
    if (tieRankMode === "shared_split") {
      const minPts = Math.min(...sorted.map((x) => x.points));
      const bottomPlayers = sorted
        .filter((x) => x.points === minPts && ranks[x.key] > 0)
        .map((x) => x.key);
      if (bottomPlayers.length > 0) {
        const penalty = tobiBonus / bottomPlayers.length;
        bottomPlayers.forEach((k) => {
          scores[k] = Math.round((scores[k] - penalty) * 10) / 10;
        });
      }
    } else {
      sorted.forEach((x) => {
        if (ranks[x.key] === lastRank) {
          scores[x.key] = Math.round((scores[x.key] - tobiBonus) * 10) / 10;
        }
      });
    }
    if (ranks[tobashita] > 0) {
      scores[tobashita] = Math.round((scores[tobashita] + tobiBonus) * 10) / 10;
    }
  }

  return { ranks, scores };
}

function checkTotal(
  points: Record<PlayerKey, number | "" | "-">,
  activePlayers: PlayerKey[],
  expectedTotal: number,
  mode: GameMode
): "OK" | "NG" | null {
  const vals = activePlayers.map((p) => points[p]);
  if (vals.some((v) => typeof v !== "number")) return null;
  const total = (vals as number[]).reduce((a, b) => a + b, 0);
  if (mode === "sanma") {
    return total === expectedTotal ? "OK" : "NG";
  }
  // 四麻は既存挙動を維持（100000/120000 を許可）
  return total === 100000 || total === 120000 ? "OK" : "NG";
}

const initialRow: RowData = {
  points: { A: "", B: "", C: "", D: "" },
  ranks: { A: 0, B: 0, C: 0, D: 0 },
  scores: { A: 0, B: 0, C: 0, D: 0 },
  tobiPlayer: "",
  manualTieRanks: {},
};

const DRAFT_KEY = "mahjong_saved";

function loadDraft(): {
  rows?: RowData[];
  playerNames?: Record<PlayerKey, string>;
  gameMode?: GameMode;
  startPoints?: string | number;
  returnPoints?: string | number;
  umaType?: string;
  tieRankMode?: TieRankMode;
  customUma?: string[];
  tobiBonus?: string | number;
  oka?: string | number;
  chipValueType?: string;
  chipCustomValue?: string | number;
  gameDate?: string;
  chipTotals?: Record<PlayerKey, number | "" | "-">;
  editingMatchId?: string | null;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

const defaultRows: RowData[] = [
  {
    ...initialRow,
    points: { A: "", B: "", C: "", D: "" },
    ranks: { A: 0, B: 0, C: 0, D: 0 },
    scores: { A: 0, B: 0, C: 0, D: 0 },
    tobiPlayer: "",
  },
];

export default function Home() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const [initialDraft] = useState(() => loadDraft());
  const draft = initialDraft;
  const [gameMode, setGameMode] = useState<GameMode>(() =>
    draft?.gameMode === "sanma" ? "sanma" : "yonma"
  );
  const activePlayers: PlayerKey[] =
    gameMode === "sanma" ? ["A", "B", "C"] : ["A", "B", "C", "D"];
  const [startPoints, setStartPoints] = useState<string>(() => {
    if (draft?.startPoints != null) return String(draft.startPoints);
    return gameMode === "sanma" ? "35000" : "25000";
  });
  const [returnPoints, setReturnPoints] = useState<string>(() => {
    if (draft?.returnPoints != null) return String(draft.returnPoints);
    return gameMode === "sanma" ? "40000" : "30000";
  });

  const [rows, setRows] = useState<RowData[]>(() => {
    const r = draft?.rows;
    if (!Array.isArray(r) || r.length === 0) return defaultRows;
    return r.map((row) => ({
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
      tobiPlayer: (row.tobiPlayer ?? "") as PlayerKey | "",
      manualTieRanks: normalizeManualTieRanks(
        {
          A: row.points?.A ?? "",
          B: row.points?.B ?? "",
          C: row.points?.C ?? "",
          D: row.points?.D ?? "",
        },
        row.manualTieRanks,
        activePlayers
      ),
    }));
  });

  const [chipTotals, setChipTotals] = useState<
    Record<PlayerKey, number | "" | "-">
  >(() => {
    const ct = draft?.chipTotals;
    if (!ct || typeof ct !== "object") return { A: "", B: "", C: "", D: "" };
    const norm = (v: unknown): number | "" | "-" => {
      if (v === "" || v === "-") return v;
      if (typeof v === "number" && Number.isFinite(v)) return v;
      const s = String(v).trim();
      if (s === "" || s === "-") return s as "" | "-";
      const n = Number(s);
      return Number.isFinite(n) ? n : "";
    };
    return {
      A: norm(ct.A ?? ""),
      B: norm(ct.B ?? ""),
      C: norm(ct.C ?? ""),
      D: norm(ct.D ?? ""),
    };
  });
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareTargetMatch, setShareTargetMatch] = useState<HistoryEntry | null>(null);
  const [shareFriends, setShareFriends] = useState<Awaited<ReturnType<typeof fetchFriends>>>([]);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [backupText, setBackupText] = useState<string>("");
  const [tieRankPicker, setTieRankPicker] = useState<{
    rowIndex: number;
    player: PlayerKey;
  } | null>(null);
  const [playerRegistry, setPlayerRegistry] = useState<PlayerRecord[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<Record<PlayerKey, string | null>>({
    A: null,
    B: null,
    C: null,
    D: null,
  });
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [editingMatchId, setEditingMatchId] = useState<string | null>(() =>
    draft?.editingMatchId ?? null
  );

  const [gameDate, setGameDate] = useState<string>(() => {
    if (draft?.gameDate && typeof draft.gameDate === "string") return draft.gameDate;
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });

  const [chipValueType, setChipValueType] = useState<
    "none" | "500" | "1000" | "custom"
  >(() => {
    const cv = draft?.chipValueType;
    return typeof cv === "string" && isChipType(cv) ? cv : "none";
  });
  const [chipCustomValue, setChipCustomValue] = useState<string>(() =>
    draft?.chipCustomValue != null ? String(draft.chipCustomValue) : "500"
  );

  const [playerNames, setPlayerNames] = useState<Record<PlayerKey, string>>(() => {
    const pn = draft?.playerNames;
    if (!pn || typeof pn !== "object") return { A: "A", B: "B", C: "C", D: "D" };
    return {
      A: String(pn.A ?? "A"),
      B: String(pn.B ?? "B"),
      C: String(pn.C ?? "C"),
      D: String(pn.D ?? "D"),
    };
  });

  const [umaType, setUmaType] = useState<UmaTypeOption>(
    () => {
      const um = draft?.umaType;
      return typeof um === "string" && isUmaType(um) ? um : "10-30";
    }
  );
  const [tieRankMode, setTieRankMode] = useState<TieRankMode>(() => {
    return draft?.tieRankMode === "manual_order" ? "manual_order" : "shared_split";
  });
  const [customUma, setCustomUma] = useState<[string, string, string, string]>(
    () => {
      const cu = draft?.customUma;
      if (!Array.isArray(cu) || cu.length !== 4) return ["30", "10", "-10", "-30"];
      return cu.map((v) => String(v ?? "")) as [string, string, string, string];
    }
  );
  const [tobiBonus, setTobiBonus] = useState<string>(() =>
    draft?.tobiBonus != null ? String(draft.tobiBonus) : "10"
  );

  const uma: number[] = useMemo(() => {
    if (gameMode === "yonma") {
      if (umaType !== "custom") return UMA_PRESETS[umaType] ?? UMA_PRESETS["10-30"];
      return customUma.map((v, i) => {
        const n = parseFloat(v);
        return Number.isFinite(n)
          ? n
          : (UMA_PRESETS["10-30"] as [number, number, number, number])[i];
      });
    }
    // 三麻
    if (umaType === "10-20") return [20, 10, -30];
    if (umaType === "10-30") return [30, 10, -40];
    if (umaType === "5-10") return [10, 5, -15];
    const sanmaCustom = [customUma[0], customUma[1], customUma[2]].map((v, i) => {
      const n = parseFloat(v);
      const fallback = [20, 10, -30][i];
      return Number.isFinite(n) ? n : fallback;
    });
    return sanmaCustom;
  }, [gameMode, umaType, customUma]);

  const startPointsNum = Math.max(0, parseInt(startPoints, 10) || 0);
  const returnPointsNum = Math.max(0, parseInt(returnPoints, 10) || 0);
  const tobiBonusNum = Math.max(0, parseInt(tobiBonus, 10) || 0);
  // オカは「返し点 - 持ち点」を人数分集計し、1000点単位に換算して扱う
  const okaNum =
    ((returnPointsNum - startPointsNum) * activePlayers.length) / 1000;

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
        const normalizedManual = normalizeManualTieRanks(
          row.points,
          row.manualTieRanks,
          activePlayers
        );
        const { ranks, scores } = calculateRankAndScore(
          row.points,
          uma,
          tobiBonusNum,
          row.tobiPlayer,
          okaNum,
          tieRankMode,
          normalizedManual,
          activePlayers,
          returnPointsNum
        );
        return { ...row, manualTieRanks: normalizedManual, ranks, scores };
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- derived from state
  }, [gameMode, umaType, customUma.join(","), tobiBonus, tieRankMode, returnPoints, startPoints]);

  const refreshHistory = async (userId: string) => {
    try {
      const { matches, sharedIds } = await fetchMatches(userId);
      setHistory(normalizeHistoryEntries(matches, sharedIds));
    } catch (e) {
      console.error("load history failed", e);
    }
  };

  // -- Auth check & persistence: load saved state & history on mount
  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/lp");
        return;
      }
      setCurrentUser(session.user);
      setAuthChecked(true);

      try {
        const saved = localStorage.getItem(DRAFT_KEY);
        if (saved) {
          const data = JSON.parse(saved);
          if (data) {
            if (data.rows) setRows(data.rows);
            if (data.playerNames) setPlayerNames(data.playerNames);
            if (data.gameMode === "sanma" || data.gameMode === "yonma") {
              setGameMode(data.gameMode);
            }
            if (data.startPoints !== undefined) setStartPoints(String(data.startPoints));
            if (data.returnPoints !== undefined) setReturnPoints(String(data.returnPoints));
            if (data.umaType) setUmaType(data.umaType);
            if (data.tieRankMode === "manual_order" || data.tieRankMode === "shared_split") {
              setTieRankMode(data.tieRankMode);
            }
            if (data.customUma) setCustomUma(data.customUma);
            if (data.tobiBonus) setTobiBonus(String(data.tobiBonus));
            if (data.chipValueType) setChipValueType(data.chipValueType);
            if (data.chipCustomValue) setChipCustomValue(String(data.chipCustomValue));
            if (data.gameDate) setGameDate(data.gameDate);
            if (data.chipTotals) setChipTotals(data.chipTotals);
            if (data.editingMatchId !== undefined) setEditingMatchId(data.editingMatchId);
          }
        }
      } catch (e) {
        console.error("load saved failed", e);
      }
      try {
        const [profile, players, matchResult] = await Promise.all([
          fetchUserProfile(session.user.id),
          fetchPlayers(session.user.id),
          fetchMatches(session.user.id),
        ]);
        if (profile) {
          setUserProfile(profile);
        } else {
          setUserProfile(null);
        }
        setPlayerRegistry(players);
        setHistory(normalizeHistoryEntries(matchResult.matches, matchResult.sharedIds));
      } catch (e) {
        console.error("initial data load failed", e);
      }
    };
    init();
  }, [router]);
  const playerOptions = useMemo(() => {
    const options = playerRegistry.map((p) => ({
      value: p.name,
      label: p.name,
      id: p.id,
    }));
    if (
      userProfile &&
      !options.some((opt) => opt.value === userProfile.display_name)
    ) {
      options.unshift({
        value: userProfile.display_name,
        label: userProfile.display_name,
        id: userProfile.user_id,
      });
    }
    return options;
  }, [playerRegistry, userProfile]);
  // -- Ref to hold latest state for save-on-unmount
  const latestStateRef = useRef({
    rows,
    playerNames,
    gameMode,
    startPoints,
    returnPoints,
    umaType,
    tieRankMode,
    customUma,
    tobiBonus,
    chipValueType,
    chipCustomValue,
    gameDate,
    chipTotals,
    editingMatchId,
  });
  latestStateRef.current = {
    rows,
    playerNames,
    gameMode,
    startPoints,
    returnPoints,
    umaType,
    tieRankMode,
    customUma,
    tobiBonus,
    chipValueType,
    chipCustomValue,
    gameDate,
    chipTotals,
    editingMatchId,
  };

  // -- Auto-save current state (on change and on unmount)
  useEffect(() => {
    const payload = latestStateRef.current;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
    } catch (e) {
      console.error("autosave failed", e);
    }
    return () => {
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify(latestStateRef.current)
        );
      } catch (e) {
        console.error("unmount save failed", e);
      }
    };
  }, [rows, playerNames, gameMode, startPoints, returnPoints, umaType, tieRankMode, customUma, tobiBonus, chipValueType, chipCustomValue, gameDate, chipTotals, editingMatchId]);

  // -- Save on page unload (refresh, close tab) for reliability
  useEffect(() => {
    const onBeforeUnload = () => {
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify(latestStateRef.current)
        );
      } catch {
        // ignore
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  const updatePoint = (rowIndex: number, player: PlayerKey, value: string) => {
    const parsed: number | "" = value === "" ? "" : parseInt(value, 10);
    if (value !== "" && isNaN(parsed as number)) return;

    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[rowIndex] };
      row.points = { ...row.points, [player]: parsed };
      row.manualTieRanks = normalizeManualTieRanks(row.points, row.manualTieRanks, activePlayers);
      const { ranks, scores } = calculateRankAndScore(
        row.points,
        uma,
        tobiBonusNum,
        row.tobiPlayer,
        okaNum,
        tieRankMode,
        row.manualTieRanks,
        activePlayers,
        returnPointsNum
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
        okaNum,
        tieRankMode,
        row.manualTieRanks,
        activePlayers,
        returnPointsNum
      );
      row.ranks = ranks;
      row.scores = scores;
      next[rowIndex] = row;
      return next;
    });
  };

  const updateManualTieRank = (
    rowIndex: number,
    player: PlayerKey,
    rank: number
  ) => {
    setRows((prev) => {
      const next = [...prev];
      const row = { ...next[rowIndex] };
      const pts = row.points[player];
      if (typeof pts !== "number") return prev;

      const groupPlayers = activePlayers.filter(
        (k) => row.points[k] === pts
      );
      if (groupPlayers.length < 2) return prev;

      const manual = { ...(row.manualTieRanks ?? {}) };
      manual[player] = rank;
      groupPlayers.forEach((k) => {
        if (k !== player && manual[k] === rank) {
          delete manual[k];
        }
      });
      row.manualTieRanks = normalizeManualTieRanks(row.points, manual, activePlayers);

      const { ranks, scores } = calculateRankAndScore(
        row.points,
        uma,
        tobiBonusNum,
        row.tobiPlayer,
        okaNum,
        tieRankMode,
        row.manualTieRanks,
        activePlayers,
        returnPointsNum
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
      activePlayers.every((k) => typeof r.points[k] === "number")
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
    const pts: Record<PlayerKey, number> = {
      A: typeof row.points.A === "number" ? row.points.A : 0,
      B: typeof row.points.B === "number" ? row.points.B : 0,
      C: typeof row.points.C === "number" ? row.points.C : 0,
      D: typeof row.points.D === "number" ? row.points.D : 0,
    };
    const ranks = row.ranks;
    const lastRank = activePlayers.length;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert("ログインしてください。");
      router.replace("/login");
      return;
    }

    const namesForSave: Record<PlayerKey, string> = {
      A: playerNames.A || "",
      B: playerNames.B || "",
      C: playerNames.C || "",
      D: playerNames.D || "",
    };
    if (userProfile?.display_name) {
      if (!namesForSave.A || namesForSave.A === "A") {
        namesForSave.A = userProfile.display_name;
      }
    }
    const normalizedNames: Record<PlayerKey, string> = {
      A: namesForSave.A || "A",
      B: namesForSave.B || "B",
      C: namesForSave.C || "C",
      D: namesForSave.D || "D",
    };
    if (normalizedNames.A !== playerNames.A) {
      setPlayerNames((prev) => ({ ...prev, A: normalizedNames.A }));
    }

    const record = {
      user_id: user.id,
      game_date: gameDateVal,
      player_a: normalizedNames.A,
      player_b: normalizedNames.B,
      player_c: normalizedNames.C,
      player_d: normalizedNames.D,
      score_a: pts.A,
      score_b: pts.B,
      score_c: pts.C,
      score_d: pts.D,
      rank_a: ranks.A || null,
      rank_b: ranks.B || null,
      rank_c: ranks.C || null,
      rank_d: ranks.D || null,
      tobi_a: ranks.A === lastRank && pts.A < 0,
      tobi_b: ranks.B === lastRank && pts.B < 0,
      tobi_c: ranks.C === lastRank && pts.C < 0,
      tobi_d: ranks.D === lastRank && pts.D < 0,
      chip_a: parseChip(chipTotals.A),
      chip_b: parseChip(chipTotals.B),
      chip_c: parseChip(chipTotals.C),
      chip_d: parseChip(chipTotals.D),
      uma_type: umaType,
      custom_uma:
        umaType === "custom"
          ? (gameMode === "sanma"
              ? customUma.slice(0, 3)
              : customUma
            ).map((s) => parseInt(s, 10) || 0)
          : null,
      tobi_bonus: parseInt(String(tobiBonus), 10) || 0,
      oka: okaNum,
      chip_value_type: chipValueType,
      chip_custom_value:
        chipValueType === "custom"
          ? parseInt(String(chipCustomValue), 10) || null
          : null,
      snapshot: {
        rows,
        playerNames: normalizedNames,
        gameMode,
        startPoints,
        returnPoints,
        umaType,
        tieRankMode,
        customUma,
        tobiBonus,
        oka: okaNum,
        chipValueType,
        chipCustomValue,
        gameDate,
        chipTotals,
        ownerUserId: user.id,
        ownerDisplayName: userProfile?.display_name,
      },
    };

    try {
      if (editingMatchId) {
        const { user_id: _uid, ...updateRecord } = record;
        const { error } = await supabase
          .from("matches")
          .update(updateRecord)
          .eq("id", editingMatchId);
        if (error) throw error;
        setEditingMatchId(null);
      } else {
        const { error } = await supabase.from("matches").insert(record);
        if (error) throw error;
      }
      if (currentUser) {
        await refreshHistory(currentUser.id);
      }
      alert(editingMatchId ? "修正を保存しました。" : "保存しました。");
    } catch (e) {
      console.error("save failed", e);
      alert("保存に失敗しました。\n" + (e instanceof Error ? e.message : String(e)));
    }
  };

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

  const loadHistoryEntry = (id: string | number, forEdit = false) => {
    const key = typeof id === "number" ? String(id) : id;
    const entry =
      history.find((h) => h.id === key) ??
      history.find((h) => String(h.id) === key) ??
      history.find((h) => Number(h.id) === Number(key));
    if (!entry) return;
    const s = entry.snapshot;
    if (s) {
      const modeFromSnapshot: GameMode =
        s.gameMode === "sanma" ? "sanma" : "yonma";
      const playersForSnapshot: PlayerKey[] =
        modeFromSnapshot === "sanma" ? ["A", "B", "C"] : ["A", "B", "C", "D"];
      setGameMode(modeFromSnapshot);
      if (s.startPoints !== undefined) setStartPoints(String(s.startPoints));
      if (s.returnPoints !== undefined) setReturnPoints(String(s.returnPoints));
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
          manualTieRanks: normalizeManualTieRanks(
            {
              A: row.points?.A ?? "",
              B: row.points?.B ?? "",
              C: row.points?.C ?? "",
              D: row.points?.D ?? "",
            },
            row.manualTieRanks,
            playersForSnapshot
          ),
        }));
        setRows(normalizedRows);
      }
      if (s.playerNames) setPlayerNames(s.playerNames);
      if (s.umaType && isUmaType(s.umaType)) {
        setUmaType(s.umaType);
      }
      if (s.tieRankMode === "manual_order" || s.tieRankMode === "shared_split") {
        setTieRankMode(s.tieRankMode);
      } else {
        setTieRankMode("shared_split");
      }
      if (s.customUma && s.customUma.length >= 3) {
        setCustomUma(
          [
            String(s.customUma[0] ?? "30"),
            String(s.customUma[1] ?? "10"),
            String(s.customUma[2] ?? "-10"),
            String(s.customUma[3] ?? "-30"),
          ]
        );
      }
      if (s.tobiBonus !== undefined) setTobiBonus(String(s.tobiBonus));
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
    if (forEdit) setEditingMatchId(key);
    else setEditingMatchId(null);
    setShowHistoryModal(false);
  };

  const newGame = () => {
    if (!confirm("現在の対局をリセットして新規作成しますか？ 保存していない変更は失われます。")) return;
    setEditingMatchId(null);
    setRows([{ ...initialRow }]);
    setPlayerNames({ A: "A", B: "B", C: "C", D: "D" });
    setUmaType(gameMode === "sanma" ? "10-20" : "10-30");
    setTieRankMode("shared_split");
    setCustomUma(["30", "10", "-10", "-30"]);
    setStartPoints(gameMode === "sanma" ? "35000" : "25000");
    setReturnPoints(gameMode === "sanma" ? "40000" : "30000");
    setTobiBonus("10");
    setChipValueType("none");
    setChipCustomValue("500");
    setChipTotals({ A: "", B: "", C: "", D: "" });
  };

  const players = activePlayers;
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

  useEffect(() => {
    if (!userProfile) return;
    setPlayerNames((prev) => {
      if (prev.A && prev.A !== "A") return prev;
      if (prev.A === userProfile.display_name) return prev;
      return { ...prev, A: userProfile.display_name };
    });
  }, [userProfile]);
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
    (r) => players.every((p) => typeof r.points[p] === "number")
  );

  const playerStats = players.map((p) => {
    const games = completedRows.length;
    const lastRank = players.length;
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
      const hasTobi = players.some((p) => {
        const v = r.points[p];
        return typeof v === "number" && v < 0;
      });
      return hasTobi && r.ranks[p] === lastRank;
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
        {!userProfile && (
          <div className="mb-6 rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            ユーザー名が未登録です。<Link href="/profile" className="underline underline-offset-2 hover:text-amber-100">プロフィールページ</Link>で登録すると、スコア表で自分の名前が自動入力されます。
          </div>
        )}

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
                ? (() => {
                    const d = new Date(`${gameDate}T00:00:00`);
                    const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
                    const wd = Number.isNaN(d.getTime()) ? "" : `(${weekdays[d.getDay()]})`;
                    return `${gameDate.slice(0, 4)}/${gameDate.slice(5, 7)}/${gameDate.slice(8, 10)} ${wd}`.trim();
                  })()
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
              <label className="mb-1 block text-xs text-zinc-400">対局モード</label>
              <select
                value={gameMode}
                onChange={(e) => {
                  const nextMode = e.target.value as GameMode;
                  setGameMode(nextMode);
                  if (nextMode === "sanma") {
                    setUmaType("10-20");
                    setStartPoints("35000");
                    setReturnPoints("40000");
                  } else {
                    setUmaType("10-30");
                    setStartPoints("25000");
                    setReturnPoints("30000");
                  }
                }}
                className="rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-500"
              >
                <option value="yonma">四麻</option>
                <option value="sanma">三麻</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">持ち点</label>
              <input
                type="number"
                min={0}
                value={startPoints}
                onChange={(e) => setStartPoints(e.target.value)}
                className="w-24 rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-400">返し点</label>
              <input
                type="number"
                min={0}
                value={returnPoints}
                onChange={(e) => setReturnPoints(e.target.value)}
                className="w-24 rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-500"
              />
            </div>
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
                  {(gameMode === "sanma" ? [0, 1, 2] : [0, 1, 2, 3]).map((i) => (
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
              <label className="mb-1 block text-xs text-zinc-400">同点時の順位処理</label>
              <select
                value={tieRankMode}
                onChange={(e) => setTieRankMode(e.target.value as TieRankMode)}
                className="rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-500"
              >
                <option value="shared_split">同順扱い（ウマ・オカ割り）</option>
                <option value="manual_order">順位指定（?タップで順位選択）</option>
              </select>
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

        <section className="mb-4 rounded-lg border border-zinc-700 bg-zinc-900/80 p-4">
          <h2 className="text-sm font-medium text-white">プレイヤー設定</h2>
          <p className="mt-1 text-xs text-zinc-400">
            登録済みのプレイヤーや直接入力した名前は自動的にスコア表へ反映されます。
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {players.map((p) => (
              <div key={`player-config-${p}`} className="rounded border border-zinc-700 bg-zinc-900/80 px-3 py-3">
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>{p}</span>
                  <span className="text-zinc-300">{playerNames[p] || p}</span>
                </div>
                <div className="mt-2 flex flex-col gap-2">
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
                    className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-500"
                  >
                    <option value="">選択</option>
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
                    className="rounded border border-zinc-700 bg-transparent px-2 py-1 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-500"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="mb-2 text-xs text-zinc-500">
          登録済みプレイヤーの編集は{" "}
          <Link href="/profile" className="text-emerald-300 hover:text-emerald-200 underline underline-offset-2">
            プロフィールページ
          </Link>
          から行えます。
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className="border border-zinc-600 bg-zinc-900 px-1 py-[6px]">
                  <span className="sr-only">局数</span>
                </th>
                <th className="border border-zinc-600 bg-zinc-900 px-1 py-[6px] w-12">飛賞</th>
                {players.map((p, idx) => (
                  <th key={p} className={`border border-zinc-600 bg-zinc-900 px-1 py-[6px] text-center font-bold ${idx < players.length - 1 ? 'border-r-4 border-black' : ''}`}>
                    <div className="flex flex-col items-center gap-0.5">
                      <span>{p}</span>
                      <span className="max-w-[56px] truncate text-[10px] text-zinc-300 leading-tight">
                        {playerNames[p] || p}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const expectedTotal =
                  gameMode === "sanma" ? startPointsNum * 3 : startPointsNum * 4;
                const check = checkTotal(row.points, activePlayers, expectedTotal, gameMode);
                const checkIcon = check === "OK" ? "✅" : check === "NG" ? "❌" : "—";
                const ptsArr = activePlayers.map((k) => row.points[k]);
                const tieCandidateMap = getTieRankCandidateMap(row.points, activePlayers);
                const hasTie = Object.keys(tieCandidateMap).length > 0;
                const hasTobi =
                  ptsArr.every((v) => typeof v === "number") &&
                  ptsArr.some((v: unknown) => typeof v === "number" && v < 0);
                const tobiMissing = tobiBonusNum > 0 && hasTobi && !row.tobiPlayer;
                return (
                  <Fragment key={i}>
                    <tr>
                      <td className="border border-zinc-600 px-1.5 py-[6px] align-top" rowSpan={2}>{i + 1}</td>
                      <td className="border border-zinc-600 px-0.5 py-[6px] align-top w-12 min-w-[2.5rem]" rowSpan={2}>
                        <div className={`text-xs ${tobiMissing ? "font-semibold text-red-400" : ""}`}>
                          {tobiMissing ? "✖" : checkIcon}
                        </div>
                        <div className="mt-1 min-w-0">
                          <select
                            value={row.tobiPlayer}
                            onChange={(e) => updateTobiPlayer(i, e.target.value as PlayerKey | '')}
                            className="min-w-0 w-full max-w-full rounded border border-zinc-700 bg-zinc-800 pl-0.5 pr-1 py-0.5 text-xs text-zinc-100"
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
                        <td key={p} className={`border border-zinc-600 px-1 py-[6px] text-center ${idx < players.length - 1 ? 'border-r-4 border-black' : ''}`}>
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
                      {players.map((p, idx) => {
                        const shouldShowScore = check === "OK" && !tobiMissing;
                        const showManualTiePick =
                          shouldShowScore &&
                          tieRankMode === "manual_order" &&
                          hasTie &&
                          rows[i].ranks[p] === 0 &&
                          !!tieCandidateMap[p];
                        return (
                          <td key={p} className={`border border-zinc-600 px-1.5 py-[6px] font-medium tabular-nums ${idx < players.length - 1 ? "border-r-4 border-black" : ""}`}>
                            <div className="flex items-center gap-1.5">
                              {showManualTiePick ? (
                                <button
                                  type="button"
                                  onClick={() => setTieRankPicker({ rowIndex: i, player: p })}
                                  className="w-4 shrink-0 text-left text-xs font-semibold text-amber-300 underline underline-offset-2"
                                  aria-label={`第${i + 1}局 ${p}の順位を選択`}
                                >
                                  ?
                                </button>
                              ) : (
                                <span className={`w-4 shrink-0 text-left text-xs ${rows[i].ranks[p] === 1 ? "text-amber-300 font-semibold" : "text-zinc-100"}`}>
                                  {shouldShowScore ? (rows[i].ranks[p] > 0 ? rows[i].ranks[p] : "-") : "-"}
                                </span>
                              )}
                              <span className="flex-1 text-center">
                                {shouldShowScore ? (() => {
                                  const sc = rows[i].scores[p];
                                  if (sc === 0) return <span className="text-xs text-zinc-500">-</span>;
                                  const positive = sc > 0;
                                  const text = positive ? "text-blue-300" : "text-red-400";
                                  return <span className={`${text} text-xs`}>{positive ? `+${sc}` : sc}</span>;
                                })() : <span className="text-xs text-zinc-500">-</span>}
                              </span>
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  </Fragment>
                );
              })}
              <tr className="bg-zinc-800 font-medium">
                <td className="border border-zinc-600 px-1 py-[6px]">計</td>
                <td className="border border-zinc-600 px-1 py-[6px]">-</td>
                {players.map((p, idx) => {
                  const stat = playerStats.find((s) => s.player === p);
                  return (
                    <td key={p} className={`border border-zinc-600 px-1 py-[6px] text-center ${idx < players.length - 1 ? 'border-r-4 border-black' : ''}`}>
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
            局追加
          </button>
          <button
            onClick={saveCurrentToHistory}
            className={`rounded border px-3 py-2 text-sm ${editingMatchId ? "border-amber-500 bg-amber-900/40 text-amber-100" : "border-zinc-600 bg-zinc-800 text-zinc-100"}`}
          >
            {editingMatchId ? "修正して保存" : "保存"}
          </button>
          <button
            onClick={() => setShowHistoryModal(true)}
            className="rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
          >
            履歴
          </button>
          <button
            onClick={() => { if (confirm('新規作成しますか？ 現在のデータは保存されていない場合失われます')) newGame(); }}
            className="rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100"
          >
            新規作成
          </button>
        </div>

        {tieRankPicker && (() => {
          const row = rows[tieRankPicker.rowIndex];
          if (!row) return null;
          const candidateMap = getTieRankCandidateMap(row.points, activePlayers);
          const candidates = candidateMap[tieRankPicker.player] ?? [];
          if (candidates.length === 0) return null;
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
              <div className="w-full max-w-xs rounded-lg border border-zinc-700 bg-zinc-900 p-4 text-sm">
                <div className="mb-2 text-sm font-medium text-white">同点時の順位指定</div>
                <div className="mb-3 text-xs text-zinc-400">
                  第{tieRankPicker.rowIndex + 1}局 / {tieRankPicker.player} の順位を選択
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {candidates.map((rank) => (
                    <button
                      key={rank}
                      type="button"
                      onClick={() => {
                        updateManualTieRank(tieRankPicker.rowIndex, tieRankPicker.player, rank);
                        setTieRankPicker(null);
                      }}
                      className="rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 hover:bg-zinc-700"
                    >
                      {rank}位
                    </button>
                  ))}
                </div>
                <div className="mt-3 text-right">
                  <button
                    type="button"
                    onClick={() => setTieRankPicker(null)}
                    className="text-xs text-zinc-300 hover:text-white"
                  >
                    閉じる
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

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
        {history.map((h) => {
          const mode = h.snapshot?.gameMode === "sanma" ? "sanma" : "yonma";
          const playerKeys: PlayerKey[] =
            mode === "sanma" ? ["A", "B", "C"] : ["A", "B", "C", "D"];
          const participants = playerKeys
            .map((k) => h.players[k])
            .filter(Boolean)
            .join("、");
          const gameDateText = h.snapshot?.gameDate
            ? `${h.snapshot.gameDate.slice(0, 4)}/${h.snapshot.gameDate.slice(5, 7)}/${h.snapshot.gameDate.slice(8, 10)}`
            : new Date(h.date).toLocaleDateString();

          return (
          <div
            key={h.id}
            className={`flex items-center justify-between rounded px-3 py-2 border ${
              mode === "sanma"
                ? "border-emerald-700/60 bg-emerald-950/10"
                : "border-sky-700/60 bg-sky-950/10"
            }`}
          >
                    <div>
                      <div className="flex items-center gap-1.5 text-sm text-zinc-200">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                            mode === "sanma"
                              ? "bg-emerald-600/20 text-emerald-300"
                              : "bg-sky-600/20 text-sky-300"
                          }`}
                        >
                          {mode === "sanma" ? "三麻" : "四麻"}
                        </span>
                        <span>{`${gameDateText} ${participants}`}</span>
                        {h.isShared && (
                          <span className="rounded bg-zinc-600 px-1.5 py-0.5 text-[10px] text-zinc-300">
                            共有
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-500">
                        対局日: {gameDateText} / 参加: {playerKeys.map((k) => h.players[k]).filter(Boolean).join(", ")} / トップ: {h.players?.[h.topPlayer] ?? h.topPlayer}
                      </div>
                    </div>
                    <div className="flex gap-2">
              <button onClick={() => loadHistoryEntry(h.id)} className="rounded bg-emerald-600 px-2 py-1 text-xs">読み込み</button>
                      {!h.isShared && (
                        <button onClick={() => loadHistoryEntry(h.id, true)} className="rounded bg-amber-600 px-2 py-1 text-xs">修正</button>
                      )}
                      {!h.isShared && (
                        <button
                          onClick={async () => {
                            if (!currentUser) return;
                            try {
                              const list = await fetchFriends(currentUser.id);
                              setShareTargetMatch(h);
                              setShareFriends(list.filter((f) => f.status === "accepted"));
                              setShareMessage(null);
                              setShowShareModal(true);
                            } catch (e) {
                              alert("フレンド一覧の取得に失敗しました");
                            }
                          }}
                          className="rounded bg-blue-600 px-2 py-1 text-xs"
                        >
                          共有
                        </button>
                      )}
                      {!h.isShared && (
                        <button onClick={async () => {
                          if (!confirm('この履歴を削除しますか？')) return;
                          try {
                            const { error } = await supabase.from("matches").delete().eq("id", h.id);
                            if (error) throw error;
                            if (currentUser) {
                              await refreshHistory(currentUser.id);
                            }
                          } catch (e) {
                            alert("削除に失敗しました。\n" + (e instanceof Error ? e.message : String(e)));
                          }
                        }} className="rounded bg-red-700 px-2 py-1 text-xs">削除</button>
                      )}
                    </div>
                  </div>
          );
        })}
              </div>
            </div>
          </div>
        )}

        {/* 共有モーダル */}
        {showShareModal && shareTargetMatch && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="w-full max-w-md rounded-lg bg-zinc-900 border border-zinc-700 p-4 text-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="text-base font-medium text-white">
                  共有: {shareTargetMatch.name}
                </div>
                <button
                  className="text-xs text-zinc-300 hover:text-white"
                  onClick={() => {
                    setShowShareModal(false);
                    setShareTargetMatch(null);
                  }}
                >
                  閉じる
                </button>
              </div>
              {shareMessage && (
                <div className="mb-3 rounded bg-zinc-800 px-3 py-2 text-xs text-amber-300">
                  {shareMessage}
                </div>
              )}
              {shareFriends.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  フレンドがいません。
                  <Link href="/friends" className="ml-1 text-emerald-400 hover:underline">
                    フレンドページ
                  </Link>
                  で追加してください。
                </p>
              ) : (
                <ul className="space-y-2 max-h-60 overflow-y-auto">
                  {shareFriends.map((f) => (
                    <li key={f.id}>
                      <button
                        onClick={async () => {
                          if (!currentUser) return;
                          try {
                            await shareMatchWithUser(
                              currentUser.id,
                              shareTargetMatch.id,
                              f.friend_id
                            );
                            setShareMessage(`${f.display_name} さんに共有しました`);
                            setShowShareModal(false);
                            setShareTargetMatch(null);
                          } catch (e) {
                            const err = e as Error;
                            if (err.message?.includes("duplicate") || err.message?.includes("unique")) {
                              setShareMessage("すでに共有済みです");
                            } else {
                              setShareMessage("共有に失敗しました");
                            }
                          }
                        }}
                        className="w-full rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-left text-sm text-zinc-100 hover:bg-zinc-700"
                      >
                        {f.display_name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
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

        {/* 対戦データ分析 */}
        <section className="mt-8 rounded-lg border border-zinc-700 bg-zinc-900/80 p-4">
          <h2 className="mb-4 text-base font-medium text-white">
            対戦データ分析
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {playerStats.map((stat) => {
              const barColors = [
                "bg-amber-400", // 1着: ゴールド/黄
                "bg-blue-400", // 2着: シルバー/青
                "bg-amber-700", // 3着: ブロンズ/茶
                "bg-lime-500", // 4着: 黄緑
              ];
              const rankLabels = ["1着", "2着", "3着", "4着"];
              return (
                <div
                  key={stat.player}
                  className="rounded-lg border border-zinc-700 bg-zinc-800/60 p-4"
                >
                  <h3 className="mb-3 text-sm font-medium text-white">
                    {playerNames[stat.player] || stat.player}
                    <span className="ml-2 text-xs font-normal text-zinc-400">
                      対戦数：{stat.games}
                    </span>
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

        {/* バックアップ・インポート・結果コピー・全データ削除（アプリ最下部・管理者のみ表示） */}
        {currentUser?.email === "toshi_k0728@yahoo.co.jp" && (
          <div className="mt-8 flex flex-wrap gap-3 pb-8">
            <button
              onClick={async () => {
                if (!confirm("全ての対局履歴を削除します。よろしいですか？")) return;
                if (!currentUser) return;
                try {
                  const { error } = await supabase.from("matches").delete().eq("user_id", currentUser.id);
                  if (error) throw error;
                  setHistory([]);
                  await refreshHistory(currentUser.id);
                  alert("全ての対局履歴を削除しました。");
                } catch (e) {
                  console.error("delete failed", e);
                  alert("削除に失敗しました。");
                }
              }}
              className="rounded border border-red-600/60 bg-red-900/30 px-3 py-2 text-sm text-red-300 hover:bg-red-900/50"
            >
              全データ削除
            </button>
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
        )}
      </main>
    </div>
  );
}
