import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { BarChart3, Grid2X2, Home, Plus, Sparkles, Target, UserRound } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import Avatar from '../ui/Avatar.jsx';
import { SpaceSelectionModal } from './SpaceSwitcher.jsx';

const nav = [
  { to: '/', label: 'Tổng quan', mobile: 'Home', icon: Home },
  { to: '/plans', label: 'Kế hoạch chi tiêu', mobile: 'Kế hoạch', icon: Target },
  { to: '/categories', label: 'Danh mục', mobile: 'Danh mục', icon: Grid2X2 },
  { to: '/add', label: 'Thêm giao dịch', mobile: 'Thêm', icon: Plus, primary: true },
  { to: '/reports', label: 'Báo cáo', mobile: 'Báo cáo', icon: BarChart3 },
  { to: '/settings', label: 'Hồ sơ', mobile: 'Hồ sơ', icon: UserRound, profile: true },
];
const mobileNav = nav.filter((item) => item.to !== '/categories');

export default function AppShell({ children }) {
  const { user, family, activeSpaceId } = useAuth();
  const location = useLocation();
  const [spaceMenuOpen, setSpaceMenuOpen] = useState(false);
  const holdTimer = useRef(null);
  const heldProfile = useRef(false);
  const isHome = location.pathname === '/';
  const isTransactionForm = location.pathname === '/add' || location.pathname.includes('/transactions/');

  const cancelProfileHold = () => {
    window.clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };
  const startProfileHold = () => {
    cancelProfileHold();
    heldProfile.current = false;
    holdTimer.current = window.setTimeout(() => {
      heldProfile.current = true;
      navigator.vibrate?.(18);
      setSpaceMenuOpen(true);
    }, 480);
  };

  useEffect(() => {
    const preloadMenuPages = () => Promise.allSettled([
      import('../../pages/Home.jsx'),
      import('../../pages/Plans.jsx'),
      import('../../pages/TransactionForm.jsx'),
      import('../../pages/Reports.jsx'),
      import('../../pages/Settings.jsx'),
    ]);

    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(preloadMenuPages, { timeout: 500 });
      return () => window.cancelIdleCallback(idleId);
    }
    const timer = window.setTimeout(preloadMenuPages, 100);
    return () => window.clearTimeout(timer);
  }, []);

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
          <button type="button" className="flex w-full items-center gap-3 text-left" onClick={() => setSpaceMenuOpen(true)}>
            <Avatar user={user} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-extrabold">{user.displayName}</div>
              <div className="truncate text-xs text-white/45">{family?.name}</div>
            </div>
            <Sparkles className="size-4 text-sun" />
          </button>
        </div>
      </aside>

      <div className="min-w-0 lg:col-start-2">
        <main className={`mx-auto min-h-screen max-w-[1440px] px-4 pb-24 sm:px-6 lg:px-9 lg:pb-10 lg:pt-8 xl:px-12 ${isHome ? 'pt-14' : 'pt-4'}`}>
          <div key={`${location.pathname}:${activeSpaceId}`} className={isHome ? '' : isTransactionForm ? 'animate-fade-only' : 'animate-fade-in'}>
            {children}
          </div>
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 px-2.5 pb-[calc(7px+env(safe-area-inset-bottom))] lg:hidden">
        <div className="grid h-[68px] grid-cols-5 items-center rounded-[23px] border border-white/70 bg-[linear-gradient(115deg,rgba(232,242,237,0.94),rgba(255,254,251,0.92)_52%,rgba(252,239,233,0.92))] px-1 shadow-[0_10px_32px_rgba(32,49,44,0.14),0_1px_0_rgba(255,255,255,0.9)_inset] backdrop-blur-2xl">
          {mobileNav.map(({ to, mobile, icon: Icon, primary, profile }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onPointerDown={profile ? startProfileHold : undefined}
              onPointerUp={profile ? () => {
                cancelProfileHold();
                window.setTimeout(() => { heldProfile.current = false; }, 0);
              } : undefined}
              onPointerCancel={profile ? () => { cancelProfileHold(); heldProfile.current = false; } : undefined}
              onPointerLeave={profile ? () => { cancelProfileHold(); heldProfile.current = false; } : undefined}
              onContextMenu={profile ? (event) => event.preventDefault() : undefined}
              onClick={profile ? (event) => {
                cancelProfileHold();
                if (heldProfile.current) {
                  event.preventDefault();
                }
              } : undefined}
              className={({ isActive }) => `relative z-10 flex h-full min-h-[58px] min-w-0 touch-manipulation select-none flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition active:scale-[0.97] ${isActive ? 'text-forest' : 'text-ink/42'}`}
            >
              {({ isActive }) => (
                <>
                  {primary ? (
                    <span className="pointer-events-none -mt-4 grid size-[54px] place-items-center rounded-[18px] border-[4px] border-paper bg-gradient-to-br from-[#ED785F] to-[#DE654E] text-white shadow-[0_8px_18px_rgba(226,111,84,0.3)] transition-transform active:scale-95">
                      <Icon className="size-[23px]" strokeWidth={2.35} />
                    </span>
                  ) : (
                    <span className={`pointer-events-none grid size-9 place-items-center rounded-[12px] transition-colors ${isActive ? 'bg-forest/[0.09]' : 'bg-transparent'}`}>
                      <Icon className="size-[20px]" strokeWidth={isActive ? 2.25 : 1.9} />
                    </span>
                  )}
                  <span className={`pointer-events-none max-w-full truncate leading-none ${primary ? 'text-ink/42' : ''}`}>{mobile}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
      <SpaceSelectionModal open={spaceMenuOpen} onClose={() => setSpaceMenuOpen(false)} />
    </div>
  );
}
