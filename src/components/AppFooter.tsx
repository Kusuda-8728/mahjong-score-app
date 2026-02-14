"use client";

import { useState } from "react";
import { supabase } from "@/utils/supabase";

const TERMS_CONTENT = `
【利用規約】

第1条（適用）
本規約は、麻雀スコア表アプリ（以下「本アプリ」）の利用に関する条件を定めるものです。本アプリを利用する際は、本規約に同意したものとみなします。

第2条（禁止事項）
ユーザーは、以下の行為を行ってはなりません。
・法令または公序良俗に反する行為
・他のユーザーまたは第三者に迷惑、不利益、損害を与える行為
・本アプリの運営を妨害する行為
・不正アクセスまたはこれを試みる行為
・その他、当方が不適切と判断する行為

第3条（サービスの変更・中断）
当方は、事前の通知なく本アプリの内容の変更、提供の中断、終了を行うことがあります。これによりユーザーに生じた損害について、当方は責任を負いません。

第4条（免責事項）
本アプリは現状のまま提供されます。当方は、本アプリの正確性、完全性、有用性等について保証しません。本アプリの利用により生じた損害について、当方は一切の責任を負いません。

第5条（規約の変更）
当方は、必要に応じて本規約を変更することがあります。変更後の規約は、本アプリ上での告知をもって効力を生じるものとします。
`;

const PRIVACY_CONTENT = `
【プライバシーポリシー】

1. 個人情報の取得
本アプリでは、以下の情報を取得・利用することがあります。
・アカウント情報（メールアドレス、表示名）
・対局データ（スコア、日付、プレイヤー名など）
・利用状況に関する情報

2. 個人情報の利用目的
取得した情報は、以下の目的で利用します。
・本アプリの提供・運営
・ユーザーサポート
・サービスの改善
・不具合の対応

3. 個人情報の第三者提供
当方は、以下の場合を除き、ユーザーの個人情報を第三者に提供しません。
・ユーザーの同意がある場合
・法令に基づく場合
・人の生命、身体または財産の保護のために必要な場合

4. データの保存期間
対局データは、アカウントが存在する限り保存されます。アカウント削除時には、関連するデータを削除するよう努めます。

5. お問い合わせ
本ポリシーに関するお問い合わせは、アプリ内の「ご意見・不具合報告」からお送りください。
`;

function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="relative max-h-[85vh] w-full max-w-2xl overflow-hidden rounded-lg border border-zinc-600 bg-zinc-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-700 px-4 py-3">
          <h2 className="text-base font-medium text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[calc(85vh-56px)] overflow-y-auto px-4 py-4">
          {children}
        </div>
      </div>
    </div>
  );
}

export function AppFooter() {
  const [termsOpen, setTermsOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackBody, setFeedbackBody] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);

  const handleFeedbackSubmit = async () => {
    const trimmed = feedbackBody.trim();
    if (!trimmed) {
      alert("内容を入力してください。");
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      alert("ログイン後にご利用ください。");
      return;
    }
    setFeedbackSending(true);
    try {
      const { error } = await supabase.from("feedbacks").insert({
        user_id: user.id,
        body: trimmed,
        created_by_email: user.email ?? undefined,
      });
      if (error) throw error;
      setFeedbackSent(true);
      setFeedbackBody("");
      setTimeout(() => {
        setFeedbackOpen(false);
        setFeedbackSent(false);
      }, 1500);
    } catch (e) {
      console.error("feedback submit failed", e);
      alert("送信に失敗しました。");
    } finally {
      setFeedbackSending(false);
    }
  };

  return (
    <>
      <footer className="border-t border-zinc-800 bg-zinc-950/80 py-4">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-4 px-4 sm:px-6">
          <div className="flex flex-wrap justify-center gap-4 text-xs">
            <button
              type="button"
              onClick={() => setTermsOpen(true)}
              className="text-zinc-400 hover:text-zinc-200 underline"
            >
              利用規約
            </button>
            <span className="text-zinc-600">|</span>
            <button
              type="button"
              onClick={() => setPrivacyOpen(true)}
              className="text-zinc-400 hover:text-zinc-200 underline"
            >
              プライバシーポリシー
            </button>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackOpen(true)}
            className="rounded border border-zinc-600 bg-zinc-800/80 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
          >
            ご意見・不具合報告
          </button>
        </div>
      </footer>

      {termsOpen && (
        <Modal title="利用規約" onClose={() => setTermsOpen(false)}>
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-300">
            {TERMS_CONTENT}
          </pre>
        </Modal>
      )}

      {privacyOpen && (
        <Modal title="プライバシーポリシー" onClose={() => setPrivacyOpen(false)}>
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-300">
            {PRIVACY_CONTENT}
          </pre>
        </Modal>
      )}

      {feedbackOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => {
            if (!feedbackSending) {
              setFeedbackOpen(false);
              setFeedbackBody("");
            }
          }}
        >
          <div
            className="relative w-full max-w-md overflow-hidden rounded-lg border border-zinc-600 bg-zinc-900 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-zinc-700 px-4 py-3">
              <h2 className="text-base font-medium text-white">
                ご意見・不具合報告
              </h2>
              <button
                type="button"
                onClick={() => {
                  if (!feedbackSending) {
                    setFeedbackOpen(false);
                    setFeedbackBody("");
                  }
                }}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-white"
                aria-label="閉じる"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 px-4 py-4">
              {feedbackSent ? (
                <p className="py-4 text-center text-sm text-emerald-400">
                  送信しました。ご協力ありがとうございます。
                </p>
              ) : (
                <>
                  <textarea
                    value={feedbackBody}
                    onChange={(e) => setFeedbackBody(e.target.value)}
                    placeholder="ご意見や不具合の内容をご記入ください"
                    rows={5}
                    className="w-full rounded border border-zinc-600 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none focus:ring-1 focus:ring-zinc-500 disabled:opacity-50"
                    disabled={feedbackSending}
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setFeedbackOpen(false);
                        setFeedbackBody("");
                      }}
                      className="rounded border border-zinc-600 px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800"
                      disabled={feedbackSending}
                    >
                      キャンセル
                    </button>
                    <button
                      type="button"
                      onClick={handleFeedbackSubmit}
                      disabled={feedbackSending || !feedbackBody.trim()}
                      className="rounded bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-500 disabled:opacity-50"
                    >
                      {feedbackSending ? "送信中..." : "送信"}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
