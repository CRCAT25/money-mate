import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, LoaderCircle } from 'lucide-react';
import AuthLayout from '../../components/auth/AuthLayout.jsx';
import api, { errorMessage } from '../../utils/api.js';
import { useToast } from '../../context/ToastContext.jsx';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resetUrl, setResetUrl] = useState('');
  const { notify } = useToast();
  const submit = async (event) => {
    event.preventDefault(); setSubmitting(true);
    try { const { data } = await api.post('/auth/forgot-password', { email }); setResetUrl(data.previewResetUrl || ''); notify(data.message); }
    catch (error) { notify(errorMessage(error), 'error'); }
    finally { setSubmitting(false); }
  };
  return (
    <AuthLayout eyebrow="Khôi phục tài khoản" title="Mình tìm lại mật khẩu nhé." description="Nhập email đã đăng ký, MoneyMate sẽ gửi hướng dẫn đặt lại mật khẩu.">
      <form onSubmit={submit} className="space-y-5"><label className="block"><span className="label">Email</span><input className="field" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label><button className="primary-button w-full" disabled={submitting}>{submitting ? <LoaderCircle className="size-5 animate-spin" /> : <>Gửi hướng dẫn <ArrowRight className="size-5" /></>}</button></form>
      {resetUrl && <a href={resetUrl} className="secondary-button mt-3 w-full">Mở liên kết chạy thử</a>}
      <Link to="/login" className="mt-6 flex items-center justify-center gap-2 text-sm font-bold text-ink/55"><ArrowLeft className="size-4" /> Quay lại đăng nhập</Link>
    </AuthLayout>
  );
}

