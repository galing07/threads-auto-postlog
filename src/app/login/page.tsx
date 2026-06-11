'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Zap } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { Button } from '@/components/ui/Button'

type Mode = 'login' | 'signup'

const MIN_PASSWORD_LENGTH = 8

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function switchMode(next: Mode) {
    setMode(next)
    setError('')
    setPassword('')
    setInviteCode('')
  }

  async function handleLogin() {
    const supabase = createClient()
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      setError('メールアドレスまたはパスワードが正しくありません')
      setLoading(false)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  async function handleSignup() {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`パスワードは${MIN_PASSWORD_LENGTH}文字以上で入力してください`)
      setLoading(false)
      return
    }

    // サーバー側で招待コードを検証し、アカウントを作成する
    let res: Response
    try {
      res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, inviteCode }),
      })
    } catch {
      setError('通信に失敗しました。時間をおいて再度お試しください')
      setLoading(false)
      return
    }

    if (!res.ok) {
      let message = 'アカウントの作成に失敗しました'
      try {
        const json = await res.json()
        if (json?.error) message = json.error
      } catch {
        /* JSON でなければ既定メッセージを使う */
      }
      setError(message)
      setLoading(false)
      return
    }

    // 作成成功 → そのままログインしてダッシュボードへ
    const supabase = createClient()
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      // 作成自体は成功しているのでログイン画面へ誘導
      setError('アカウントを作成しました。ログインしてください')
      switchMode('login')
      setLoading(false)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    if (mode === 'login') {
      await handleLogin()
    } else {
      await handleSignup()
    }
  }

  const isSignup = mode === 'signup'

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4">
      {/* Logo */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#00A3BF]">
          <Zap className="h-6 w-6 text-white" strokeWidth={2.5} />
        </div>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">SNS AutoPost</h1>
          <p className="text-sm text-gray-500">マルチSNS自動投稿</p>
        </div>
      </div>

      {/* Card */}
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-8"
        style={{
          border: '1px solid #e5edf5',
          boxShadow: 'rgba(50,50,93,0.08) 0px 8px 20px -8px, rgba(0,0,0,0.05) 0px 5px 10px -5px',
        }}
      >
        <h2 className="mb-6 text-xl font-bold text-gray-900">
          {isSignup ? '新規アカウント作成' : 'ログイン'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-email" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">
              メールアドレス
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              autoFocus
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="admin@example.com"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-hidden transition placeholder-gray-400 focus:border-[#00A3BF] focus:ring-2 focus:ring-[#00A3BF]/20"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">
              パスワード
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={isSignup ? MIN_PASSWORD_LENGTH : undefined}
              placeholder="••••••••"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-hidden transition placeholder-gray-400 focus:border-[#00A3BF] focus:ring-2 focus:ring-[#00A3BF]/20"
            />
            {isSignup && (
              <p className="mt-1 text-xs text-gray-400">{MIN_PASSWORD_LENGTH}文字以上</p>
            )}
          </div>

          {isSignup && (
            <div>
              <label htmlFor="signup-invite" className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-500">
                招待コード
              </label>
              <input
                id="signup-invite"
                type="text"
                autoComplete="off"
                value={inviteCode}
                onChange={e => setInviteCode(e.target.value)}
                required
                placeholder="招待コードを入力"
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-hidden transition placeholder-gray-400 focus:border-[#00A3BF] focus:ring-2 focus:ring-[#00A3BF]/20"
              />
            </div>
          )}

          {error && (
            <p role="alert" aria-live="assertive" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 ring-1 ring-red-200">
              {error}
            </p>
          )}

          <Button
            type="submit"
            isLoading={loading}
            loadingText={isSignup ? '作成中...' : 'ログイン中...'}
            className="mt-2 w-full py-2.5"
          >
            {isSignup ? 'アカウントを作成' : 'ログイン'}
          </Button>
        </form>

        {/* モード切替 */}
        <div className="mt-6 border-t border-gray-100 pt-4 text-center">
          {isSignup ? (
            <p className="text-sm text-gray-500">
              すでにアカウントをお持ちですか？{' '}
              <button
                type="button"
                onClick={() => switchMode('login')}
                className="font-medium text-[#00A3BF] hover:underline"
              >
                ログイン
              </button>
            </p>
          ) : (
            <p className="text-sm text-gray-500">
              アカウントをお持ちでない方は{' '}
              <button
                type="button"
                onClick={() => switchMode('signup')}
                className="font-medium text-[#00A3BF] hover:underline"
              >
                新規登録
              </button>
            </p>
          )}
        </div>

        {!isSignup && (
          <p className="mt-4 text-center text-xs text-gray-400">
            パスワードをお忘れの場合は管理者にお問い合わせください
          </p>
        )}
      </div>
    </div>
  )
}
