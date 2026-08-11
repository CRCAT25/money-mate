import { NavLink, useLocation } from 'react-router-dom';
import { BarChart3, Grid2X2, Home, Plus, Settings, Sparkles, Target } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import Avatar from '../ui/Avatar.jsx';

const nav = [
  { to: '/', label: 'Tổng quan', mobile: 'Home', icon: Home },
  { to: '/plans', label: 'Kế hoạch chi tiêu', mobile: 'Kế hoạch', icon: Target },
  { to: '/categories', label: 'Danh mục', mobile: 'Danh mục', icon: Grid2X2 },
  { to: '/add', label: 'Thêm giao dịch', mobile: 'Thêm', icon: Plus, primary: true },
  { to: '/reports', label: 'Báo cáo', mobile: 'Báo cáo', icon: BarChart3 },
  { to: '/settings', label: 'Cài đặt', mobile: 'Cài đặt', icon: Settings },
];
const mobileNav = nav.filter((item) => item.to !== '/categories');

export default function AppShell({ children }) {
  const { user, family } = useAuth();
  const location = useLocation();
  const isHome = location.pathname === '/';
  const isTransactionForm = location.pathname === '/add' || location.pathname.includes('/transactions/');

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[224px_1fr]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[224px] flex-col overflow-hidden bg-ink px-4 py-5 text-white lg:flex">
        <div className="absolute -left-20 top-40 size-56 rounded-full bg-forest opacity-30 blur-3xl" />
        <div className="relative mb-8 flex items-center gap-2.5 px-2">
          <div className="grid size-10 place-items-center rounded-xl bg-sun font-editorial text-xl font-bold text-ink">M</div>
          <div>
            <div className="text-base font-extrabold tracking-tight">MoneyMate</div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Tài chính nhà mình</div>
          </div>
        </div>
        <nav className="relative flex flex-1 flex-col gap-1">
          {nav.map(({ to, label, icon: Icon, primary }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `flex min-h-11 items-center gap-3 rounded-xl px-3 text-[13px] font-bold transition active:scale-[0.99] ${
                isActive || (primary && location.pathname.includes('/transactions/'))
                  ? 'bg-white text-ink shadow-lg'
                  : 'text-white/58 hover:bg-white/[0.08] hover:text-white'
              }`}
            >
              <Icon className="size-5" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="relative rounded-2xl border border-white/10 bg-white/[0.06] p-2.5">
          <div className="flex items-center gap-3">
            <Avatar user={user} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-extrabold">{user.displayName}</div>
              <div className="truncate text-xs text-white/45">{family?.name}</div>
            </div>
            <Sparkles className="size-4 text-sun" />
          </div>
        </div>
      </aside>

      <div className="min-w-0 lg:col-start-2">
        <main className={`mx-auto min-h-screen max-w-[1440px] px-4 pb-24 sm:px-6 lg:px-9 lg:pb-10 lg:pt-8 xl:px-12 ${isHome ? 'pt-14' : 'pt-4'}`}>
          <div key={location.pathname} className={isHome ? '' : isTransactionForm ? 'animate-fade-only' : 'animate-fade-in'}>
            {children}
          </div>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid h-[68px] grid-cols-5 items-start border-t border-ink/10 bg-paper/96 px-2 pb-[env(safe-area-inset-bottom)] pt-1 shadow-[0_-8px_22px_rgba(32,49,44,0.07)] backdrop-blur-xl lg:hidden">
        {mobileNav.map(({ to, mobile, icon: Icon, primary }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `flex min-w-0 flex-col items-center gap-0.5 text-[9px] font-extrabold transition active:scale-[0.97] ${isActive ? 'text-forest' : 'text-ink/45'}`}
          >
            {primary ? (
              <span className="-mt-4 grid size-12 place-items-center rounded-2xl border-[3px] border-paper bg-coral text-white shadow-md shadow-coral/20">
                <Icon className="size-5" strokeWidth={2.5} />
              </span>
            ) : (
              <span className="grid size-7 place-items-center"><Icon className="size-[18px]" /></span>
            )}
            <span className="truncate">{mobile}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
