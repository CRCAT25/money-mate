import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, LoaderCircle } from 'lucide-react';
import AuthLayout from '../../components/auth/AuthLayout.jsx';
import api, { errorMessage } from '../../utils/api.js';
import { useToast } from '../../context/ToastContext.jsx';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const { notify } = useToast();
  const submit = async (event) => {
    event.preventDefault(); setSubmitting(true);
    try { await api.post('/auth/reset-password', { token: params.get('token'), password }); setDone(true); }
    catch (error) { notify(errorMessage(error), 'error'); }
    finally { setSubmitting(false); }
  };
  return (
    <AuthLayout eyebrow="Mật khẩu mới" title={done ? 'Xong rồi, thật nhẹ nhàng.' : 'Chọn mật khẩu mới.'} description="Dùng ít nhất 8 ký tự và tránh mật khẩu bạn đã dùng ở nơi khác.">
      {done ? <div className="text-center"><CheckCircle2 className="mx-auto size-14 text-forest" /><Link to="/login" className="primary-button mt-6 w-full">Đăng nhập</Link></div> : <form onSubmit={submit} className="space-y-5"><label className="block"><span className="label">Mật khẩu mới</span><input className="field" type="password" minLength="8" value={password} onChange={(e) => setPassword(e.target.value)} required /></label><button className="primary-button w-full" disabled={submitting}>{submitting ? <LoaderCircle className="size-5 animate-spin" /> : 'Cập nhật mật khẩu'}</button></form>}
    </AuthLayout>
  );
}

