import { NavLink, useLocation } from 'react-router-dom';
import { BarChart3, Grid2X2, Home, Plus, Settings, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import Avatar from '../ui/Avatar.jsx';

const nav = [
  { to: '/', label: 'Tổng quan', mobile: 'Home', icon: Home },
  { to: '/categories', label: 'Danh mục', mobile: 'Danh mục', icon: Grid2X2 },
  { to: '/add', label: 'Thêm giao dịch', mobile: 'Thêm', icon: Plus, primary: true },
  { to: '/reports', label: 'Báo cáo', mobile: 'Báo cáo', icon: BarChart3 },
  { to: '/settings', label: 'Cài đặt', mobile: 'Cài đặt', icon: Settings },
];

export default function AppShell({ children }) {
  const { user, family } = useAuth();
  const location = useLocation();

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col overflow-hidden bg-ink px-5 py-6 text-white lg:flex">
        <div className="absolute -left-20 top-40 size-64 rounded-full bg-forest opacity-40 blur-3xl" />
        <div className="relative mb-10 flex items-center gap-3 px-2">
          <div className="grid size-11 place-items-center rounded-[15px] bg-sun font-editorial text-2xl font-bold text-ink">M</div>
          <div>
            <div className="text-lg font-extrabold tracking-tight">MoneyMate</div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Tài chính nhà mình</div>
          </div>
        </div>
        <nav className="relative flex flex-1 flex-col gap-2">
          {nav.map(({ to, label, icon: Icon, primary }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `flex min-h-12 items-center gap-3 rounded-2xl px-4 text-sm font-bold transition ${
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
        <div className="relative rounded-[22px] border border-white/10 bg-white/[0.06] p-3">
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
        <header className="sticky top-0 z-30 flex h-[72px] items-center justify-between border-b border-ink/[0.06] bg-cream/85 px-4 backdrop-blur-xl sm:px-7 lg:hidden">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-[14px] bg-ink font-editorial text-xl font-bold text-white">M</div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-ink/40">Gia đình</div>
              <div className="max-w-48 truncate text-sm font-extrabold text-ink">{family?.name}</div>
            </div>
          </div>
          <Avatar user={user} />
        </header>
        <main className="mx-auto min-h-screen max-w-[1440px] px-4 pb-28 pt-6 sm:px-7 lg:px-10 lg:pb-12 lg:pt-9 xl:px-14">
          <div key={location.pathname} className="animate-fade-in">
            {children}
          </div>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 grid h-[78px] grid-cols-5 items-start border-t border-ink/10 bg-paper/95 px-2 pb-[env(safe-area-inset-bottom)] pt-2 shadow-[0_-10px_30px_rgba(23,54,47,0.08)] backdrop-blur-xl lg:hidden">
        {nav.map(({ to, mobile, icon: Icon, primary }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) => `flex min-w-0 flex-col items-center gap-1 text-[10px] font-extrabold transition ${isActive ? 'text-forest' : 'text-ink/42'}`}
          >
            {primary ? (
              <span className="-mt-6 grid size-14 place-items-center rounded-[19px] border-4 border-paper bg-coral text-white shadow-lg shadow-coral/25">
                <Icon className="size-6" strokeWidth={2.5} />
              </span>
            ) : (
              <span className="grid size-8 place-items-center"><Icon className="size-5" /></span>
            )}
            <span className="truncate">{mobile}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
