import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Eye, EyeOff, LoaderCircle } from 'lucide-react';
import AuthLayout from '../../components/auth/AuthLayout.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { errorMessage } from '../../utils/api.js';

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { login } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();

  const submit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await login(form);
      navigate('/');
    } catch (error) {
      notify(errorMessage(error), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout title="Đăng nhập">
      <form className="space-y-5" onSubmit={submit}>
        <label className="block"><span className="label">Email</span><input className="field" type="email" autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="ban@email.com" required /></label>
        <label className="block">
          <span className="label">Mật khẩu</span>
          <span className="relative block">
            <input className="field pr-12" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Tối thiểu 8 ký tự" required />
            <button type="button" className="absolute right-1 top-1 grid size-10 place-items-center rounded-xl text-ink/40" onClick={() => setShowPassword(!showPassword)} aria-label="Hiện mật khẩu">{showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}</button>
          </span>
        </label>
        <div className="flex justify-end"><Link className="text-sm font-bold text-forest hover:underline" to="/forgot-password">Quên mật khẩu?</Link></div>
        <button className="primary-button w-full" disabled={submitting}>{submitting ? <LoaderCircle className="size-5 animate-spin" /> : <>Đăng nhập <ArrowRight className="size-5" /></>}</button>
      </form>
      <p className="mt-7 text-center text-sm text-ink/52">Chưa có tài khoản? <Link to="/signup" className="font-extrabold text-forest hover:underline">Bắt đầu cùng nhau</Link></p>
    </AuthLayout>
  );
}
