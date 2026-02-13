# Supabase メールテンプレート 日本語設定ガイド

Supabase ダッシュボードで、**Authentication** → **Email Templates** を開き、各テンプレートに以下をコピー＆ペーストしてください。

送信元を「麻雀スコアアプリ」と表示するには、**Authentication** → **SMTP Settings** でカスタムSMTPを設定し、**Sender name** に `麻雀スコアアプリ` を指定してください。Supabaseデフォルトのメール送信では送信元名の変更ができない場合があります。

---

## 1. Confirm signup（新規登録確認）

**Subject（件名）:**
```
【麻雀スコアアプリ】メールアドレスの確認
```

**Body（本文）HTML:**
```html
<h2>麻雀スコアアプリ</h2>
<p>ご登録ありがとうございます。</p>
<p>以下のリンクをクリックして、メールアドレスを確認してください。</p>
<p><a href="{{ .ConfirmationURL }}">メールアドレスを確認する</a></p>
<p>このメールに心当たりがない場合は、そのまま破棄してください。</p>
<hr>
<p style="color:#888;font-size:12px;">麻雀スコアアプリ</p>
```

---

## 2. Magic Link（マジックリンク）

**Subject（件名）:**
```
【麻雀スコアアプリ】ログイン用リンク
```

**Body（本文）HTML:**
```html
<h2>麻雀スコアアプリ</h2>
<p>ログイン用のリンクをお送りします。</p>
<p>以下のリンクをクリックしてログインしてください。</p>
<p><a href="{{ .ConfirmationURL }}">ログインする</a></p>
<p>このメールに心当たりがない場合は、そのまま破棄してください。</p>
<hr>
<p style="color:#888;font-size:12px;">麻雀スコアアプリ</p>
```

---

## 3. Reset Password（パスワードリセット）

**Subject（件名）:**
```
【麻雀スコアアプリ】パスワードの再設定
```

**Body（本文）HTML:**
```html
<h2>麻雀スコアアプリ</h2>
<p>パスワードの再設定リクエストを受け付けました。</p>
<p>以下のリンクをクリックして、新しいパスワードを設定してください。</p>
<p><a href="{{ .ConfirmationURL }}">パスワードを再設定する</a></p>
<p>このメールに心当たりがない場合は、そのまま破棄してください。</p>
<hr>
<p style="color:#888;font-size:12px;">麻雀スコアアプリ</p>
```

---

## 4. Change Email Address（メールアドレス変更）

**Subject（件名）:**
```
【麻雀スコアアプリ】メールアドレス変更の確認
```

**Body（本文）HTML:**
```html
<h2>麻雀スコアアプリ</h2>
<p>メールアドレス変更のリクエストを受け付けました。</p>
<p>以下のリンクをクリックして、変更を完了してください。</p>
<p><a href="{{ .ConfirmationURL }}">メールアドレスを変更する</a></p>
<p>このメールに心当たりがない場合は、そのまま破棄してください。</p>
<hr>
<p style="color:#888;font-size:12px;">麻雀スコアアプリ</p>
```

---

## 送信元名を「麻雀スコアアプリ」にする方法

1. Supabase ダッシュボード → **Project Settings** → **Auth**
2. **SMTP Settings** でカスタムSMTP（SendGrid、Resend、AWS SES など）を設定
3. **Sender email** に送信元メールアドレスを設定
4. **Sender name** に `麻雀スコアアプリ` を入力

カスタムSMTP未設定の場合は、Supabaseデフォルトの送信元（例：noreply@mail.app.supabase.io）が使われます。
