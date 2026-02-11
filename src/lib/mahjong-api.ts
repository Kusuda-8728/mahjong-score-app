import { supabase } from "@/utils/supabase";

export type PlayerKey = "A" | "B" | "C" | "D";

export interface UserProfile {
  user_id: string;
  display_name: string;
  created_at?: string;
}

export interface PlayerRecord {
  id: string;
  name: string;
  user_id?: string;
}

export interface SnapshotRowData {
  points?: Record<PlayerKey, number | "">;
  ranks?: Record<PlayerKey, number>;
  scores?: Record<PlayerKey, number>;
  tobiPlayer?: PlayerKey | "";
}

export interface SnapshotData {
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
  ownerUserId?: string;
  ownerDisplayName?: string;
}

export interface MatchRow {
  id: string;
  created_at: string;
  user_id: string;
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

export interface HistoryEntry {
  id: string;
  name: string;
  date: string;
  players: Record<PlayerKey, string>;
  topPlayer: PlayerKey;
  snapshot: SnapshotData;
}

export interface AggregatePlayerStats {
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

export const UMA_PRESETS: Record<string, [number, number, number, number]> = {
  "10-20": [20, 10, -10, -20],
  "10-30": [30, 10, -10, -30],
  "5-10": [10, 5, -5, -10],
};

export type UmaTypeOption = "10-20" | "10-30" | "5-10" | "custom";
export const UMA_OPTIONS: UmaTypeOption[] = ["10-20", "10-30", "5-10", "custom"];
export const isUmaType = (value: string): value is UmaTypeOption =>
  (UMA_OPTIONS as readonly string[]).includes(value);

export type ChipTypeOption = "none" | "500" | "1000" | "custom";
export const CHIP_TYPE_OPTIONS: ChipTypeOption[] = [
  "none",
  "500",
  "1000",
  "custom",
];
export const isChipType = (value: string): value is ChipTypeOption =>
  (CHIP_TYPE_OPTIONS as readonly string[]).includes(value);

export const PLAYER_KEYS: PlayerKey[] = ["A", "B", "C", "D"];
export const STARTING_POINTS = 30000;
export const VALID_TOTALS = [100000, 120000] as const;

export async function fetchUserProfile(userId: string) {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("user_id, display_name, created_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as UserProfile | null;
}

export async function upsertUserProfile(userId: string, displayName: string) {
  const { data, error } = await supabase
    .from("user_profiles")
    .upsert({ user_id: userId, display_name: displayName }, { onConflict: "user_id" })
    .select("user_id, display_name, created_at")
    .single();
  if (error) throw error;
  return data as UserProfile;
}

export async function fetchPlayers(userId: string) {
  const { data, error } = await supabase
    .from("players")
    .select("id, name")
    .eq("user_id", userId)
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as PlayerRecord[];
}

export async function deletePlayer(id: string) {
  const { error } = await supabase.from("players").delete().eq("id", id);
  if (error) throw error;
}

export async function insertPlayer(name: string, userId: string) {
  const { error } = await supabase
    .from("players")
    .insert({ name, user_id: userId });
  if (error) throw error;
}

export async function fetchMatches(userId: string) {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .eq("user_id", userId)
    .order("game_date", { ascending: false });
  if (error) throw error;
  return (data ?? []) as MatchRow[];
}

export function normalizeHistoryEntries(matches: MatchRow[]): HistoryEntry[] {
  return matches.map((m) => {
    const players: Record<PlayerKey, string> = {
      A: (m.player_a ?? "A") || "A",
      B: (m.player_b ?? "B") || "B",
      C: (m.player_c ?? "C") || "C",
      D: (m.player_d ?? "D") || "D",
    };
    const scores = {
      A: m.score_a ?? 0,
      B: m.score_b ?? 0,
      C: m.score_c ?? 0,
      D: m.score_d ?? 0,
    };
    let top: PlayerKey = "A";
    PLAYER_KEYS.forEach((k) => {
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
        ownerUserId: snap.ownerUserId ?? undefined,
        ownerDisplayName: snap.ownerDisplayName ?? undefined,
      },
    };
  });
}

export function buildAggregateStats(source: HistoryEntry[]): Record<string, AggregatePlayerStats> {
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
    v.tobiRate = v.gamesWithTobiRule > 0 ? (v.tobiCount / v.gamesWithTobiRule) * 100 : 0;
    v.avgChip = v.chipGames > 0 ? v.chipSum / v.chipGames : null;
  });

  return map;
}
