import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Copy, LoaderCircle, Users, UserRoundPlus } from 'lucide-react';
import AuthLayout from '../../components/auth/AuthLayout.jsx';
import api, { errorMessage } from '../../utils/api.js';
import { useToast } from '../../context/ToastContext.jsx';

export default function Signup() {
  const [mode, setMode] = useState('create');
  const [form, setForm] = useState({ displayName: '', email: '', password: '', familyName: '', inviteCode: '' });
  const [submitting, setSubmitting] = useState(false);
  const [verifyUrl, setVerifyUrl] = useState('');
  const { notify } = useToast();

  const update = (key) => (event) => setForm({ ...form, [key]: event.target.value });
  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      const { data } = await api.post('/auth/register', { ...form, mode });
      setVerifyUrl(data.previewVerificationUrl || '');
      notify(data.message);
    } catch (error) {
      notify(errorMessage(error), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (verifyUrl) {
    return (
      <AuthLayout eyebrow="Chỉ còn một bước" title="Kiểm tra email của bạn." description="Trong môi trường chạy thử, bạn có thể dùng trực tiếp liên kết xác nhận bên dưới.">
        <a href={verifyUrl} className="primary-button w-full">Xác nhận email <ArrowRight className="size-5" /></a>
        <button className="secondary-button mt-3 w-full" onClick={() => { navigator.clipboard.writeText(verifyUrl); notify('Đã sao chép liên kết.'); }}><Copy className="size-4" /> Sao chép liên kết</button>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout eyebrow="Tạo mái nhà tài chính" title="Hai người, một kế hoạch." description="Tạo không gian mới hoặc dùng mã mời để tham gia cùng người ấy.">
      <div className="mb-6 grid grid-cols-2 rounded-2xl bg-ink/[0.05] p-1.5">
        {[['create', UserRoundPlus, 'Tạo gia đình'], ['join', Users, 'Tham gia']].map(([value, Icon, label]) => (
          <button key={value} type="button" onClick={() => setMode(value)} className={`flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-extrabold transition ${mode === value ? 'bg-white text-ink shadow-sm' : 'text-ink/45'}`}><Icon className="size-4" />{label}</button>
        ))}
      </div>
      <form className="space-y-4" onSubmit={submit}>
        <label className="block"><span className="label">Tên của bạn</span><input className="field" value={form.displayName} onChange={update('displayName')} placeholder="Bạn muốn được gọi là gì?" required /></label>
        <label className="block"><span className="label">Email</span><input className="field" type="email" value={form.email} onChange={update('email')} placeholder="ban@email.com" required /></label>
        <label className="block"><span className="label">Mật khẩu</span><input className="field" type="password" minLength="8" value={form.password} onChange={update('password')} placeholder="Tối thiểu 8 ký tự" required /></label>
        {mode === 'create' ? (
          <label className="block"><span className="label">Tên gia đình</span><input className="field" value={form.familyName} onChange={update('familyName')} placeholder="Ví dụ: Nhà Mình" required /></label>
        ) : (
          <label className="block"><span className="label">Mã mời</span><input className="field uppercase tracking-[0.18em]" value={form.inviteCode} onChange={update('inviteCode')} placeholder="MATE2026" required /></label>
        )}
        <button className="primary-button mt-2 w-full" disabled={submitting}>{submitting ? <LoaderCircle className="size-5 animate-spin" /> : <>Tạo tài khoản <ArrowRight className="size-5" /></>}</button>
      </form>
      <p className="mt-6 text-center text-sm text-ink/52">Đã có tài khoản? <Link to="/login" className="font-extrabold text-forest">Đăng nhập</Link></p>
    </AuthLayout>
  );
}

