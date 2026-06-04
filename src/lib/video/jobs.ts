import 'server-only'
import { after } from 'next/server'
import { runVideoPipeline, type PipelineRunOptions } from '@/lib/video/pipeline'

/**
 * 動画パイプラインのジョブ起動アダプタ。
 *
 * 目的: ルートハンドラやサーバーアクションを「ジョブの起動」だけに薄く保ち、
 * 実体のバックエンド (after / setImmediate / Trigger.dev / Inngest / SQS など) を
 * 環境で差し替えられるようにする。
 *
 * バックエンド選択:
 *   1. process.env.TRIGGER_PUBLIC_API_KEY が設定されている  → Trigger.dev (TODO、未実装時は既定にフォールバック)
 *   2. process.env.VERCEL === '1' (Vercel Functions)        → after() バックエンド
 *   3. それ以外 (ローカル / 長寿命プロセス)                  → setImmediate (inline)
 *
 * 【Vercel での注意】
 * Vercel Functions はレスポンス送出後に実行コンテキストが凍結／終了するため、
 * setImmediate に逃がしたパイプラインは完走できない（HeyGen のジョブ投入前に殺される）。
 * Next.js の after() は内部的に waitUntil 相当で関数を maxDuration まで延命するので、
 * レスポンスを即返しつつバックグラウンド処理（script→voice→HeyGen ジョブ投入）を保証できる。
 *
 * 【Remotion での注意】
 * Remotion レンダリング (Chromium・数分) は Vercel の maxDuration にも収まらないため、
 * runtime-env.videoCapability('remotion') が Vercel では無効化しており、そもそも
 * このアダプタには到達しない。Remotion は inline backend (ローカル長寿命プロセス) 専用。
 */

interface JobBackend {
  name: 'inline' | 'vercel-after' | 'trigger-dev'
  enqueue(videoId: string, opts: PipelineRunOptions): Promise<void>
}

/** Vercel Functions のようにレスポンス後にコンテキストが凍結される環境か。 */
function isServerlessFreezeEnv(): boolean {
  return process.env.VERCEL === '1'
}

function defaultBackend(): JobBackend {
  return isServerlessFreezeEnv() ? vercelAfterBackend : inlineBackend
}

function selectBackend(): JobBackend {
  if (process.env.TRIGGER_PUBLIC_API_KEY) {
    return triggerDevBackend
  }
  return defaultBackend()
}

function logPipelineFatal(backendName: string, videoId: string, err: unknown): void {
  // パイプライン本体は内部で failed に落とすため、ここに来るのは
  // 「failed への書き込み自体が失敗した」場合などに限られる。best-effort で stderr へ。
  process.stderr.write(
    `[video-pipeline] fatal in ${backendName} backend for ${videoId}: ${
      err instanceof Error ? err.message : String(err)
    }\n`,
  )
}

// ---------------------------------------------------------------------------
// inline (setImmediate) — ローカル / 長寿命プロセス専用
// ---------------------------------------------------------------------------

const inlineBackend: JobBackend = {
  name: 'inline',
  async enqueue(videoId: string, opts: PipelineRunOptions): Promise<void> {
    // setImmediate でイベントループの次のティックに逃がす。
    // 例外を catch して swallow しないと unhandledRejection でプロセスが落ちる。
    setImmediate(() => {
      runVideoPipeline(videoId, opts).catch((err: unknown) => {
        logPipelineFatal('inline', videoId, err)
      })
    })
  },
}

// ---------------------------------------------------------------------------
// vercel-after (Next.js after) — Vercel Functions 用
// ---------------------------------------------------------------------------

const vercelAfterBackend: JobBackend = {
  name: 'vercel-after',
  async enqueue(videoId: string, opts: PipelineRunOptions): Promise<void> {
    // after() は request スコープ内（最初の await より前）で同期的に登録する必要がある。
    // 呼び出し側はこの関数をルートハンドラから同期的に呼ぶため、ここで登録すれば
    // レスポンス送出後にコールバックが走り、関数は maxDuration まで延命される。
    after(async () => {
      try {
        await runVideoPipeline(videoId, opts)
      } catch (err: unknown) {
        logPipelineFatal('vercel-after', videoId, err)
      }
    })
  },
}

// ---------------------------------------------------------------------------
// Trigger.dev (TODO: 本番統合)
// ---------------------------------------------------------------------------

const triggerDevBackend: JobBackend = {
  name: 'trigger-dev',
  async enqueue(videoId: string, opts: PipelineRunOptions): Promise<void> {
    // TODO(prod): Trigger.dev SDK を統合する。
    //
    // 想定実装 (SDK 未インストール / 環境変数のみで stub):
    //
    //   import { tasks } from '@trigger.dev/sdk/v3'
    //   await tasks.trigger('run-video-pipeline', { videoId, ...opts })
    //
    // それまでは環境に応じた既定バックエンド (after / inline) にフォールバック。
    process.stderr.write(
      `[video-pipeline] TRIGGER_PUBLIC_API_KEY is set but Trigger.dev integration is not yet implemented. Falling back to ${defaultBackend().name}. videoId=${videoId}\n`,
    )
    await defaultBackend().enqueue(videoId, opts)
  },
}

// ---------------------------------------------------------------------------
// 公開 API
// ---------------------------------------------------------------------------

/**
 * 指定 videoId のパイプライン処理をジョブバックエンドに投入する。
 *
 * 呼び出し側 (API ルート / Server Action) はこの関数を **request スコープ内で同期的に**
 * 呼ぶこと。vercel-after バックエンドは after() を request スコープで登録するため、
 * setImmediate / 別 tick から呼ぶと after() がスコープ外エラーになる。
 *
 * 【本番要件】
 *  - Remotion レンダリング (数分) はどのサーバーレス環境の maxDuration にも収まらない。
 *    Remotion を本番運用する場合は TRIGGER_PUBLIC_API_KEY (または同等) を設定して
 *    Trigger.dev / Inngest / 外部 Worker に処理を委譲すること。
 *  - HeyGen アバター動画はクラウドレンダ + 完了ポーリング分離済みのため、
 *    Vercel の after() バックエンドで完結する（外部 Worker 不要）。
 */
export async function enqueueVideoPipeline(
  videoId: string,
  opts: PipelineRunOptions = {},
): Promise<void> {
  if (!videoId || videoId.trim().length === 0) {
    throw new Error('videoId が空です')
  }
  const backend = selectBackend()
  await backend.enqueue(videoId, opts)
}
