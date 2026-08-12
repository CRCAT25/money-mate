import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Copy, Grid2X2, ImagePlus, KeyRound, LoaderCircle, LogOut, RefreshCw, Save, Shield, Trash2, UserMinus, UserPlus, Users, X } from 'lucide-react';
import Avatar from '../components/ui/Avatar.jsx';
import ConfirmModal from '../components/ui/ConfirmModal.jsx';
import Modal from '../components/ui/Modal.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useFamilyData } from '../context/FamilyContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import api, { errorMessage } from '../utils/api.js';
import { spaceStorage } from '../utils/storage.js';

export default function Settings() {
  const { user, family: activeSpace, spaces, logout, refreshProfile, selectSpace } = useAuth();
  const { familyDetails, reloadBaseData, loading, isPersonal } = useFamilyData();
  const { notify } = useToast();
  const navigate = useNavigate();
  const [profile, setProfile] = useState({ displayName: user.displayName, email: user.email, avatarUrl: user.avatarUrl || '' });
  const [spaceForm, setSpaceForm] = useState({ name: '', currency: 'VND', language: 'vi' });
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' });
  const [familySetup, setFamilySetup] = useState({ mode: 'create', name: '', inviteCode: '' });
  const [saving, setSaving] = useState('');
  const [verificationUrl, setVerificationUrl] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const [familySetupOpen, setFamilySetupOpen] = useState(false);
  const avatarInput = useRef(null);
  const familySpace = spaces.find((space) => space.type === 'family');

  useEffect(() => {
    if (familyDetails) setSpaceForm({ name: familyDetails.name, currency: familyDetails.currency, language: familyDetails.language });
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
    try { const avatarUrl = await resizeAvatar(file); setProfile((current) => ({ ...current, avatarUrl })); }
    catch { notify('Không thể đọc ảnh này. Hãy thử một ảnh khác.', 'error'); }
  };
  const saveSpace = async (event) => {
    event.preventDefault(); setSaving('space');
    try { const { data } = await api.patch(`/spaces/${activeSpace.id}`, spaceForm); notify(data.message); await Promise.all([refreshProfile(), reloadBaseData()]); }
    catch (error) { notify(errorMessage(error), 'error'); }
    finally { setSaving(''); }
  };
  const changePassword = async (event) => {
    event.preventDefault(); setSaving('password');
    try { const { data } = await api.patch('/users/me/password', passwords); notify(data.message); await logout(); navigate('/login'); }
    catch (error) { notify(errorMessage(error), 'error'); }
    finally { setSaving(''); }
  };
  const setupFamily = async (event) => {
    event.preventDefault(); setSaving('family-setup');
    try {
      const { data } = familySetup.mode === 'create'
        ? await api.post('/spaces/family', { name: familySetup.name, currency: spaceForm.currency, language: spaceForm.language })
        : await api.post('/spaces/family/join', { inviteCode: familySetup.inviteCode });
      spaceStorage.set(user.id, data.space.id);
      setFamilySetupOpen(false);
      notify(data.message);
      await refreshProfile();
    } catch (error) { notify(errorMessage(error), 'error'); }
    finally { setSaving(''); }
  };
  const regenerateCode = async () => {
    try { const { data } = await api.post('/family/invite-code'); notify(data.message); await reloadBaseData(); }
    catch (error) { notify(errorMessage(error), 'error'); }
  };
  const removeMember = async (member) => {
    setSaving('family-action');
    try { await api.delete(`/family/members/${member.id}`); setConfirmation(null); notify('Đã xóa thành viên.'); await reloadBaseData(); }
    catch (error) { notify(errorMessage(error), 'error'); }
    finally { setSaving(''); }
  };
  const transferOwner = async (member) => {
    setSaving('family-action');
    try { const { data } = await api.post('/spaces/family/transfer-owner', { memberId: member.id }); setConfirmation(null); notify(data.message); await Promise.all([refreshProfile(), reloadBaseData()]); }
    catch (error) { notify(errorMessage(error), 'error'); }
    finally { setSaving(''); }
  };
  const leaveFamily = async () => {
    setSaving('family-action');
    try { await api.post('/spaces/family/leave'); setConfirmation(null); spaceStorage.set(user.id, spaces.find((space) => space.type === 'personal').id); await refreshProfile(); notify('Đã rời khỏi gia đình.'); }
    catch (error) { notify(errorMessage(error), 'error'); }
    finally { setSaving(''); }
  };
  const dissolveFamily = async () => {
    setSaving('family-action');
    try { await api.delete('/spaces/family'); setConfirmation(null); spaceStorage.set(user.id, spaces.find((space) => space.type === 'personal').id); await refreshProfile(); notify('Đã giải tán không gian gia đình.'); }
    catch (error) { notify(errorMessage(error), 'error'); }
    finally { setSaving(''); }
  };
  const deleteAccount = async () => {
    setSaving('delete-account');
    try { await api.delete('/users/me'); setConfirmation(null); await logout(); navigate('/signup'); }
    catch (error) { notify(errorMessage(error), 'error'); }
    finally { setSaving(''); }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-3 pr-28 sm:flex-row sm:items-end sm:justify-between sm:pr-0"><div><p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-coral">{isPersonal ? 'Không gian riêng của bạn' : 'Không gian của nhà mình'}</p><h1 className="font-editorial text-[28px] font-semibold tracking-[-0.03em] text-ink sm:text-4xl">Cài đặt</h1></div><Link to="/categories" className="secondary-button"><Grid2X2 className="size-4" /> Quản lý danh mục</Link></div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SettingsCard eyebrow="Cá nhân" title="Hồ sơ của bạn" icon={Shield}>
          <form onSubmit={saveProfile} className="space-y-5">
            <div className="flex items-center gap-3 rounded-[16px] bg-mint/45 p-3"><Avatar user={{ ...user, ...profile }} size="lg" /><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-ink">{profile.displayName || user.displayName}</div><div className="mt-0.5 truncate text-xs text-ink/55">{profile.email}</div><div className="mt-2 flex flex-wrap gap-2"><button type="button" className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-white px-3 text-xs font-medium text-forest shadow-sm" onClick={() => avatarInput.current?.click()}><ImagePlus className="size-4" /> Chọn ảnh</button>{profile.avatarUrl && <button type="button" className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-medium text-coral" onClick={() => setProfile({ ...profile, avatarUrl: '' })}><X className="size-4" /> Gỡ ảnh</button>}</div><input ref={avatarInput} className="hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={chooseAvatar} /></div></div>
            <label className="block"><span className="label">Tên hiển thị</span><input className="field" value={profile.displayName} onChange={(e) => setProfile({ ...profile, displayName: e.target.value })} required /></label>
            <label className="block"><span className="label">Email</span><input className="field" type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} required /></label>
            {verificationUrl && <a className="flex min-h-12 items-center justify-center rounded-xl bg-sun/25 px-4 text-sm font-medium text-ink" href={verificationUrl}>Xác nhận email mới</a>}
            <button className="primary-button" disabled={saving === 'profile'}>{saving === 'profile' ? <LoaderCircle className="size-5 animate-spin" /> : <Save className="size-4" />} Lưu hồ sơ</button>
          </form>
        </SettingsCard>

        <SettingsCard eyebrow={isPersonal ? 'Sổ cá nhân' : 'Gia đình'} title="Thiết lập chung" icon={Users}>
          <form onSubmit={saveSpace} className="space-y-5">
            {!isPersonal && <label className="block"><span className="label">Tên gia đình</span><input className="field" value={spaceForm.name} onChange={(e) => setSpaceForm({ ...spaceForm, name: e.target.value })} required /></label>}
            <div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="label">Loại tiền</span><select className="field" value={spaceForm.currency} onChange={(e) => setSpaceForm({ ...spaceForm, currency: e.target.value })}><option>VND</option><option>USD</option><option>EUR</option></select></label><label className="block"><span className="label">Ngôn ngữ</span><select className="field" value={spaceForm.language} onChange={(e) => setSpaceForm({ ...spaceForm, language: e.target.value })}><option value="vi">Tiếng Việt</option><option value="en">English</option></select></label></div>
            <button className="primary-button" disabled={saving === 'space'}>{saving === 'space' ? <LoaderCircle className="size-5 animate-spin" /> : <Save className="size-4" />} Lưu thay đổi</button>
          </form>
        </SettingsCard>

        {isPersonal ? (
          <SettingsCard eyebrow="Kết nối" title="Không gian gia đình" icon={Users}>
            {familySpace ? <div className="rounded-[15px] bg-mint/45 p-3.5"><p className="text-sm font-medium text-ink">{familySpace.name}</p><p className="mt-1 text-xs leading-5 text-ink/48">Bạn đang kết nối với một gia đình. Thông tin và dữ liệu gia đình chỉ hiển thị khi chuyển sang không gian đó.</p><button className="secondary-button mt-4" onClick={() => selectSpace(familySpace.id)}>Chuyển sang Gia đình</button></div> : <div><p className="text-sm leading-6 text-ink/50">Tạo một không gian mới hoặc dùng mã mời để theo dõi tài chính chung cùng người thân.</p><button className="primary-button mt-4" onClick={() => setFamilySetupOpen(true)}><UserPlus className="size-4" /> Kết nối gia đình</button></div>}
          </SettingsCard>
        ) : (
          <SettingsCard eyebrow="Chia sẻ" title="Thành viên gia đình" icon={Users}>
            <div className="space-y-2.5">{familyDetails?.members.map((member) => <div key={member.id} className="flex items-center gap-3 rounded-[14px] border border-ink/[0.06] bg-white/60 p-3"><Avatar user={member} /><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium text-ink">{member.displayName} {member.id === user.id && <span className="text-ink/40">(bạn)</span>}</div><div className="truncate text-xs text-ink/48">{member.email} · {member.role === 'owner' ? 'Chủ gia đình' : 'Thành viên'}</div></div>{familyDetails.role === 'owner' && member.role === 'member' && <div className="flex"><button type="button" onClick={() => setConfirmation({ type: 'transfer', member })} className="grid size-9 place-items-center rounded-lg text-forest hover:bg-mint" aria-label="Chuyển quyền chủ"><Users className="size-4" /></button><button type="button" onClick={() => setConfirmation({ type: 'member', member })} className="grid size-9 place-items-center rounded-lg text-ink/40 hover:bg-coral/10 hover:text-coral" aria-label="Xóa thành viên"><UserMinus className="size-4" /></button></div>}</div>)}</div>
            <div className="mt-4 rounded-[16px] bg-sun/20 p-3.5"><div className="text-[10px] font-medium uppercase tracking-[0.12em] text-ink/40">Mã mời thành viên</div><div className="mt-2 flex items-center gap-2"><code className="min-w-0 flex-1 text-lg font-medium tracking-[0.14em] text-ink">{familyDetails.inviteCode}</code><button className="grid size-10 place-items-center rounded-xl bg-white text-forest shadow-sm" onClick={() => { navigator.clipboard.writeText(familyDetails.inviteCode); notify('Đã sao chép mã mời.'); }}><Copy className="size-4" /></button>{familyDetails.role === 'owner' && <button className="grid size-10 place-items-center rounded-xl bg-white text-forest shadow-sm" onClick={regenerateCode}><RefreshCw className="size-4" /></button>}</div></div>
            <button className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl px-3 text-xs font-medium text-coral hover:bg-coral/10" onClick={() => setConfirmation({ type: familyDetails.role === 'owner' ? 'dissolve' : 'leave' })}>{familyDetails.role === 'owner' ? <Trash2 className="size-4" /> : <LogOut className="size-4" />}{familyDetails.role === 'owner' ? 'Giải tán gia đình' : 'Rời gia đình'}</button>
          </SettingsCard>
        )}

        <SettingsCard eyebrow="Bảo mật" title="Đổi mật khẩu" icon={KeyRound}>
          <form onSubmit={changePassword} className="space-y-5"><label className="block"><span className="label">Mật khẩu hiện tại</span><input className="field" type="password" value={passwords.currentPassword} onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })} required /></label><label className="block"><span className="label">Mật khẩu mới</span><input className="field" type="password" minLength="8" value={passwords.newPassword} onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })} required /></label><button className="secondary-button" disabled={saving === 'password'}>{saving === 'password' ? <LoaderCircle className="size-5 animate-spin" /> : <KeyRound className="size-4" />} Đổi mật khẩu</button></form>
        </SettingsCard>
      </div>

      <section className="rounded-[18px] border border-coral/15 bg-coral/[0.04] p-4 sm:p-5"><h2 className="font-editorial text-xl font-semibold text-ink">Phiên đăng nhập & dữ liệu</h2><p className="mt-2 text-sm leading-6 text-ink/50">Đăng xuất trên thiết bị này hoặc xóa vĩnh viễn tài khoản cùng toàn bộ sổ Cá nhân.</p><div className="mt-5 flex flex-col gap-3 sm:flex-row"><button className="secondary-button" onClick={async () => { await logout(); navigate('/login'); }}><LogOut className="size-4" /> Đăng xuất</button><button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-medium text-coral transition hover:bg-coral/10" onClick={() => setConfirmation({ type: 'account' })}><Trash2 className="size-4" /> Xóa tài khoản</button></div></section>

      <Modal open={familySetupOpen} title="Kết nối gia đình" onClose={() => setFamilySetupOpen(false)} compact><form onSubmit={setupFamily} className="space-y-4"><div className="grid grid-cols-2 rounded-xl bg-ink/[0.05] p-1"><button type="button" className={`min-h-10 rounded-lg text-xs font-medium ${familySetup.mode === 'create' ? 'bg-white text-ink shadow-sm' : 'text-ink/45'}`} onClick={() => setFamilySetup({ ...familySetup, mode: 'create' })}>Tạo gia đình</button><button type="button" className={`min-h-10 rounded-lg text-xs font-medium ${familySetup.mode === 'join' ? 'bg-white text-ink shadow-sm' : 'text-ink/45'}`} onClick={() => setFamilySetup({ ...familySetup, mode: 'join' })}>Dùng mã mời</button></div>{familySetup.mode === 'create' ? <label className="block"><span className="label">Tên gia đình</span><input className="field" value={familySetup.name} onChange={(e) => setFamilySetup({ ...familySetup, name: e.target.value })} required /></label> : <label className="block"><span className="label">Mã mời</span><input className="field uppercase tracking-[0.16em]" value={familySetup.inviteCode} onChange={(e) => setFamilySetup({ ...familySetup, inviteCode: e.target.value })} required /></label>}<button className="primary-button w-full" disabled={saving === 'family-setup'}>{saving === 'family-setup' && <LoaderCircle className="size-4 animate-spin" />}{familySetup.mode === 'create' ? 'Tạo không gian' : 'Tham gia gia đình'}</button></form></Modal>

      <ConfirmModal open={Boolean(confirmation)} title={confirmationTitle(confirmation)} description={confirmationDescription(confirmation, familyDetails)} confirmLabel={confirmationLabel(confirmation)} loading={saving === 'family-action' || saving === 'delete-account'} tone={confirmation?.type === 'transfer' ? 'warning' : 'danger'} onClose={() => setConfirmation(null)} onConfirm={() => { if (confirmation?.type === 'member') return removeMember(confirmation.member); if (confirmation?.type === 'transfer') return transferOwner(confirmation.member); if (confirmation?.type === 'leave') return leaveFamily(); if (confirmation?.type === 'dissolve') return dissolveFamily(); return deleteAccount(); }} />
    </div>
  );
}

function confirmationTitle(item) { if (item?.type === 'member') return 'Xóa thành viên?'; if (item?.type === 'transfer') return 'Chuyển quyền chủ?'; if (item?.type === 'leave') return 'Rời gia đình?'; if (item?.type === 'dissolve') return 'Giải tán gia đình?'; return 'Xóa tài khoản?'; }
function confirmationLabel(item) { if (item?.type === 'member') return 'Xóa thành viên'; if (item?.type === 'transfer') return 'Chuyển quyền'; if (item?.type === 'leave') return 'Rời gia đình'; if (item?.type === 'dissolve') return 'Giải tán'; return 'Xóa tài khoản'; }
function confirmationDescription(item, details) { if (item?.type === 'member') return `${item.member.displayName} sẽ bị xóa khỏi gia đình. Giao dịch cũ vẫn được giữ.`; if (item?.type === 'transfer') return `${item.member.displayName} sẽ trở thành chủ gia đình mới. Sau đó bạn có thể tự rời gia đình.`; if (item?.type === 'leave') return 'Bạn sẽ mất quyền truy cập dữ liệu gia đình nhưng sổ Cá nhân vẫn được giữ nguyên.'; if (item?.type === 'dissolve') return Number(details?.members?.length) > 1 ? 'Gia đình vẫn còn thành viên. Hãy chuyển quyền chủ thay vì giải tán.' : 'Toàn bộ dữ liệu gia đình sẽ bị xóa vĩnh viễn. Sổ Cá nhân của bạn không bị ảnh hưởng.'; return 'Tài khoản và toàn bộ dữ liệu Cá nhân của bạn sẽ bị xóa vĩnh viễn.'; }

function SettingsPageSkeleton() { return <div aria-label="Đang tải cài đặt" className="space-y-5" role="status"><Skeleton className="h-10 w-52 rounded-xl" /><div className="grid gap-4 xl:grid-cols-2">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-72 rounded-[18px]" />)}</div></div>; }
function SettingsCard({ eyebrow, title, icon: Icon, children }) { return <section className="rounded-[18px] border border-ink/[0.06] bg-paper/85 p-4 shadow-card sm:p-5"><div className="mb-5 flex items-start justify-between"><div><p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.13em] text-ink/48">{eyebrow}</p><h2 className="font-editorial text-[21px] font-semibold text-ink">{title}</h2></div><span className="grid size-10 place-items-center rounded-xl bg-mint text-forest"><Icon className="size-[18px]" /></span></div>{children}</section>; }
function resizeAvatar(file) { return new Promise((resolve, reject) => { const image = new Image(); const objectUrl = URL.createObjectURL(file); image.onload = () => { const canvas = document.createElement('canvas'); const size = 256; canvas.width = size; canvas.height = size; const context = canvas.getContext('2d'); const sourceSize = Math.min(image.naturalWidth, image.naturalHeight); context.drawImage(image, (image.naturalWidth - sourceSize) / 2, (image.naturalHeight - sourceSize) / 2, sourceSize, sourceSize, 0, 0, size, size); URL.revokeObjectURL(objectUrl); resolve(canvas.toDataURL('image/webp', 0.82)); }; image.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error('Invalid image')); }; image.src = objectUrl; }); }
