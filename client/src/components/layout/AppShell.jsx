import { useEffect } from 'react';
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

  useEffect(() => {
    if (!isHome) return undefined;
    const preloadMenuPages = () => Promise.allSettled([
      import('../../pages/Plans.jsx'),
      import('../../pages/TransactionForm.jsx'),
      import('../../pages/Reports.jsx'),
      import('../../pages/Settings.jsx'),
    ]);

    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(preloadMenuPages, { timeout: 1200 });
      return () => window.cancelIdleCallback(idleId);
    }
    const timer = window.setTimeout(preloadMenuPages, 300);
    return () => window.clearTimeout(timer);
  }, [isHome]);

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

      <nav className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(6px+env(safe-area-inset-bottom))] lg:hidden">
        <div className="grid h-[62px] grid-cols-5 items-center rounded-[22px] border border-white/70 bg-[linear-gradient(115deg,rgba(232,242,237,0.94),rgba(255,254,251,0.92)_52%,rgba(252,239,233,0.92))] px-1.5 shadow-[0_10px_32px_rgba(32,49,44,0.14),0_1px_0_rgba(255,255,255,0.9)_inset] backdrop-blur-2xl">
          {mobileNav.map(({ to, mobile, icon: Icon, primary }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `flex h-full min-w-0 flex-col items-center justify-center gap-0.5 text-[9px] font-medium transition active:scale-[0.96] ${isActive ? 'text-forest' : 'text-ink/38'}`}
            >
              {({ isActive }) => (
                <>
                  {primary ? (
                    <span className="-mt-5 grid size-[50px] place-items-center rounded-[17px] border-[4px] border-paper bg-gradient-to-br from-[#ED785F] to-[#DE654E] text-white shadow-[0_8px_18px_rgba(226,111,84,0.3)] transition-transform active:scale-95">
                      <Icon className="size-[21px]" strokeWidth={2.35} />
                    </span>
                  ) : (
                    <span className={`grid size-8 place-items-center rounded-[11px] transition-colors ${isActive ? 'bg-forest/[0.09]' : 'bg-transparent'}`}>
                      <Icon className="size-[18px]" strokeWidth={isActive ? 2.25 : 1.9} />
                    </span>
                  )}
                  <span className={`max-w-full truncate leading-none ${primary ? 'text-ink/42' : ''}`}>{mobile}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
