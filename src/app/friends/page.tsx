"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase";
import {
  fetchUserProfile,
  fetchFriends,
  getProfileByFriendCode,
  sendFriendRequest,
  acceptFriendRequest,
  removeFriend,
} from "@/lib/mahjong-api";

export default function FriendsPage() {
  const [authChecked, setAuthChecked] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [friendCode, setFriendCode] = useState<string | null>(null);
  const [friends, setFriends] = useState<Awaited<ReturnType<typeof fetchFriends>>>([]);
  const [inputCode, setInputCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const refresh = async (uid: string) => {
    try {
      const [profile, list] = await Promise.all([
        fetchUserProfile(uid),
        fetchFriends(uid),
      ]);
      setFriendCode(profile?.friend_code ?? null);
      setFriends(list);
    } catch (e) {
      console.error("refresh friends failed", e);
      setMessage("データの取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const init = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) {
        window.location.replace("/login");
        return;
      }
      setUserId(session.user.id);
      setAuthChecked(true);
      await refresh(session.user.id);
    };
    init();
  }, []);

  const handleCopyCode = () => {
    if (!friendCode) return;
    navigator.clipboard?.writeText(friendCode).then(() => {
      setMessage("フレンドコードをコピーしました");
      setTimeout(() => setMessage(null), 2000);
    });
  };

  const handleSendRequest = async () => {
    if (!userId) return;
    const code = inputCode.trim().toUpperCase();
    if (!code) {
      setMessage("フレンドコードを入力してください");
      return;
    }
    try {
      setSending(true);
      setMessage(null);
      const target = await getProfileByFriendCode(code);
      if (!target) {
        setMessage("このフレンドコードのユーザーが見つかりません");
        return;
      }
      await sendFriendRequest(userId, target.user_id);
      setMessage(`${target.display_name} さんにフレンド申請を送りました`);
      setInputCode("");
      await refresh(userId);
    } catch (e) {
      const err = e as Error;
      if (err.message?.includes("duplicate") || err.message?.includes("unique")) {
        setMessage("すでに申請済みか、フレンド登録済みです");
      } else {
        setMessage(err.message ?? "申請に失敗しました");
      }
    } finally {
      setSending(false);
    }
  };

  const handleAccept = async (friendRowId: string) => {
    if (!userId) return;
    try {
      await acceptFriendRequest(friendRowId, userId);
      setMessage("承認しました");
      await refresh(userId);
    } catch (e) {
      setMessage("承認に失敗しました");
    }
  };

  const handleRemove = async (friendRowId: string) => {
    if (!confirm("このフレンドを解除しますか？")) return;
    if (!userId) return;
    try {
      await removeFriend(friendRowId, userId);
      setMessage("フレンドを解除しました");
      await refresh(userId);
    } catch (e) {
      setMessage("解除に失敗しました");
    }
  };

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-zinc-400">
        読み込み中...
      </div>
    );
  }

  const accepted = friends.filter((f) => f.status === "accepted");
  const pendingOut = friends.filter((f) => f.status === "pending" && !f.isIncoming);
  const pendingIn = friends.filter((f) => f.status === "pending" && f.isIncoming);

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans">
      <main className="mx-auto max-w-xl px-4 py-6 space-y-6">
        <section className="rounded-lg border border-zinc-700 bg-zinc-900/80 p-4">
          <h1 className="text-lg font-semibold text-white mb-4">フレンド</h1>

          {/* 自分のフレンドコード */}
          <div className="mb-6">
            <h2 className="text-sm font-medium text-zinc-300 mb-2">自分のフレンドコード</h2>
            {loading ? (
              <p className="text-xs text-zinc-500">読み込み中...</p>
            ) : friendCode ? (
              <div className="flex items-center gap-2">
                <code className="rounded bg-zinc-800 px-4 py-2 text-lg font-mono tracking-widest text-amber-300">
                  {friendCode}
                </code>
                <button
                  onClick={handleCopyCode}
                  className="rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-xs text-zinc-200 hover:bg-zinc-700"
                >
                  コピー
                </button>
              </div>
            ) : (
              <p className="text-xs text-zinc-500">
                プロフィールでユーザー名を登録するとフレンドコードが発行されます。
              </p>
            )}
          </div>

          {/* フレンド申請 */}
          <div className="mb-6">
            <h2 className="text-sm font-medium text-zinc-300 mb-2">フレンド申請を送る</h2>
            <div className="flex gap-2">
              <input
                type="text"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                placeholder="フレンドコード（8文字）"
                maxLength={8}
                className="flex-1 rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:ring-1 focus:ring-zinc-500"
              />
              <button
                onClick={handleSendRequest}
                disabled={sending}
                className="rounded border border-emerald-500 bg-emerald-600/80 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-60"
              >
                {sending ? "送信中..." : "申請"}
              </button>
            </div>
          </div>

          {message && (
            <div className="mb-4 rounded bg-zinc-800 px-3 py-2 text-xs text-amber-300">
              {message}
            </div>
          )}

          {/* 届いた申請 */}
          {pendingIn.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-medium text-zinc-300 mb-2">届いた申請</h2>
              <ul className="space-y-2">
                {pendingIn.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center justify-between rounded border border-zinc-700 bg-zinc-800/60 px-3 py-2"
                  >
                    <span className="text-sm text-zinc-100">{f.display_name}</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAccept(f.id)}
                        className="rounded bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-500"
                      >
                        承認
                      </button>
                      <button
                        onClick={() => handleRemove(f.id)}
                        className="rounded bg-zinc-600 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-500"
                      >
                        拒否
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 申請中 */}
          {pendingOut.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-medium text-zinc-300 mb-2">申請中</h2>
              <ul className="space-y-2">
                {pendingOut.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center justify-between rounded border border-zinc-700 bg-zinc-800/60 px-3 py-2"
                  >
                    <span className="text-sm text-zinc-100">{f.display_name}</span>
                    <span className="text-xs text-zinc-500">申請中</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* フレンド一覧 */}
          <div>
            <h2 className="text-sm font-medium text-zinc-300 mb-2">フレンド一覧</h2>
            {accepted.length === 0 ? (
              <p className="text-xs text-zinc-500">フレンドはいません</p>
            ) : (
              <ul className="space-y-2">
                {accepted.map((f) => (
                  <li
                    key={f.id}
                    className="flex items-center justify-between rounded border border-zinc-700 bg-zinc-800/60 px-3 py-2"
                  >
                    <span className="text-sm text-zinc-100">{f.display_name}</span>
                    <button
                      onClick={() => handleRemove(f.id)}
                      className="rounded bg-red-700/80 px-2 py-1 text-xs text-white hover:bg-red-600"
                    >
                      解除
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
