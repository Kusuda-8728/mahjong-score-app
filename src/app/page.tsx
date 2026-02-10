"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/utils/supabase";

const STARTING_POINTS = 30000;
const VALID_TOTALS = [100000, 120000] as const;

const UMA_PRESETS: Record<string, [number, number, number, number]> = {
  // values are in pt and follow the sequence [1位,2位,3位,4位]
  "10-20": [20, 10, -10, -20],
  "10-30": [30, 10, -10, -30],
  "5-10": [10, 5, -5, -10],
};

type PlayerKey = "A" | "B" | "C" | "D";

interface RowData {
  points: Record<PlayerKey, number | "">;
  ranks: Record<PlayerKey, number>;
  scores: Record<PlayerKey, number>;
  tobiPlayer: PlayerKey | "";
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

export default function Home() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);

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
  const [history, setHistory] = useState<Array<any>>([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showNewConfirm, setShowNewConfirm] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [backupText, setBackupText] = useState<string>("");
  const [showAggregateModal, setShowAggregateModal] = useState(false);
  const [aggregateStats, setAggregateStats] = useState<Record<string, any> | null>(null);

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

  const fetchHistory = async () => {
    try {
      const { data, error } = await supabase
        .from("matches")
        .select("*")
        .order("game_date", { ascending: false });
      if (error) throw error;
      const entries = (data || []).map((m: any) => {
        const players = {
          A: m.player_a || "A",
          B: m.player_b || "B",
          C: m.player_c || "C",
          D: m.player_d || "D",
        };
        const scores = { A: m.score_a ?? 0, B: m.score_b ?? 0, C: m.score_c ?? 0, D: m.score_d ?? 0 };
        let top: PlayerKey = "A";
        (["A", "B", "C", "D"] as const).forEach((k) => {
          if (scores[k] > scores[top]) top = k;
        });
        const gd = m.game_date || "";
        const name =
          gd.length >= 10
            ? `${gd.slice(0, 4)}/${gd.slice(5, 7)}/${gd.slice(8, 10)} ${Object.values(players).join("、")}`
            : `${Object.values(players).join("、")}`;
        const snap = m.snapshot || {};
        return {
          id: m.id,
          name,
          date: m.created_at,
          players,
          topPlayer: top,
          snapshot: {
            rows: snap.rows,
            playerNames: snap.playerNames || players,
            umaType: snap.umaType ?? m.uma_type,
            customUma: snap.customUma ?? [String(m.custom_uma?.[0] ?? 30), String(m.custom_uma?.[1] ?? 10), String(m.custom_uma?.[2] ?? -10), String(m.custom_uma?.[3] ?? -30)],
            tobiBonus: snap.tobiBonus ?? m.tobi_bonus,
            oka: snap.oka ?? m.oka,
            chipValueType: snap.chipValueType ?? m.chip_value_type,
            chipCustomValue: snap.chipCustomValue ?? m.chip_custom_value,
            gameDate: snap.gameDate ?? gd,
            chipTotals: snap.chipTotals ?? {
              A: m.chip_a ?? "",
              B: m.chip_b ?? "",
              C: m.chip_c ?? "",
              D: m.chip_d ?? "",
            },
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
      await fetchHistory();
    };
    init();
  }, [router]);

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
  const saveCurrentToHistory = async (name?: string) => {
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

  // Compute aggregated stats from Supabase history (rule-based filtering)
  const computeAggregateStats = () => {
    const map: Record<string, any> = {};
    const playersArr = ["A", "B", "C", "D"] as const;

    history.forEach((h: any) => {
      const snap = h.snapshot;
      if (!snap || !snap.rows) return;

      const tobiBonusNum = Math.max(0, parseInt(String(snap.tobiBonus ?? snap.tobi_bonus ?? 0), 10) || 0);
      const chipType = snap.chipValueType ?? snap.chip_value_type;
      const chipVal =
        chipType === "none"
          ? 0
          : chipType === "500"
            ? 500
            : chipType === "1000"
              ? 1000
              : Math.max(0, parseInt(String(snap.chipCustomValue ?? snap.chip_custom_value ?? 0), 10) || 0);
      const hasTobiRule = tobiBonusNum > 0;
      const hasChipRule = chipVal > 0;

      snap.rows.forEach((r: any) => {
        const pts = playersArr.map((k) => r.points?.[k]);
        if (pts.some((v: unknown) => typeof v !== "number")) return;

        const hasTobi = pts.some((v: unknown) => typeof v === "number" && v < 0);

        playersArr.forEach((k) => {
          const name = (snap.playerNames && snap.playerNames[k]) || (snap as any)[`player_${k.toLowerCase()}`] || k;
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
            };
          }
          const entry = map[normalized];
          const rank = r.ranks?.[k];
          const score = r.scores?.[k] ?? 0;

          if (typeof rank === "number" && rank >= 1 && rank <= 4) {
            entry.games += 1;
            entry.totalScore += score;
            entry.sumRank += rank;
            entry.rankDist[rank - 1] += 1;

            if (hasTobiRule) {
              entry.gamesWithTobiRule += 1;
              if (hasTobi && rank === 4) entry.tobiCount += 1;
            }
          }
        });
      });

      // chipTotals は対局単位で1回だけ加算（chip_value_type が none でない対局のみ）
      if (hasChipRule && (snap.chipTotals || snap.chip_a != null || snap.chip_b != null)) {
        playersArr.forEach((k) => {
          const name = (snap.playerNames && snap.playerNames[k]) || (snap as any)[`player_${k.toLowerCase()}`] || k;
          const normalized = String(name).trim();
          if (!map[normalized]) return;
          const chip = snap.chipTotals?.[k] ?? (snap as any)[`chip_${k.toLowerCase()}`];
          if (typeof chip === "number") {
            map[normalized].chipSum += chip;
            map[normalized].chipGames += 1;
          }
        });
      }
    });

    Object.values(map).forEach((v: any) => {
      v.avgRank = v.games > 0 ? v.sumRank / v.games : 0;
      v.rankPct = v.games > 0 ? v.rankDist.map((c: number) => (c / v.games) * 100) : [0, 0, 0, 0];
      v.tobiRate =
        v.gamesWithTobiRule > 0 ? (v.tobiCount / v.gamesWithTobiRule) * 100 : 0;
      v.avgChip = v.chipGames > 0 ? v.chipSum / v.chipGames : null;
    });

    setAggregateStats(map);
    setShowAggregateModal(true);
  };

  // 履歴が更新された際、ダッシュボード表示中なら即座に再計算
  useEffect(() => {
    if (!showAggregateModal) return;
    const map: Record<string, any> = {};
    const playersArr = ["A", "B", "C", "D"] as const;

    history.forEach((h: any) => {
      const snap = h.snapshot;
      if (!snap || !snap.rows) return;

      const tobiBonusNum = Math.max(0, parseInt(String(snap.tobiBonus ?? snap.tobi_bonus ?? 0), 10) || 0);
      const chipVal =
        (snap.chipValueType ?? snap.chip_value_type) === "none"
          ? 0
          : (snap.chipValueType ?? snap.chip_value_type) === "500"
            ? 500
            : (snap.chipValueType ?? snap.chip_value_type) === "1000"
              ? 1000
              : Math.max(0, parseInt(String(snap.chipCustomValue ?? snap.chip_custom_value ?? 0), 10) || 0);
      const hasTobiRule = tobiBonusNum > 0;
      const hasChipRule = chipVal > 0;

      snap.rows.forEach((r: any) => {
        const pts = playersArr.map((k) => r.points?.[k]);
        if (pts.some((v: unknown) => typeof v !== "number")) return;
        const hasTobi = pts.some((v: unknown) => typeof v === "number" && v < 0);

        playersArr.forEach((k) => {
          const name = (snap.playerNames && snap.playerNames[k]) || (snap as any)[`player_${k.toLowerCase()}`] || k;
          const normalized = String(name).trim();
          if (!map[normalized]) {
            map[normalized] = { name: normalized, games: 0, totalScore: 0, sumRank: 0, rankDist: [0, 0, 0, 0], tobiCount: 0, gamesWithTobiRule: 0, chipSum: 0, chipGames: 0 };
          }
          const entry = map[normalized];
          const rank = r.ranks?.[k];
          const score = r.scores?.[k] ?? 0;
          if (typeof rank === "number" && rank >= 1 && rank <= 4) {
            entry.games += 1;
            entry.totalScore += score;
            entry.sumRank += rank;
            entry.rankDist[rank - 1] += 1;
            if (hasTobiRule) {
              entry.gamesWithTobiRule += 1;
              if (hasTobi && rank === 4) entry.tobiCount += 1;
            }
          }
        });
      });

      if (hasChipRule && snap.chipTotals) {
        playersArr.forEach((k) => {
          const name = (snap.playerNames && snap.playerNames[k]) || (snap as any)[`player_${k.toLowerCase()}`] || k;
          const normalized = String(name).trim();
          if (!map[normalized]) return;
          const chip = snap.chipTotals[k] ?? (snap as any)[`chip_${k.toLowerCase()}`];
          if (typeof chip === "number") {
            map[normalized].chipSum += chip;
            map[normalized].chipGames += 1;
          }
        });
      }
    });

    Object.values(map).forEach((v: any) => {
      v.avgRank = v.games > 0 ? v.sumRank / v.games : 0;
      v.rankPct = v.games > 0 ? v.rankDist.map((c: number) => (c / v.games) * 100) : [0, 0, 0, 0];
      v.tobiRate = v.gamesWithTobiRule > 0 ? (v.tobiCount / v.gamesWithTobiRule) * 100 : 0;
      v.avgChip = v.chipGames > 0 ? v.chipSum / v.chipGames : null;
    });

    setAggregateStats(map);
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
    const entry = history.find((h) => h.id === id);
    if (!entry) return;
    const s = entry.snapshot;
    if (s) {
      if (s.rows) setRows(s.rows);
      if (s.playerNames) setPlayerNames(s.playerNames);
      if (s.umaType) setUmaType(s.umaType);
      if (s.customUma) setCustomUma(s.customUma);
      if (s.tobiBonus) setTobiBonus(String(s.tobiBonus));
      if (s.oka) setOka(String(s.oka));
      if (s.chipValueType) setChipValueType(s.chipValueType);
      if (s.chipCustomValue) setChipCustomValue(String(s.chipCustomValue));
      if (s.gameDate) setGameDate(s.gameDate);
      if (s.chipTotals) setChipTotals(s.chipTotals);
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

  const players: PlayerKey[] = ["A", "B", "C", "D"];
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

  const subHeaders = ["順位", "持ち点", "スコア"];

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
                  <th key={p} className={`border border-zinc-600 bg-zinc-800 px-1 py-0.5 text-center ${idx < players.length - 1 ? 'border-r-4 border-black' : ''}`}>
                    <input
                      type="text"
                      value={playerNames[p]}
                      onChange={(e) => setPlayerNames((prev) => ({ ...prev, [p]: e.target.value || p }))}
                      className="w-full bg-transparent text-center text-xs font-medium text-zinc-100 outline-none p-0"
                    />
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
                        <td key={p} className={`border border-zinc-600 px-1 py-0.5 text-center font-medium tabular-nums ${idx < players.length - 1 ? 'border-r-4 border-black' : ''}`}>
                          <div className="flex items-center justify-center gap-1">
                            <span className={`w-4 text-center text-xs ${rows[i].ranks[p] === 1 ? 'text-amber-300 font-semibold' : 'text-zinc-100'}`}>{rows[i].ranks[p] > 0 ? rows[i].ranks[p] : '-'}</span>
                            <span>
                              {(() => {
                                const sc = rows[i].scores[p];
                                if (sc === 0) return '-';
                                const positive = sc > 0;
                                const text = positive ? 'text-blue-300' : 'text-red-400';
                                return <span className={`${text} text-xs`}>{positive ? `+${sc}` : sc}</span>;
                              })()}
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
        <div className="mt-4 flex gap-3">
          <button
            onClick={() => saveCurrentToHistory()}
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
          <button
            onClick={() => {
              // copy current final result text to clipboard
              const lastCompletedIndex = rows.map((r) =>
                players.every((p) => typeof r.points[p] === "number")
              ).lastIndexOf(true);
              const totals = chipValuePerPoint > 0 ? totalWithChips : totalScores;
              const dateStr = gameDate ? `${gameDate.slice(0,4)}/${gameDate.slice(5,7)}/${gameDate.slice(8,10)}` : '';
              const lines: string[] = [];
              lines.push(`【対局結果】${dateStr}`);
              // sort players by totals desc
              const order = [...players].sort((a,b)=> totals[b]-totals[a]);
              order.forEach((p, idx) => {
                const place = idx+1;
                const name = playerNames[p] || p;
                const val = totals[p] > 0 ? `+${totals[p]}` : `${totals[p]}`;
                // detect tobied in lastCompletedIndex
                let tob = '';
                if (lastCompletedIndex >= 0) {
                  const r = rows[lastCompletedIndex];
                  const ranks = r.ranks;
                  if (ranks && ranks[p] === 4) tob = ' (飛)';
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
                      <button onClick={() => loadHistoryEntry(h.id)} className="rounded bg-emerald-600 px-2 py-1 text-xs">読み込み</button>
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
                {Object.values(aggregateStats).map((s: any) => (
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

        <div className="mt-4 flex flex-wrap items-start gap-4">
          <button
            onClick={addRow}
            className="rounded border border-zinc-600 bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-100 transition-colors hover:bg-zinc-700"
          >
            局を追加
          </button>

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
      </main>
    </div>
  );
}
