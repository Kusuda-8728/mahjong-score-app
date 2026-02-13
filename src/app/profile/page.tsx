"use client";

import { useEffect, useMemo, useState } from "react";
import {
  PlayerRecord,
  UserProfile,
  fetchPlayers,
  fetchUserProfile,
  insertPlayer,
  deletePlayer,
  upsertUserProfile,
} from "@/lib/mahjong-api";
import { supabase } from "@/utils/supabase";

export default function ProfilePage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileInputName, setProfileInputName] = useState("");
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);

  const [playerRegistry, setPlayerRegistry] = useState<PlayerRecord[]>([]);
  const [newPlayerName, setNewPlayerName] = useState("");
  const [playerMessage, setPlayerMessage] = useState<string | null>(null);
  const [playersLoading, setPlayersLoading] = useState(false);

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
        const [profile, players] = await Promise.all([
          fetchUserProfile(userId),
          fetchPlayers(userId),
        ]);
        if (profile) {
          setUserProfile(profile);
          setProfileInputName(profile.display_name);
        }
        setPlayerRegistry(players);
      } catch (e) {
        console.error("initial load failed", e);
        setProfileMessage("データの取得に失敗しました。");
      }
    };
    init();
  }, []);

  const existingPlayerNames = useMemo(
    () => new Set(playerRegistry.map((p) => p.name.toLowerCase())),
    [playerRegistry]
  );

  const handleSaveProfile = async () => {
    if (!currentUser) {
      setProfileMessage("ログイン情報を確認できません。");
      return;
    }
    const trimmed = profileInputName.trim();
    if (!trimmed) {
      setProfileMessage("ユーザー名を入力してください。");
      return;
    }
    try {
      setProfileSaving(true);
      setProfileMessage(null);
      const profile = await upsertUserProfile(currentUser, trimmed);
      setUserProfile(profile);
      setProfileMessage("ユーザー名を保存しました。");
    } catch (e) {
      console.error("save profile failed", e);
      setProfileMessage("ユーザー名の保存に失敗しました。");
    } finally {
      setProfileSaving(false);
    }
  };

  const refreshPlayers = async () => {
    if (!currentUser) return;
    try {
      setPlayersLoading(true);
      const players = await fetchPlayers(currentUser);
      setPlayerRegistry(players);
    } catch (e) {
      console.error("fetch players failed", e);
      setPlayerMessage("プレイヤー一覧の取得に失敗しました。");
    } finally {
      setPlayersLoading(false);
    }
  };

  const handleAddPlayer = async () => {
    if (!currentUser) {
      setPlayerMessage("ログイン情報を確認できません。");
      return;
    }
    const trimmed = newPlayerName.trim();
    if (!trimmed) {
      setPlayerMessage("プレイヤー名を入力してください。");
      return;
    }
    if (existingPlayerNames.has(trimmed.toLowerCase())) {
      setPlayerMessage("同じ名前のプレイヤーが登録されています。");
      return;
    }
    try {
      setPlayerMessage(null);
      await insertPlayer(trimmed, currentUser);
      setNewPlayerName("");
      setPlayerMessage("プレイヤーを追加しました。");
      await refreshPlayers();
    } catch (e) {
      console.error("add player failed", e);
      setPlayerMessage("プレイヤーの追加に失敗しました。");
    }
  };

  const handleDeletePlayer = async (id: string) => {
    if (!confirm("このプレイヤーを削除しますか？")) return;
    try {
      await deletePlayer(id);
      setPlayerMessage("プレイヤーを削除しました。");
      await refreshPlayers();
    } catch (e) {
      console.error("delete player failed", e);
      setPlayerMessage("プレイヤーの削除に失敗しました。");
    }
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
      <main className="mx-auto max-w-4xl px-4 py-6 space-y-6">
        <section className="rounded-lg border border-zinc-700 bg-zinc-900/80 p-4">
          <h1 className="text-lg font-semibold text-white mb-2">ユーザー設定</h1>
          <p className="text-xs text-zinc-400">
            ログイン中アカウントの表示名です。登録するとスコア表で「自分」として利用されます。
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="text"
              value={profileInputName}
              onChange={(e) => setProfileInputName(e.target.value)}
              placeholder=""
              className="w-full sm:w-60 rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:ring-1 focus:ring-zinc-500"
            />
            <button
              onClick={handleSaveProfile}
              className="w-full sm:w-auto rounded border border-emerald-500 bg-emerald-600/80 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-60"
              disabled={profileSaving}
            >
              {profileSaving
                ? "保存中..."
                : userProfile
                  ? "ユーザー名を更新"
                  : "ユーザー名を登録"}
            </button>
          </div>
          {profileMessage && (
            <div className="mt-2 text-xs text-amber-300">{profileMessage}</div>
          )}
          {userProfile ? (
            <div className="mt-2 text-xs text-zinc-400">
              現在のユーザー名:{" "}
              <span className="font-medium text-zinc-100">
                {userProfile.display_name}
              </span>
            </div>
          ) : (
            <div className="mt-2 text-xs text-amber-300">
              まだユーザー名が登録されていません。まずは登録してください。
            </div>
          )}
        </section>

        <section className="rounded-lg border border-zinc-700 bg-zinc-900/80 p-4">
          <h2 className="text-sm font-medium text-white">プレイヤー管理</h2>
          <p className="mt-1 text-xs text-zinc-400">
            よく使うプレイヤー名を登録しておくと、スコア表で素早く選択できます。
          </p>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="text"
              value={newPlayerName}
              onChange={(e) => setNewPlayerName(e.target.value)}
              placeholder=""
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
      </main>
    </div>
  );
}
