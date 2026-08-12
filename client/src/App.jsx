import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { FamilyProvider } from './context/FamilyContext.jsx';
import AppShell from './components/layout/AppShell.jsx';
import Skeleton from './components/ui/Skeleton.jsx';

const Login = lazy(() => import('./pages/auth/Login.jsx'));
const Signup = lazy(() => import('./pages/auth/Signup.jsx'));
const VerifyEmail = lazy(() => import('./pages/auth/VerifyEmail.jsx'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword.jsx'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword.jsx'));
const Home = lazy(() => import('./pages/Home.jsx'));
const Plans = lazy(() => import('./pages/Plans.jsx'));
const TransactionForm = lazy(() => import('./pages/TransactionForm.jsx'));
const Categories = lazy(() => import('./pages/Categories.jsx'));
const Reports = lazy(() => import('./pages/Reports.jsx'));
const Settings = lazy(() => import('./pages/Settings.jsx'));

function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <FamilyProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </FamilyProvider>
  );
}

function GuestRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return user ? <Navigate to="/" replace /> : children;
}

function LoadingScreen() {
  return (
    <div aria-label="Đang tải MoneyMate" className="min-h-screen bg-cream" role="status">
      <main className="mx-auto max-w-5xl space-y-7 px-4 pb-28 pt-6 sm:px-7 lg:pt-9">
        <div className="space-y-3"><Skeleton className="h-3 w-40" /><Skeleton className="h-11 w-72 max-w-full rounded-2xl" /></div>
        <Skeleton className="h-64 w-full rounded-[32px] bg-ink/10" />
        <div className="grid gap-4 sm:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-24 rounded-[24px]" />)}</div>
        <div className="grid gap-6 sm:grid-cols-2"><Skeleton className="h-72 rounded-[30px]" /><Skeleton className="h-72 rounded-[30px]" /></div>
      </main>
      <nav className="fixed inset-x-0 bottom-0 px-3 pb-[calc(6px+env(safe-area-inset-bottom))] lg:hidden">
        <div className="grid h-[62px] grid-cols-5 items-center rounded-[22px] border border-white/70 bg-[linear-gradient(115deg,rgba(232,242,237,0.94),rgba(255,254,251,0.92)_52%,rgba(252,239,233,0.92))] px-1.5 shadow-[0_10px_32px_rgba(32,49,44,0.14)] backdrop-blur-2xl">
          {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className={`mx-auto ${index === 2 ? '-mt-5 size-[50px] rounded-[17px]' : 'size-8 rounded-[11px]'}`} />)}
        </div>
      </nav>
    </div>
  );
}

function StartupSplash({ authLoading }) {
  const [minimumElapsed, setMinimumElapsed] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const minimumTimer = window.setTimeout(() => setMinimumElapsed(true), reduceMotion ? 120 : 1250);
    return () => window.clearTimeout(minimumTimer);
  }, []);

  useEffect(() => {
    if (!minimumElapsed || authLoading) return undefined;

    setLeaving(true);
    const exitTimer = window.setTimeout(() => setVisible(false), 460);
    return () => window.clearTimeout(exitTimer);
  }, [authLoading, minimumElapsed]);

  useEffect(() => {
    const fallbackTimer = window.setTimeout(() => setLeaving(true), 3200);
    const removeTimer = window.setTimeout(() => setVisible(false), 3660);
    return () => {
      window.clearTimeout(fallbackTimer);
      window.clearTimeout(removeTimer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-label="Đang mở MoneyMate"
      className={`startup-splash${leaving ? ' startup-splash--leaving' : ''}`}
      role="status"
    >
      <div className="startup-splash__orb startup-splash__orb--mint" />
      <div className="startup-splash__orb startup-splash__orb--coral" />
      <div className="startup-splash__grain" />

      <div className="startup-splash__content">
        <div className="startup-mark" aria-hidden="true">
          <span className="startup-mark__card startup-mark__card--back" />
          <span className="startup-mark__card startup-mark__card--middle" />
          <span className="startup-mark__wallet">
            <span className="startup-mark__letter">M</span>
            <span className="startup-mark__clasp" />
          </span>
          <span className="startup-mark__coin">+</span>
        </div>

        <div className="startup-brand">
          <div className="startup-brand__name">MoneyMate</div>
          <div className="startup-brand__tagline">Cùng vun vén mỗi ngày</div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { loading: authLoading } = useAuth();

  return (
    <>
      <StartupSplash authLoading={authLoading} />
      <div className="startup-app">
        <Suspense fallback={<LoadingScreen />}>
          <Routes>
            <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
            <Route path="/signup" element={<GuestRoute><Signup /></GuestRoute>} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/forgot-password" element={<GuestRoute><ForgotPassword /></GuestRoute>} />
            <Route path="/reset-password" element={<GuestRoute><ResetPassword /></GuestRoute>} />
            <Route element={<ProtectedRoute />}>
              <Route index element={<Home />} />
              <Route path="plans" element={<Plans />} />
              <Route path="add" element={<TransactionForm />} />
              <Route path="transactions/:id/edit" element={<TransactionForm />} />
              <Route path="categories" element={<Categories />} />
              <Route path="reports" element={<Reports />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </div>
    </>
  );
}
