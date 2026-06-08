# SNS Auto Post — マルチプラットフォーム AI 自動投稿システム

Threads / Instagram / X / TikTok / YouTube 向けの、**AI でテキスト・画像・動画を生成して投稿まで一括管理**する Web アプリ。

- パッケージ名: `sns-auto-post`
- フレームワーク: **Next.js 16**（App Router / React 19 / TypeScript）
- ローカル開発ポート: **`3001`**（`http://localhost:3001`）

---

## 主な機能

### テキスト・画像投稿（Threads / Instagram / X）
- **AI テキスト生成** — ペルソナ別に投稿文を自動生成（OpenRouter 経由 `google/gemini-2.5-flash`）。バズ/共感/数字/ストーリー/質問の「型」を選択可能
- **AI 図解・画像生成** — 投稿に合わせた画像を生成（OpenAI `gpt-image-2`）
- **参考投稿の取り込み** — 参考にしたい投稿テキスト/画像を貼り付けてテイストを寄せる（画像は Vision で解析）
- **プレビュー・承認フロー** — 内容を確認してから投稿
- **多アカウント対応** — ペルソナ別に複数アカウントを管理
- **X はスレッド投稿対応**

### AI 動画生成・ショート動画投稿（TikTok / YouTube / Instagram Reels）
- **台本 → シーン分割 → ナレーション → 合成**の動画パイプライン
- **2 つの生成モード**
  - `remotion` … 画像 + ナレーション合成（Remotion / 1080×1920・30fps）。**Chromium が必要なためローカル（`npm run dev`）でのみ実行可能**
  - `heygen_avatar` … HeyGen のクラウドでアバター動画をレンダリング。**Vercel 上でも生成可能**
- **音声合成** — ElevenLabs（TTS）
- **投稿先** — TikTok（Content Posting API）/ YouTube（Data API v3）/ Instagram Reels

### 共通
- **BYOK（Bring Your Own Key）** — AI の API キー（OpenRouter / OpenAI / ElevenLabs）や各プラットフォームのアプリ資格情報は、**ユーザーが UI の「設定」ページから登録**。DB に **AES-256-GCM で暗号化保存**
- **レートリミット** / **プロンプトプリセット**（アカウント別）/ **投稿ログ**

---

## 技術スタック

| カテゴリ | 技術 |
|----------|------|
| フロントエンド | Next.js 16.2.4（App Router）/ React 19.2.4 / TypeScript 5 |
| スタイリング | Tailwind CSS v4 / Radix UI / lucide-react / Remix Icon |
| バリデーション | Zod |
| DB / 認証 / ストレージ | Supabase（PostgreSQL + RLS + Auth + Storage） |
| テキスト生成 | OpenRouter（`google/gemini-2.5-flash`） |
| 画像生成 / Vision | OpenAI（`gpt-image-2`） |
| 動画レンダリング | Remotion 4.x（ローカル）/ HeyGen（クラウド） |
| 音声合成 | ElevenLabs |
| 投稿 API | Threads Graph API / Instagram Graph API / X API v2 / TikTok Content Posting API / YouTube Data API v3 |
| デプロイ | Vercel |

> ⚠️ **Next.js 16 は破壊的変更を含みます。** API・規約・ファイル構成が以前のバージョンと異なる場合があります（詳細は `AGENTS.md` 参照）。

---

## ローカルで動かす（クイックスタート）

### 0. 必要なもの

- **Node.js 20 以上**（推奨: Vercel と揃えて `24.x`）
- **npm**
- **git**
- **Supabase プロジェクト**（無料枠で可。下記 3 を参照）

### 1. リポジトリを取得して依存をインストール

```bash
git clone https://github.com/RIKU0804/threads-auto-post.git
cd threads-auto-post
npm install
```

### 2. 環境変数を設定

`.env.example` をコピーして `.env.local` を作成し、**必須項目（A グループ）**を埋めます。

```bash
cp .env.example .env.local
```

最低限これだけあれば起動します：

```env
# Supabase 接続（Supabase ダッシュボード → Project Settings → API から取得）
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...      # publishable key (sb_publishable_...) でも可
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...          # 機密。サーバー側専用

# DB に保存する API キー等を暗号化する鍵（base64 32 バイト）
ENCRYPTION_KEY=（下記コマンドで生成した文字列）

# アプリ URL（ローカルはこの値でOK）
NEXT_PUBLIC_APP_URL=http://localhost:3001
```

**`ENCRYPTION_KEY` の生成方法**（どちらか1つ）:

```bash
# Node.js（Windows でもそのまま使える・推奨）
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# openssl が入っている場合
openssl rand -base64 32
```

> ⚠️ `ENCRYPTION_KEY` は一度本番運用を始めたら**変更しないでください**。変更すると既存の暗号化データ（保存済み API キー等）が復号できなくなります。

> 📝 **OpenRouter / OpenAI / ElevenLabs の API キーは環境変数に書きません。**
> アプリにログイン後、サイドバーの「設定」ページから登録します（暗号化して DB に保存されます）。

### 3. Supabase のセットアップ

1. [supabase.com](https://supabase.com) でプロジェクトを作成
2. **SQL Editor** で以下を実行
   - まず `supabase/schema.sql`（ベーススキーマ）
   - 続いて `supabase/migrations/` 内の SQL を**ファイル名の日付順に上から順番に**実行（動画・X OAuth・レートリミット等の追加分）
3. **Storage バケットを作成**
   - `post-images` … 画像投稿用。**public read を有効化**（手動作成）
   - `videos` … 動画用（マイグレーション `20260520_video_storage_bucket.sql` で自動作成されます）
4. **ログインユーザーを作成**
   - ログイン画面はメール + パスワード方式（Supabase Auth）。新規登録 UI は無いため、
     Supabase ダッシュボードの **Authentication → Users → Add user** でユーザーを作成してください

### 4. 起動

```bash
npm run dev
```

ブラウザで **http://localhost:3001** を開く → 作成したユーザーでログイン。

---

## 環境変数リファレンス

`.env.example` に全項目とコメントがあります。グループごとの概要：

### (A) 必須 — これが無いと起動しない

| 変数 | 説明 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクト URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key（クライアント用） |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key（**機密・サーバー専用**） |
| `ENCRYPTION_KEY` | API キー暗号化用（base64 32 バイト） |
| `NEXT_PUBLIC_APP_URL` | アプリ URL（OAuth リダイレクト・Referer 生成に使用） |

### (B) 動画 / 追加プラットフォーム（任意）

| 変数 | 用途 |
|------|------|
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` / `TIKTOK_REDIRECT_URI` | TikTok 投稿 |
| `YOUTUBE_OAUTH_CLIENT_ID` / `YOUTUBE_OAUTH_CLIENT_SECRET` / `YOUTUBE_OAUTH_REDIRECT_URI` | YouTube 投稿 |
| `ELEVENLABS_API_KEY` | 音声合成のフォールバック（基本は UI で BYOK 登録） |
| `INSTAGRAM_REDIRECT_URI` / `X_OAUTH_REDIRECT_URI` | リダイレクト URI を別ドメインに固定したい場合のみ |

> Instagram / X のアプリ資格情報（App ID/Secret・OAuth Client ID/Secret）は環境変数ではなく、**アプリ内のアカウント連携パネルで登録**します（BYOK）。

### (C) 任意 / 本番運用

| 変数 | 用途 |
|------|------|
| `ENCRYPTION_KEY_OLD` | 鍵ローテーション時（旧鍵で復号 → 新鍵で再暗号化） |
| `TRIGGER_PUBLIC_API_KEY` | Trigger.dev（バックグラウンドジョブ基盤）。未設定なら `setImmediate` フォールバック |
| `REMOTION_PROVIDER` | `local`（既定）/ `lambda` |
| `REMOTION_BUNDLE_PATH` | Remotion バンドルのキャッシュ先 |
| `VIDEO_RENDERING_ENABLED` | `1` で Vercel 上でも Remotion を強制有効化（自前ワーカー運用向けの脱出ハッチ） |

---

## プラットフォーム連携

すべてアプリ内の **「アカウント管理」/「設定」** 画面から登録します。

- **Threads** — [developers.facebook.com](https://developers.facebook.com) で App を作成し Threads API を追加 → long-lived access token を取得して登録。期限切れ時は publish 実行時に**自動リフレッシュ**
- **Instagram** — Instagram Business Account を Facebook Page に接続 → Graph API の access token を取得 → アプリで登録（Business Account ID は自動取得）。App ID/Secret はアプリ内で登録（BYOK）
- **X (Twitter)** — X Developer Portal で OAuth 2.0 アプリを作成（scope: `tweet.write tweet.read users.read`）→ アプリ内の X タブで Client ID/Secret を登録して連携
- **TikTok / YouTube** — それぞれ Developer Portal / Google Cloud Console で OAuth アプリを作成し、環境変数（B グループ）を設定 → アプリ内で連携

---

## 動画生成についての注意

- **Remotion モード（`remotion`）はローカル限定。** Chromium（約 1.5GB）を必要とし、Vercel Functions のサイズ・タイムアウト制限に収まらないため、`npm run dev` でのみ実行できます。Vercel 上では API が 503 を返します。
- **HeyGen モード（`heygen_avatar`）はクラウドレンダリング**のため、Vercel でも生成可能です。
- Remotion は `remotion/` 配下の独立サブプロジェクトです（コンポジション `ShortVideoMain`）。

---

## プロジェクト構成

```
threads-auto-post/
├── src/
│   ├── app/
│   │   ├── (dashboard)/dashboard/   # ダッシュボード各画面（generate / accounts / drafts / videos / settings / logs）
│   │   ├── api/                     # API ルート（generate / posts / videos / auth / accounts ...）
│   │   ├── login/                   # ログイン（メール+パスワード）
│   │   └── privacy, deletion-status # 各種固定ページ
│   ├── components/                  # UI / generate / video コンポーネント
│   ├── lib/
│   │   ├── ai/                      # テキスト・画像・Vision・APIキー・プロンプト
│   │   ├── platforms/               # threads / instagram / x / tiktok / youtube パブリッシャ
│   │   ├── video/                   # 台本・ElevenLabs・HeyGen・パイプライン・ストレージ
│   │   ├── crypto.ts                # AES-256-GCM 暗号化
│   │   ├── rate-limit.ts            # レートリミット
│   │   └── supabase*.ts             # Supabase クライアント（browser / server / admin）
│   └── types/                       # 型定義
├── supabase/
│   ├── schema.sql                   # ベーススキーマ
│   └── migrations/                  # 追加マイグレーション（日付順に適用）
├── remotion/                        # Remotion 動画サブプロジェクト
├── docs/                            # 設計・レビュー・進捗メモ
├── next.config.ts
└── vercel.json
```

---

## スクリプト

| コマンド | 内容 |
|----------|------|
| `npm run dev` | 開発サーバー起動（`http://localhost:3001`） |
| `npm run build` | 本番ビルド |
| `npm run start` | 本番サーバー起動（ポート 3001） |
| `npm run lint` | ESLint |

---

## デプロイ（Vercel）

```bash
vercel
```

- 環境変数は **Vercel → Project Settings → Environment Variables** に設定します（A グループ必須、B/C は使う機能に応じて）。
- `NEXT_PUBLIC_APP_URL` は本番ドメイン（例: `https://your-app.vercel.app`）に設定してください。
- 既に Vercel に登録済みの環境変数は、ローカルに `vercel env pull .env.local` で取得できます（本番値を扱うため取り扱い注意）。
