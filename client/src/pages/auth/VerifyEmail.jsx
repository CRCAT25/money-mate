import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, CircleAlert, LoaderCircle } from 'lucide-react';
import AuthLayout from '../../components/auth/AuthLayout.jsx';
import api, { errorMessage } from '../../utils/api.js';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const [state, setState] = useState({ loading: true, error: '' });
  useEffect(() => {
    api.post('/auth/verify-email', { token: params.get('token') })
      .then(() => setState({ loading: false, error: '' }))
      .catch((error) => setState({ loading: false, error: errorMessage(error) }));
  }, [params]);
  return (
    <AuthLayout eyebrow="Xác nhận email" title={state.loading ? 'Đang xác nhận...' : state.error ? 'Liên kết chưa đúng.' : 'Email đã sẵn sàng.'}>
      <div className="rounded-[28px] bg-white/70 p-7 text-center shadow-card">
        {state.loading ? <LoaderCircle className="mx-auto size-12 animate-spin text-forest" /> : state.error ? <CircleAlert className="mx-auto size-12 text-coral" /> : <CheckCircle2 className="mx-auto size-12 text-forest" />}
        <p className="mt-4 text-sm leading-6 text-ink/60">{state.loading ? 'Chờ MoneyMate một chút nhé.' : state.error || 'Bạn có thể đăng nhập và bắt đầu quản lý tài chính cùng nhau.'}</p>
        {!state.loading && <Link to="/login" className="primary-button mt-6 w-full">Đi đến đăng nhập</Link>}
      </div>
    </AuthLayout>
  );
}

