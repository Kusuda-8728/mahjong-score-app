import { supabase } from "@/utils/supabase";

export type PlayerKey = "A" | "B" | "C" | "D";

export interface UserProfile {
  user_id: string;
  display_name: string;
  friend_code?: string | null;
  created_at?: string;
}

export interface FriendRow {
  id: string;
  user_id: string;
  friend_id: string;
  status: "pending" | "accepted";
  created_at?: string;
}

export interface FriendWithProfile {
  id: string;
  friend_id: string;
  display_name: string;
  status: "pending" | "accepted";
  isIncoming: boolean;
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
  manualTieRanks?: Partial<Record<PlayerKey, number>>;
}

export interface SnapshotData {
  rows?: SnapshotRowData[];
  playerNames?: Record<PlayerKey, string>;
  gameMode?: "yonma" | "sanma";
  startPoints?: number | string;
  returnPoints?: number | string;
  umaType?: string;
  tieRankMode?: "shared_split" | "manual_order";
  customUma?: string[];
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
  /** 共有された対局かどうか */
  isShared?: boolean;
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
    .select("user_id, display_name, friend_code, created_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data as UserProfile | null;
}

export async function upsertUserProfile(userId: string, displayName: string) {
  const { data, error } = await supabase
    .from("user_profiles")
    .upsert({ user_id: userId, display_name: displayName }, { onConflict: "user_id" })
    .select("user_id, display_name, friend_code, created_at")
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

/** フレンドコードでユーザーを検索（RPC） */
export async function getProfileByFriendCode(
  code: string
): Promise<{ user_id: string; display_name: string } | null> {
  const trimmed = String(code).trim().toUpperCase();
  if (!trimmed) return null;
  const { data, error } = await supabase.rpc("get_user_by_friend_code", {
    code: trimmed,
  });
  if (error) throw error;
  const row = Array.isArray(data) && data[0] ? data[0] : null;
  return row as { user_id: string; display_name: string } | null;
}

/** フレンド一覧・申請中・申請受信を取得 */
export async function fetchFriends(userId: string): Promise<FriendWithProfile[]> {
  const { data: rows, error } = await supabase
    .from("friends")
    .select("id, user_id, friend_id, status")
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`);
  if (error) throw error;

  const ids = new Set<string>();
  (rows ?? []).forEach((r: FriendRow) => {
    ids.add(r.user_id);
    ids.add(r.friend_id);
  });
  ids.delete(userId);

  if (ids.size === 0) {
    return (rows ?? []).map((r: FriendRow) => ({
      id: r.id,
      friend_id: r.user_id === userId ? r.friend_id : r.user_id,
      display_name: "—",
      status: r.status,
      isIncoming: r.friend_id === userId,
    }));
  }

  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("user_id, display_name")
    .in("user_id", Array.from(ids));
  const nameMap = new Map(
    (profiles ?? []).map((p: { user_id: string; display_name: string }) => [p.user_id, p.display_name])
  );

  return (rows ?? []).map((r: FriendRow) => {
    const otherId = r.user_id === userId ? r.friend_id : r.user_id;
    return {
      id: r.id,
      friend_id: otherId,
      display_name: nameMap.get(otherId) ?? "—",
      status: r.status,
      isIncoming: r.friend_id === userId,
    };
  });
}

/** フレンド申請を送信 */
export async function sendFriendRequest(userId: string, targetUserId: string) {
  if (userId === targetUserId) throw new Error("自分自身に申請できません");
  const { error } = await supabase.from("friends").insert({
    user_id: userId,
    friend_id: targetUserId,
    status: "pending",
  });
  if (error) throw error;
}

/** フレンド申請を承認 */
export async function acceptFriendRequest(friendRowId: string, userId: string) {
  const { error } = await supabase
    .from("friends")
    .update({ status: "accepted", updated_at: new Date().toISOString() })
    .eq("id", friendRowId)
    .eq("friend_id", userId)
    .eq("status", "pending");
  if (error) throw error;
}

/** フレンド関係を解除 */
export async function removeFriend(friendRowId: string, userId: string) {
  const { error } = await supabase
    .from("friends")
    .delete()
    .eq("id", friendRowId)
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`);
  if (error) throw error;
}

/** 対局をフレンドに共有 */
export async function shareMatchWithUser(
  ownerId: string,
  matchId: string,
  sharedWithUserId: string
) {
  if (ownerId === sharedWithUserId) throw new Error("自分自身には共有できません");
  const { error } = await supabase.from("shared_matches").insert({
    match_id: matchId,
    owner_id: ownerId,
    shared_with_user_id: sharedWithUserId,
  });
  if (error) throw error;
}

/** 共有された対局ID一覧を取得 */
export async function fetchSharedMatchIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("shared_matches")
    .select("match_id")
    .eq("shared_with_user_id", userId);
  if (error) throw error;
  return new Set((data ?? []).map((r: { match_id: string }) => r.match_id));
}

/** 自分が作成した対局＋共有された対局を取得（RLS でフィルタされる） */
export async function fetchMatches(userId: string) {
  const { data: matches, error } = await supabase
    .from("matches")
    .select("*")
    .order("game_date", { ascending: false });
  if (error) throw error;

  const sharedIds = await fetchSharedMatchIds(userId);
  return { matches: (matches ?? []) as MatchRow[], sharedIds };
}

export function normalizeHistoryEntries(
  matches: MatchRow[],
  sharedIds?: Set<string>
): HistoryEntry[] {
  return matches.map((m) => {
    const snap: SnapshotData = m.snapshot ?? {};
    const hasValidDRankInRows =
      snap.rows?.some((r) => typeof r.ranks?.D === "number" && r.ranks.D > 0) ??
      false;
    const hasNamedDPlayer = !!m.player_d && m.player_d !== "D";
    const inferredMode: "yonma" | "sanma" =
      snap.gameMode ??
      (hasValidDRankInRows || hasNamedDPlayer ? "yonma" : "sanma");
    const activeKeys: PlayerKey[] =
      inferredMode === "sanma" ? ["A", "B", "C"] : ["A", "B", "C", "D"];

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
    let top: PlayerKey = activeKeys[0];
    activeKeys.forEach((k) => {
      if (scores[k] > scores[top]) top = k;
    });
    const gd = m.game_date ?? "";
    const participantNames = activeKeys.map((k) => players[k]).filter(Boolean);
    const name =
      gd.length >= 10
        ? `${gd.slice(0, 4)}/${gd.slice(5, 7)}/${gd.slice(8, 10)} ${participantNames.join("、")}`
        : `${participantNames.join("、")}`;
    return {
      id: m.id,
      isShared: sharedIds?.has(m.id) ?? false,
      name,
      date: m.created_at,
      players,
      topPlayer: top,
      snapshot: {
        rows: snap.rows,
        playerNames: snap.playerNames ?? players,
        gameMode: inferredMode,
        startPoints:
          snap.startPoints ??
          (inferredMode === "sanma" ? 35000 : 25000),
        returnPoints:
          snap.returnPoints ??
          (inferredMode === "sanma" ? 40000 : 30000),
        umaType: snap.umaType ?? m.uma_type ?? undefined,
        tieRankMode: snap.tieRankMode ?? "shared_split",
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
    const mode = snap.gameMode === "sanma" ? "sanma" : "yonma";
    const activeKeys: PlayerKey[] =
      mode === "sanma" ? ["A", "B", "C"] : ["A", "B", "C", "D"];

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
      const pts = activeKeys.map((k) => row.points?.[k]);
      if (pts.some((v) => typeof v !== "number")) return;

      const hasTobi = pts.some((v) => typeof v === "number" && v < 0);

      activeKeys.forEach((k) => {
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

        if (
          typeof rankVal === "number" &&
          rankVal >= 1 &&
          rankVal <= activeKeys.length
        ) {
          entryStats.games += 1;
          entryStats.totalScore += scoreVal;
          entryStats.sumRank += rankVal;
          entryStats.rankDist[rankVal - 1] += 1;

          if (hasTobiRule) {
            entryStats.gamesWithTobiRule += 1;
            if (hasTobi && rankVal === activeKeys.length) entryStats.tobiCount += 1;
          }
        }
      });
    });

    if (hasChipRule && snap.chipTotals) {
      activeKeys.forEach((k) => {
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

/**
 * 指定プレイヤーの順位履歴を抽出（直近 maxGames 戦）。
 * 返却配列は古い順（左＝古い、右＝新しいで表示する想定）。
 */
export function extractRankHistory(
  source: HistoryEntry[],
  playerName: string,
  maxGames: number = 50
): number[] {
  return extractRankHistoryWithContext(source, playerName, maxGames).map(
    (item) => item.rank
  );
}

export interface RankHistoryItem {
  rank: number;
  entry: HistoryEntry;
  rowIndex: number;
}

/**
 * 指定プレイヤーの順位履歴をコンテキスト付きで抽出（直近 maxGames 戦）。
 * クリック時にその局の詳細を表示するために利用。
 */
export function extractRankHistoryWithContext(
  source: HistoryEntry[],
  playerName: string,
  maxGames: number = 50
): RankHistoryItem[] {
  const normalized = String(playerName).trim();
  if (!normalized) return [];

  const all: RankHistoryItem[] = [];
  const sorted = [...source].sort(
    (a, b) =>
      new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()
  );

  for (const entry of sorted) {
    const snap = entry.snapshot;
    if (!snap.rows || !snap.playerNames) continue;

    const playerKey = (PLAYER_KEYS as readonly PlayerKey[]).find(
      (k) => String(snap.playerNames?.[k] ?? "").trim() === normalized
    );
    if (!playerKey) continue;

    for (let rowIndex = 0; rowIndex < snap.rows.length; rowIndex++) {
      const row = snap.rows[rowIndex];
      const rank = row.ranks?.[playerKey];
      if (typeof rank === "number" && rank >= 1 && rank <= 4) {
        all.push({ rank, entry, rowIndex });
      }
    }
  }

  const lastN = all.slice(-maxGames);
  return lastN;
}
