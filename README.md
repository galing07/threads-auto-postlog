# SNS Auto Post — Threads自動投稿システム

Claude API + gpt-image-1を使ったThreads自動投稿管理Webアプリ。

## 機能

- **AIテキスト生成** — ペルソナ別の投稿文を自動生成
- **AI図解生成** — 投稿に合わせた図解画像を自動生成
- **プレビュー・承認フロー** — 確認してから投稿
- **予約投稿** — Vercel Cronで15分毎に自動実行
- **多アカウント対応** — ペルソナ別に複数アカウント管理
- **拡張設計** — TikTok / Instagram / X への追加を想定

## セットアップ

### 1. 環境変数

```bash
cp .env.example .env.local
```

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxxx
SUPABASE_SERVICE_ROLE_KEY=xxxx
ANTHROPIC_API_KEY=sk-ant-xxxx
OPENAI_API_KEY=sk-xxxx
CRON_SECRET=任意のランダム文字列
```

### 2. Supabase DBセットアップ

[supabase.com](https://supabase.com) でプロジェクト作成後、SQL Editorで `supabase/schema.sql` を実行。

### 3. Threads APIトークン取得

1. [developers.facebook.com](https://developers.facebook.com) でアプリ作成
2. 「Threads API」製品を追加
3. long-lived アクセストークンを発行（有効期限60日）
4. アプリの「アカウント管理」画面でトークンを登録

### 4. 起動

```bash
npm install
npm run dev
```

### 5. Vercelデプロイ

```bash
vercel
```

`vercel.json` のCronが自動で有効になり、15分毎に予約投稿が実行されます。

## 技術スタック

| カテゴリ | 技術 |
|----------|------|
| フロントエンド | Next.js 16 + Tailwind CSS |
| DB | Supabase (PostgreSQL + RLS) |
| テキスト生成 | Claude API (claude-sonnet-4-6) |
| 画像生成 | OpenAI gpt-image-1 |
| 投稿API | Meta Threads Graph API |
| スケジューラー | Vercel Cron |
| デプロイ | Vercel |

---

*This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).*

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
