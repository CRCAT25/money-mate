import { lazy, Suspense } from 'react';
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
      <nav className="fixed inset-x-0 bottom-0 grid h-[78px] grid-cols-5 items-center border-t border-ink/10 bg-paper/95 px-5 pb-[env(safe-area-inset-bottom)] lg:hidden">
        {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className={`mx-auto ${index === 2 ? 'size-12 rounded-[18px]' : 'size-7 rounded-xl'}`} />)}
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
        <Route path="/signup" element={<GuestRoute><Signup /></GuestRoute>} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/forgot-password" element={<GuestRoute><ForgotPassword /></GuestRoute>} />
        <Route path="/reset-password" element={<GuestRoute><ResetPassword /></GuestRoute>} />
        <Route element={<ProtectedRoute />}>
          <Route index element={<Home />} />
          <Route path="add" element={<TransactionForm />} />
          <Route path="transactions/:id/edit" element={<TransactionForm />} />
          <Route path="categories" element={<Categories />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
