# 納品前クロスレビュー結果 — 2026-06-09

## 概要

納品に向けて、6観点（不要コード/矛盾・バグ(投稿)・バグ(AI/動画)・セキュリティ/データ・UI/UX・エラー処理）で並列レビューを実施し、**各指摘を別エージェントが実コードで反証検証**して誤検出を除外した。

- レビュー方式: マルチエージェント・クロスレビュー（53エージェント / 全指摘を実コード根拠で検証）
- **生指摘 47件 → 確定 33件 / 誤検出として除外 14件**
- 重大度内訳（検証で補正後）: **CRITICAL 1 / HIGH 1 / MEDIUM 15 / LOW 16**

> severity は検証エージェントが実害ベースで補正した値を採用。各レビュアーの初期severityから下方修正されたものが多い（＝過大評価を排除済み）。

---

## 🔴 CRITICAL（納品前に必須）

### C-1. Threads の uninstall/delete Webhook が暗号化済み client_secret を復号せず使用 → コールバックが全件失敗
- **ファイル**: `src/app/api/auth/threads/uninstall/route.ts:68`, `src/app/api/auth/threads/delete/route.ts:64`
- **内容**: 両Webhookが DB の `threads_client_secret`（`v1:...` 形式の暗号文）を `decryptSecret()` せずそのまま HMAC-SHA256 の鍵に使っている。`accounts` POST 保存時は `encryptSecret`、`publishers.ts:236` では `decryptSecret` しているのに、この2ファイルだけ復号が抜けている。
- **影響**: ENCRYPTION_KEY 設定後に登録された全アカウントで署名検証が必ず失敗 → `matchedAccountId` が null → **Meta からのアンインストール/データ削除コールバックを受けても対象を無効化・削除できない**。Meta が要求する**データ削除義務（GDPR相当）を実質的に果たせない**コンプライアンス上の欠陥。
- **修正**: 両ファイルに `import { decryptSecret } from '@/lib/crypto'` を追加し、`parseSignedRequest` に渡す前に `decryptSecret(acc.threads_client_secret) ?? acc.threads_client_secret` で復号する（`decryptSecret` は平文フォールバック対応済みで後方互換）。
- ※認証バイパス（偽署名の受理）ではなく「全部弾く」フェイルクローズなので情報漏洩はないが、削除義務不履行のため CRITICAL 維持。

---

## 🟠 HIGH（納品前に強く推奨）

### H-1. 参考アカウント追加 handleAdd() がサイレント失敗＋ネットワーク断で無限ローディング
- **ファイル**: `src/app/(dashboard)/dashboard/accounts/page.tsx:580-596`
- **内容**: try/catch も `res.ok` チェックも無く、`data.error` が真でも何も表示しない。さらに `fetch()` が例外を投げると `setSaving(false)` に到達せず**「保存中…」のまま永久に固まる**。同コンポーネントの `handleDelete()` は `toast.error` を出しており、ここだけ確立済みパターンから逸脱。
- **修正**: `fetch` を try/catch で囲み `finally { setSaving(false) }`、`!res.ok`/`data.error` 時は `toast.error` を表示（`handleDelete` と同パターンに統一）。

---

## 🟡 MEDIUM（保守性・限定条件のバグ・UX欠陥）

### バグ（投稿/連携）
- **M-1. Threads 投稿: container作成→publish の間に401が起きると孤立コンテナが残る** — `src/lib/platforms/threads.ts:79-91`。reactive retry が `createThreadsPost` 全体を再実行するため未公開コンテナが量産されうる（可視の二重投稿ではないがリソースリーク）。Instagram Reels の `onContainerCreated` 相当の中間ID永続化が Threads に無い。→ retry時は既存 container で `threads_publish` のみ再試行する設計に。
- **M-2. X スレッド投稿が途中失敗すると中途半端なスレッドが残る** — `src/lib/platforms/x.ts:248-260`。`for` ループで逐次投稿し、途中失敗時のロールバック無し。auth エラーからの retry で先頭ツイートが重複する経路あり。→ 投稿済みID付きで throw し、append retry か残留削除を選べるように。

### バグ（AI/動画）
- **M-3. 動画パイプラインが `generating_*`/`rendering` で stuck すると復旧不能** — `src/lib/video/pipeline.ts:768-800`。`acquireGenerationLock` は `draft` からのみ、restart は `failed` からのみ。`markVideoFailed` はエラーを握り潰すため、途中でDB書込失敗/プロセス停止すると永久に詰む。予約投稿の stale-lock 回収と同じ仕組みを動画にも。
- **M-4. `script.ts` に `finish_reason` チェックが無い** — `src/lib/video/script.ts:431-444`。`max_tokens` 到達で切れたJSONを「パース失敗」として無駄に3回リトライ＆誤解を招くエラー。`text.ts` 同様に `finish_reason==='length'` を検出して即エラー化。
- **M-5. `fetchHeyGenKey` がDB一時エラーをログ無しで握り潰す** — `src/lib/video/heygen.ts:86-88`。「キー未設定」と誤表示。`elevenlabs.ts` 同様に `console.error` を残す（79行の `if (!error && data)` も error を捨てている）。
- **M-6. `regenerateAllSceneAudio` の `final_video_url: null` 更新を検証していない** — `src/lib/video/pipeline.ts:1339-1343`。失敗すると古いMP4が残り、再レンダー導線も塞がれ古い音声のまま公開されうる。`.throwOnError()` を付与（同ファイルの兄弟は付与済み）。
- **M-7. ElevenLabs の 402 判定が日本語メッセージへの正規表現依存** — `src/lib/video/elevenlabs.ts:385`。`/HTTP 402/.test(e.message)` は文言変更で壊れる。`ElevenLabsQuotaError` に `status` フィールドを足して `e.status===402` で判定（`ElevenLabsApiError` は既にこの形）。

### セキュリティ/データ
- **M-8. TikTok OAuth の state cookie が他フローと不整合** — `src/app/api/auth/tiktok/route.ts:55`。`sameSite:'lax'` ＆ `secure: NODE_ENV==='production'`。Instagram/X は `sameSite:'none', secure:true`（戻り遷移での取りこぼし対策済み）。TikTok だけ移行漏れ → state_missing で連携失敗しうる。None+Secure に統一。
- **M-9. Threads Webhook（uninstall/delete）にレート制限が無い** — `src/app/api/auth/threads/uninstall/route.ts:47`。毎POSTで全アカウントをページネーション無しで取得し各行HMAC計算。匿名バケットのレート制限＋安価な事前リジェクトでDoS/コストを抑制。

### UI/UX
- **M-10. Threads 生成で500字超過を投稿/予約できてしまう** — `src/app/(dashboard)/dashboard/generate/threads/page.tsx:425-431`。CharCounterは赤表示するのに `actionDisabled` 未指定。X/Instagram は超過時に無効化済み。`over` 判定を計算して `actionDisabled`/`actionDisabledReason` を渡し3画面で統一。
- **M-11. アカウント追加モーダルにアクセシビリティ対応が無い** — `src/app/(dashboard)/dashboard/accounts/page.tsx:951-972`。最重要モーダルなのに `role="dialog"`/`aria-modal`/フォーカストラップ/Esc/スクロールロックが全て無い。他5モーダルは `useModalA11y` 使用済み。同フックを適用。
- **M-12. ログイン失敗エラーがスクリーンリーダーに通知されない** — `src/app/login/page.tsx:90-94`。素の `<p>` で `role="alert"`/`aria-live` 無し（WCAG 4.1.3 不適合）。`accounts` の formError(1178) も同様。`role="alert"` 付与。

### エラー処理
- **M-13. publish失敗の汎用Errorメッセージを sanitize せずDB保存** — `src/app/api/posts/[id]/publish/route.ts:125-137`, `src/app/api/videos/_lib/publish-helper.ts:224-231`。現状トークンが混入する経路は無いが、AI生成系と違い無害化が抜けている。`sanitizeProviderError(e)` を通す多層防御。
- **M-14. publish の予期しない例外も HTTP 400 を返す** — `src/app/api/posts/[id]/publish/route.ts:147`。内部エラーは 500 が適切。`PublishError` のみ 400、それ以外は 500 に。

---

## 🟢 LOW（任意・好み・軽微）

| # | 指摘 | ファイル |
|---|------|---------|
| L-1 | 本番に `console.log`（X連携scope出力）。他は全て `console.error`、規約違反＆不統一 | `src/app/api/auth/x/callback/route.ts:100` |
| L-2 | Trigger.dev が未実装スタブのまま有効化可能（警告ログ＋docsで緩和済み） | `src/lib/video/jobs.ts:98-117` |
| L-3 | `publishers.ts` の「tiktok/youtube は今後追加」コメントが実態と矛盾（動画は実装済・テキストは非対応） | `src/lib/platforms/publishers.ts:213-215` |
| L-4 | `PUBLIC_ACCOUNT_COLUMNS` の「x_refresh_token（削除済）」が陳腐化（列は再追加され実在） | `src/app/api/accounts/route.ts:26-31` |
| L-5 | Instagram 長期トークン交換失敗時に短期トークンへ無言フォールバック（API契約違反時のみ／fail-loud化推奨） | `src/lib/platforms/instagram.ts:393` |
| L-6 | HeyGen `voice_url` だけ signed URL を永続化（他は storage path 保存・7日期限で実害ほぼ無） | `src/lib/video/pipeline.ts:927` |
| L-7 | `CRON_SECRET` 比較が `===`（timingSafeEqual 推奨／実攻撃成立性は低） | `src/app/api/cron/publish-scheduled/route.ts:44` |
| L-8 | Threads Webhook GET が内部名称を無認証で返す（`{ ok:true }` のみに） | `src/app/api/auth/threads/uninstall/route.ts:97` |
| L-9 | `supabase.ts` の setAll が空 catch（Supabase公式推奨だがコメント明示推奨） | `src/lib/supabase.ts:16` |
| L-10 | パスワード表示トグルが絵文字 👁/🙈（他は lucide Eye/EyeOff で統一） | `src/components/ui/Input.tsx:32-42` |
| L-11 | ログイン画面に autoFocus・パスワード復旧導線が無い | `src/app/login/page.tsx:57-104` |
| L-12 | PostType グリッドが3列で5項目だとモバイルで不揃い | `src/components/generate/GenerateParts.tsx:363` |
| L-13 | 下書きカードの投稿先 select 未選択時に無効理由テキストが無い | `src/app/(dashboard)/dashboard/drafts/page.tsx:276-329` |
| L-14 | OAuth callback のエラー理由（`server_misconfigured` 等）がURLクエリに露出（汎用コード化推奨） | `src/app/api/auth/x/callback/route.ts:31-35` |
| L-15 | 参考アカウント一覧の初期取得エラーを握り潰し（無言で空欄） | `src/app/(dashboard)/dashboard/accounts/page.tsx:575-578` |
| L-16 | 投稿失敗トーストに次アクション導線が無い（Toastのaction機能未活用） | `src/app/api/posts/[id]/publish/route.ts:147` |

---

## 参考: 誤検出として除外した主な指摘（14件）

検証で「コードの前提認識が誤り」または「自己矛盾」と判定し、報告から除外。納品判断のノイズにしないための記録。

- 「reactive retry が古いトークンで再試行される」系（複数）→ `account` と `dctx.account` は同一参照のため**正しく更新トークンで再試行される**。指摘本文自身が「実際は機能する」と認めており自己矛盾。
- 「TikTok access_token の二重復号バグ」→ `decryptSecret` は平文を素通しするため無害（コメントで文書化済み）。
- 「lucide と remixicon の二重依存が方針と矛盾」→ コメントは“ブランドロゴのみ remixicon”の意で、UIアイコン=lucide は意図通り。読み違い。
- 「schedule route の所有権チェックでIDOR」→ post.user_id と account.user_id が別ユーザーになる経路が存在せず**到達不能**。RLSも同条件で多層防御。
- 「image.ts が public URL を返すのは private バケットと矛盾」→ `post-images` は意図的にpublic（SNS APIが公開URLを要求）。READMEに明記済み。
- 「cron の `updating_at` 誤字／stale-lock が壊れる」→ 実際は `updated_at` で正しい。構文も標準。
- 「videos/status の replica lag race」→ 本プロジェクトは read replica 未使用、同一primaryで逐次awaitのため発生しない。
- 「api-keys GET が Client ID を平文返却」→ OAuth Client ID は公開識別子。本人認証必須で他人の値は取得不可。
- ほか、posts.user_id の NOT NULL 欠如（意図的なデモ投稿設計）、cron の sanitize 欠如（手動ルートも同様で漏洩経路なし）等。

---

## 納品前 推奨アクション（優先順）

1. **C-1 を修正**（Threads webhook の `decryptSecret` 追加）— 必須。データ削除義務に直結。
2. **H-1 を修正**（handleAdd の try/catch + finally + エラー表示）— 体感バグ。
3. MEDIUM のうち**ユーザーが必ず触れる導線**を優先: M-10（Threads字数ガード）, M-12（ログインa11y）, M-11（モーダルa11y）, M-4/M-5（生成失敗時の挙動）。
4. 残り MEDIUM/LOW は納品後の継続改善でも可。L-1（console.log）は規約準拠のため早めに。

> 本レビューはコード静的解析ベース。最終的な動作確認（特に C-1 の Webhook 署名検証）は、修正後に実トークンでの結合テストを推奨。
