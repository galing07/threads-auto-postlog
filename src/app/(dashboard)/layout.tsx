'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  PenLine,
  Users,
  ScrollText,
  LayoutDashboard,
  LogOut,
  Zap,
  FileText,
  Sparkles,
} from 'lucide-react'
import { cx } from '@/lib/utils'
import { createClient } from '@/lib/supabase-browser'

const navItems = [
  { href: '/dashboard', label: 'ホーム', icon: LayoutDashboard },
  { href: '/dashboard/generate', label: '投稿生成', icon: PenLine },
  { href: '/dashboard/drafts', label: '下書き', icon: FileText },
  { href: '/dashboard/accounts', label: 'アカウント', icon: Users },
  { href: '/dashboard/prompts', label: 'プロンプト', icon: Sparkles },
  { href: '/dashboard/logs', label: 'ログ', icon: ScrollText },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const isActive = (href: string) =>
    pathname === href || (href !== '/dashboard' && pathname.startsWith(href))

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAFC]">
      {/* Sidebar — desktop only */}
      <nav className="hidden md:flex w-60 shrink-0 flex-col bg-slate-800">
        {/* Logo */}
        <div className="flex items-center gap-3 border-b border-slate-700 px-5 py-5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#00A3BF]">
            <Zap className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-tight">AutoPost</p>
            <p className="text-[11px] text-slate-400 leading-tight">SNS 自動投稿</p>
          </div>
        </div>

        {/* Nav links */}
        <div className="flex flex-1 flex-col overflow-y-auto px-3 py-3 gap-0.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = isActive(href)
            return (
              <Link
                key={href}
                href={href}
                className={cx(
                  'flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors',
                  active
                    ? 'text-white bg-slate-700/60 border-l-2 border-[#00A3BF]'
                    : 'text-slate-300 hover:bg-slate-700/50 hover:text-white',
                )}
              >
                <Icon
                  className={cx('h-4 w-4 shrink-0', active ? 'text-[#00A3BF]' : 'text-slate-400')}
                />
                {label}
              </Link>
            )
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-700 px-3 py-3">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-sm px-4 py-2 text-sm text-slate-400 transition-colors hover:bg-slate-700/50 hover:text-white"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            ログアウト
          </button>
          <p className="mt-1 px-4 text-[11px] text-slate-600">v1.0.0</p>
        </div>
      </nav>

      {/* Main */}
      <main className="flex-1 overflow-auto pb-16 md:pb-0">
        {/* Mobile header */}
        <div className="flex items-center justify-between border-b border-[#e5edf5] bg-white px-4 py-3 md:hidden">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#00A3BF]">
              <Zap className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
            </div>
            <p className="text-sm font-bold text-slate-800">AutoPost</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 rounded-md px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            ログアウト
          </button>
        </div>

        {children}
      </main>

      {/* Bottom nav — mobile only */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 flex border-t border-[#e5edf5] bg-white md:hidden">
        {navItems.map(({ href, label, icon: Icon }) => {
          const active = isActive(href)
          return (
            <Link
              key={href}
              href={href}
              className={cx(
                'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
                active ? 'text-[#00A3BF]' : 'text-slate-400',
              )}
            >
              <Icon className={cx('h-5 w-5', active ? 'text-[#00A3BF]' : 'text-slate-400')} />
              {label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
