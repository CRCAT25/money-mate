import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, ImagePlus, KeyRound, LoaderCircle, LogOut, RefreshCw, Save, Shield, Trash2, UserMinus, Users, X } from 'lucide-react';
import Avatar from '../components/ui/Avatar.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useFamilyData } from '../context/FamilyContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import api, { errorMessage } from '../utils/api.js';

export default function Settings() {
  const { user, logout, refreshProfile } = useAuth();
  const { familyDetails, reloadBaseData, loading } = useFamilyData();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [profile, setProfile] = useState({ displayName: user.displayName, email: user.email, avatarUrl: user.avatarUrl || '' });
  const [familyForm, setFamilyForm] = useState({ name: '', currency: 'VND', language: 'vi' });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [saving, setSaving] = useState('');
  const [verificationUrl, setVerificationUrl] = useState('');
  const avatarInput = useRef(null);

  useEffect(() => {
    if (familyDetails) setFamilyForm({ name: familyDetails.name, currency: familyDetails.currency, language: familyDetails.language });
  }, [familyDetails]);

  if (loading) return <SettingsPageSkeleton />;

  const saveProfile = async (event) => {
    event.preventDefault(); setSaving('profile');
    try { const { data } = await api.patch('/users/me', profile); setVerificationUrl(data.previewVerificationUrl || ''); notify(data.message); await Promise.all([refreshProfile(), reloadBaseData()]); }
    catch (error) { notify(errorMessage(error), 'error'); }
    finally { setSaving(''); }
  };
  const chooseAvatar = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return notify('Vui lòng chọn một tệp ảnh.', 'error');
    if (file.size > 5 * 1024 * 1024) return notify('Ảnh gốc cần nhỏ hơn 5 MB.', 'error');
    try {
      const avatarUrl = await resizeAvatar(file);
      setProfile((current) => ({ ...current, avatarUrl }));
    }
    catch { notify('Không thể đọc ảnh này. Hãy thử một ảnh khác.', 'error'); }
  };
  const saveFamily = async (event) => {
    event.preventDefault(); setSaving('family');
    try { const { data } = await api.patch('/family', familyForm); notify(data.message); await Promise.all([refreshProfile(), reloadBaseData()]); }
    catch (error) { notify(errorMessage(error), 'error'); }
    finally { setSaving(''); }
  };
  const changePassword = async (event) => {
    event.preventDefault(); setSaving('password');
    try { const { data } = await api.patch('/users/me/password', passwords); notify(data.message); await logout(); navigate('/login'); }
    catch (error) { notify(errorMessage(error), 'error'); }
    finally { setSaving(''); }
  };
  const regenerateCode = async () => {
    try { const { data } = await api.post('/family/invite-code'); notify(data.message); await reloadBaseData(); }
    catch (error) { notify(errorMessage(error), 'error'); }
  };
  const removeMember = async (member) => {
    if (!window.confirm(`Xóa ${member.displayName} khỏi gia đình? Các giao dịch cũ vẫn được giữ lại.`)) return;
    try { await api.delete(`/family/members/${member.id}`); notify('Đã xóa thành viên.'); await reloadBaseData(); }
    catch (error) { notify(errorMessage(error), 'error'); }
  };
  const deleteAccount = async () => {
    if (!window.confirm('Bạn chắc chắn muốn xóa tài khoản? Thao tác này không thể hoàn tác.')) return;
    try { await api.delete('/users/me'); await logout(); navigate('/signup'); }
    catch (error) { notify(errorMessage(error), 'error'); }
  };

  return (
    <div className="space-y-7">
      <div><p className="mb-2 text-xs font-extrabold uppercase tracking-[0.17em] text-coral">Không gian của nhà mình</p><h1 className="font-editorial text-4xl font-semibold tracking-[-0.03em] text-ink sm:text-5xl">Cài đặt.</h1></div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SettingsCard eyebrow="Cá nhân" title="Hồ sơ của bạn" icon={Shield}>
          <form onSubmit={saveProfile} className="space-y-5">
            <div className="flex items-center gap-4 rounded-[22px] bg-mint/55 p-4"><Avatar user={{ ...user, ...profile }} size="lg" /><div className="min-w-0 flex-1"><div className="truncate font-extrabold text-ink">{profile.displayName || user.displayName}</div><div className="mt-1 truncate text-sm text-ink/45">{profile.email}</div><div className="mt-3 flex flex-wrap gap-2"><button type="button" className="inline-flex min-h-9 items-center gap-2 rounded-xl bg-white px-3 text-xs font-extrabold text-forest shadow-sm" onClick={() => avatarInput.current?.click()}><ImagePlus className="size-4" /> Chọn ảnh</button>{profile.avatarUrl && <button type="button" className="inline-flex min-h-9 items-center gap-1 rounded-xl px-2 text-xs font-bold text-coral" onClick={() => setProfile({ ...profile, avatarUrl: '' })}><X className="size-4" /> Gỡ ảnh</button>}</div><input ref={avatarInput} className="hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseAvatar} /></div></div>
            <label className="block"><span className="label">Tên hiển thị</span><input className="field" value={profile.displayName} onChange={(e) => setProfile({ ...profile, displayName: e.target.value })} required /></label>
            <label className="block"><span className="label">Email</span><input className="field" type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} required /></label>
            {verificationUrl && <a className="flex min-h-12 items-center justify-center rounded-2xl bg-sun/25 px-4 text-sm font-extrabold text-ink" href={verificationUrl}>Xác nhận email mới</a>}
            <button className="primary-button" disabled={saving === 'profile'}>{saving === 'profile' ? <LoaderCircle className="size-5 animate-spin" /> : <Save className="size-4" />} Lưu hồ sơ</button>
          </form>
        </SettingsCard>

        <SettingsCard eyebrow="Gia đình" title="Thông tin chung" icon={Users}>
          <form onSubmit={saveFamily} className="space-y-5">
            <label className="block"><span className="label">Tên gia đình</span><input className="field" value={familyForm.name} onChange={(e) => setFamilyForm({ ...familyForm, name: e.target.value })} required /></label>
            <div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="label">Loại tiền</span><select className="field" value={familyForm.currency} onChange={(e) => setFamilyForm({ ...familyForm, currency: e.target.value })}><option>VND</option><option>USD</option><option>EUR</option></select></label><label className="block"><span className="label">Ngôn ngữ</span><select className="field" value={familyForm.language} onChange={(e) => setFamilyForm({ ...familyForm, language: e.target.value })}><option value="vi">Tiếng Việt</option><option value="en">English</option></select></label></div>
            <button className="primary-button" disabled={saving === 'family'}>{saving === 'family' ? <LoaderCircle className="size-5 animate-spin" /> : <Save className="size-4" />} Lưu thay đổi</button>
          </form>
        </SettingsCard>

        <SettingsCard eyebrow="Chia sẻ" title="Thành viên gia đình" icon={Users}>
          <div className="space-y-3">{familyDetails?.members.map((member) => <div key={member.id} className="flex items-center gap-3 rounded-[20px] border border-ink/[0.06] bg-white/60 p-3"><Avatar user={member} /><div className="min-w-0 flex-1"><div className="truncate text-sm font-extrabold text-ink">{member.displayName} {member.id === user.id && <span className="font-semibold text-ink/35">(bạn)</span>}</div><div className="truncate text-xs text-ink/40">{member.email} · {member.role === 'owner' ? 'Chủ gia đình' : 'Thành viên'}</div></div>{user.role === 'owner' && member.role === 'member' && <button onClick={() => removeMember(member)} className="grid size-10 place-items-center rounded-xl text-ink/35 hover:bg-coral/10 hover:text-coral" aria-label="Xóa thành viên"><UserMinus className="size-4" /></button>}</div>)}</div>
          {familyDetails?.members.length < 2 && <div className="mt-5 rounded-[22px] bg-sun/20 p-4"><div className="text-xs font-extrabold uppercase tracking-[0.12em] text-ink/40">Mã mời người ấy</div><div className="mt-2 flex items-center gap-2"><code className="flex-1 text-xl font-black tracking-[0.16em] text-ink">{familyDetails.inviteCode}</code><button className="grid size-11 place-items-center rounded-xl bg-white text-forest shadow-sm" onClick={() => { navigator.clipboard.writeText(familyDetails.inviteCode); notify('Đã sao chép mã mời.'); }}><Copy className="size-4" /></button>{user.role === 'owner' && <button className="grid size-11 place-items-center rounded-xl bg-white text-forest shadow-sm" onClick={regenerateCode}><RefreshCw className="size-4" /></button>}</div></div>}
        </SettingsCard>

        <SettingsCard eyebrow="Bảo mật" title="Đổi mật khẩu" icon={KeyRound}>
          <form onSubmit={changePassword} className="space-y-5"><label className="block"><span className="label">Mật khẩu hiện tại</span><input className="field" type="password" value={passwords.currentPassword} onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })} required /></label><label className="block"><span className="label">Mật khẩu mới</span><input className="field" type="password" minLength="8" value={passwords.newPassword} onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })} required /></label><button className="secondary-button" disabled={saving === 'password'}>{saving === 'password' ? <LoaderCircle className="size-5 animate-spin" /> : <KeyRound className="size-4" />} Đổi mật khẩu</button></form>
        </SettingsCard>
      </div>

      <section className="rounded-[28px] border border-coral/15 bg-coral/[0.05] p-5 sm:p-7">
        <h2 className="font-editorial text-2xl font-semibold text-ink">Phiên đăng nhập & dữ liệu</h2>
        <p className="mt-2 text-sm leading-6 text-ink/50">Bạn có thể đăng xuất trên thiết bị này hoặc xóa vĩnh viễn tài khoản của mình.</p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row"><button className="secondary-button" onClick={async () => { await logout(); navigate('/login'); }}><LogOut className="size-4" /> Đăng xuất</button><button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 font-bold text-coral transition hover:bg-coral/10" onClick={deleteAccount}><Trash2 className="size-4" /> Xóa tài khoản</button></div>
      </section>
    </div>
  );
}

function SettingsPageSkeleton() {
  return (
    <div aria-label="Đang tải cài đặt" className="space-y-7" role="status">
      <div>
        <Skeleton className="mb-3 h-3 w-44" />
        <Skeleton className="h-12 w-52 rounded-2xl" />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        {Array.from({ length: 4 }, (_, index) => (
          <section key={index} className="rounded-[30px] border border-ink/[0.06] bg-paper/85 p-5 shadow-card sm:p-7">
            <div className="mb-7 flex items-start justify-between">
              <div className="space-y-3"><Skeleton className="h-3 w-20" /><Skeleton className="h-8 w-48" /></div>
              <Skeleton className="size-11 rounded-2xl" />
            </div>
            <div className="space-y-5">
              <Skeleton className="h-20 w-full rounded-[22px]" />
              <div className="space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-12 w-full rounded-2xl" /></div>
              <div className="space-y-2"><Skeleton className="h-3 w-20" /><Skeleton className="h-12 w-full rounded-2xl" /></div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function SettingsCard({ eyebrow, title, icon: Icon, children }) {
  return <section className="rounded-[30px] border border-ink/[0.06] bg-paper/85 p-5 shadow-card sm:p-7"><div className="mb-6 flex items-start justify-between"><div><p className="mb-2 text-xs font-extrabold uppercase tracking-[0.14em] text-ink/35">{eyebrow}</p><h2 className="font-editorial text-3xl font-semibold text-ink">{title}</h2></div><span className="grid size-11 place-items-center rounded-2xl bg-mint text-forest"><Icon className="size-5" /></span></div>{children}</section>;
}

function resizeAvatar(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    image.onload = () => {
      const canvas = document.createElement('canvas');
      const size = 256;
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext('2d');
      const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
      const sourceX = (image.naturalWidth - sourceSize) / 2;
      const sourceY = (image.naturalHeight - sourceSize) / 2;
      context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL('image/webp', 0.82));
    };
    image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Invalid image')); };
    image.src = objectUrl;
  });
}
