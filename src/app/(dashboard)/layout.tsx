'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  PenLine,
  CalendarClock,
  Users,
  ScrollText,
  LayoutDashboard,
  LogOut,
  Zap,
} from 'lucide-react'
import { cx } from '@/lib/utils'
import { createClient } from '@/lib/supabase-browser'

const navItems = [
  { href: '/dashboard', label: 'ホーム', icon: LayoutDashboard },
  { href: '/dashboard/generate', label: '投稿生成', icon: PenLine },
  { href: '/dashboard/schedule', label: 'スケジュール', icon: CalendarClock },
  { href: '/dashboard/accounts', label: 'アカウント', icon: Users },
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
      {/* Sidebar */}
      <nav className="flex w-60 shrink-0 flex-col bg-slate-800">
        {/* Logo */}
        <div className="flex items-center gap-3 border-b border-slate-700 px-5 py-5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[#00A3BF]">
            <Zap className="h-4 w-4 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-tight">AutoPost</p>
            <p className="text-[11px] text-slate-400 leading-tight">Threads 自動投稿</p>
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
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
