'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Zap } from 'lucide-react'
import { createClient } from '@/lib/supabase-browser'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { cx } from '@/lib/utils'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

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

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-950 px-4">
      {/* Logo */}
      <div className="mb-8 flex flex-col items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-500">
          <Zap className="h-6 w-6 text-white" strokeWidth={2.5} />
        </div>
        <div className="text-center">
          <h1 className="text-xl font-bold text-white">AutoPost</h1>
          <p className="text-sm text-gray-500">Threads 自動投稿</p>
        </div>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-white/[0.03] p-8 shadow-2xl">
        <h2 className="mb-6 text-base font-semibold text-white">ログイン</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-400">
              メールアドレス
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="admin@example.com"
              className={cx(
                'w-full rounded-md border px-3 py-2 text-sm outline-hidden transition',
                'border-white/10 bg-white/5 text-white placeholder-gray-600',
                'focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
              )}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-gray-400">
              パスワード
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              className={cx(
                'w-full rounded-md border px-3 py-2 text-sm outline-hidden transition',
                'border-white/10 bg-white/5 text-white placeholder-gray-600',
                'focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20',
              )}
            />
          </div>

          {error && (
            <p className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-400 ring-1 ring-red-500/20">
              {error}
            </p>
          )}

          <Button
            type="submit"
            isLoading={loading}
            loadingText="ログイン中..."
            className="mt-2 w-full rounded-md py-2.5 text-sm"
          >
            ログイン
          </Button>
        </form>
      </div>
    </div>
  )
}
