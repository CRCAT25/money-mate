import { useMemo, useState } from 'react';
import { Edit3, LoaderCircle, Plus, Trash2 } from 'lucide-react';
import CategoryIcon from '../components/ui/CategoryIcon.jsx';
import ConfirmModal from '../components/ui/ConfirmModal.jsx';
import Modal from '../components/ui/Modal.jsx';
import Skeleton, { CategoryGridSkeleton } from '../components/ui/Skeleton.jsx';
import { useFamilyData } from '../context/FamilyContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import api, { errorMessage } from '../utils/api.js';

const icons = ['Utensils', 'House', 'Car', 'HeartPulse', 'GraduationCap', 'Gamepad2', 'ShoppingBag', 'ReceiptText', 'PiggyBank', 'Shapes', 'WalletCards', 'Gift', 'TrendingUp', 'Sparkles', 'Coffee', 'Plane', 'Baby', 'PawPrint'];
const colors = ['#F9735B', '#E6A15C', '#4A8F8B', '#E56B78', '#5377B8', '#9B78B6', '#D27B9A', '#708090', '#45A878', '#8E938B', '#258C68', '#C6932D'];
const blank = { name: '', type: 'expense', icon: 'Shapes', color: '#4A8F8B' };

export default function Categories() {
  const { categories, reloadBaseData, loading } = useFamilyData();
  const { notify } = useToast();
  const [tab, setTab] = useState('expense');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(blank);
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const visible = useMemo(() => categories.filter((item) => item.type === tab), [categories, tab]);

  const openCreate = () => { setForm({ ...blank, type: tab }); setModal('create'); };
  const openEdit = (category) => { setForm(category); setModal(category); };
  const submit = async (event) => {
    event.preventDefault(); setSubmitting(true);
    try {
      if (modal === 'create') await api.post('/categories', form);
      else await api.patch(`/categories/${modal.id}`, { name: form.name, icon: form.icon, color: form.color });
      notify(modal === 'create' ? 'Đã thêm danh mục mới.' : 'Đã cập nhật danh mục.');
      setModal(null); await reloadBaseData();
    } catch (error) { notify(errorMessage(error), 'error'); }
    finally { setSubmitting(false); }
  };
  const remove = async (category) => {
    setDeleting(true);
    try { await api.delete(`/categories/${category.id}`); setDeleteTarget(null); notify('Đã xóa danh mục.'); await reloadBaseData(); }
    catch (error) { notify(errorMessage(error), 'error'); }
    finally { setDeleting(false); }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="mb-1.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-coral">Gọn gàng theo cách của bạn</p><h1 className="font-editorial text-[28px] font-semibold tracking-[-0.03em] text-ink sm:text-4xl">Danh mục chung.</h1><p className="mt-2 max-w-xl text-sm leading-5 text-ink/58">Mọi thành viên cùng dùng một bộ danh mục để báo cáo luôn rõ ràng và nhất quán.</p></div>
        <button className="primary-button" onClick={openCreate}><Plus className="size-5" /> Thêm danh mục</button>
      </div>

      <div className="inline-grid grid-cols-2 rounded-xl border border-ink/[0.06] bg-white/60 p-1 shadow-sm">
        {[['expense', 'Khoản chi', categories.filter((c) => c.type === 'expense').length], ['income', 'Khoản thu', categories.filter((c) => c.type === 'income').length]].map(([value, label, count]) => <button type="button" key={value} onClick={() => setTab(value)} className={`min-h-10 rounded-lg px-4 text-xs font-bold transition active:scale-[0.98] ${tab === value ? 'bg-ink text-white shadow-sm' : 'text-ink/50'}`}>{label} <span className="ml-1 inline-flex min-w-4 justify-center opacity-50">{loading ? <Skeleton className="inline-block h-3 w-4 bg-current/20" /> : count}</span></button>)}
      </div>

      {loading ? <CategoryGridSkeleton /> : (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((category, index) => (
          <article key={category.id} className="group flex animate-rise-in items-center gap-3 rounded-[16px] border border-ink/[0.06] bg-paper/80 p-3 shadow-sm transition active:scale-[0.99] hover:bg-white hover:shadow-card" style={{ animationDelay: `${Math.min(index * 30, 240)}ms` }}>
            <span className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ backgroundColor: `${category.color}1F`, color: category.color }}><CategoryIcon name={category.icon} className="size-5" /></span>
            <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-bold text-ink">{category.name}</h2><p className="mt-0.5 text-[11px] font-semibold text-ink/48">{category.transactionCount} giao dịch {category.isDefault && '· Mặc định'}</p></div>
            <div className="flex gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
              <button onClick={() => openEdit(category)} className="grid size-10 place-items-center rounded-xl text-ink/40 hover:bg-mint hover:text-forest" aria-label="Sửa danh mục"><Edit3 className="size-4" /></button>
              <button onClick={() => setDeleteTarget(category)} className="grid size-10 place-items-center rounded-xl text-ink/40 hover:bg-coral/10 hover:text-coral" aria-label="Xóa danh mục"><Trash2 className="size-4" /></button>
            </div>
          </article>
          ))}
        </section>
      )}

      <div className="rounded-[16px] border border-sun/25 bg-sun/10 p-4 text-sm leading-5 text-ink/65"><strong className="text-ink">Lưu ý:</strong> Danh mục đã có giao dịch sẽ không thể xóa để bảo toàn lịch sử. Bạn vẫn có thể đổi tên, màu và biểu tượng.</div>

      <Modal open={Boolean(modal)} onClose={() => setModal(null)} title={modal === 'create' ? 'Danh mục mới' : 'Chỉnh sửa danh mục'}>
        <form onSubmit={submit} className="space-y-5">
          {modal === 'create' && <div className="grid grid-cols-2 rounded-2xl bg-ink/[0.05] p-1.5">{[['expense', 'Khoản chi'], ['income', 'Khoản thu']].map(([value, label]) => <button type="button" key={value} onClick={() => setForm({ ...form, type: value })} className={`min-h-11 rounded-xl text-sm font-extrabold ${form.type === value ? 'bg-white text-ink shadow-sm' : 'text-ink/40'}`}>{label}</button>)}</div>}
          <label className="block"><span className="label">Tên danh mục</span><input className="field" maxLength="40" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ví dụ: Thú cưng" required /></label>
          <div><span className="label">Biểu tượng</span><div className="grid grid-cols-6 gap-2">{icons.map((icon) => <button type="button" key={icon} onClick={() => setForm({ ...form, icon })} className={`grid aspect-square place-items-center rounded-xl border ${form.icon === icon ? 'border-forest bg-mint text-forest' : 'border-ink/[0.07] bg-white text-ink/45'}`}><CategoryIcon name={icon} className="size-5" /></button>)}</div></div>
          <div><span className="label">Màu sắc</span><div className="flex flex-wrap gap-3">{colors.map((color) => <button type="button" key={color} onClick={() => setForm({ ...form, color })} className={`grid size-9 place-items-center rounded-full transition ${form.color === color ? 'ring-2 ring-ink ring-offset-2' : ''}`} style={{ backgroundColor: color }}>{form.color === color && <span className="size-2 rounded-full bg-white" />}</button>)}</div></div>
          <div className="flex gap-3 pt-2"><button type="button" className="secondary-button flex-1" onClick={() => setModal(null)}>Hủy</button><button className="primary-button flex-1" disabled={submitting}>{submitting ? <LoaderCircle className="size-5 animate-spin" /> : 'Lưu danh mục'}</button></div>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Xóa danh mục?"
        description={deleteTarget ? `Danh mục “${deleteTarget.name}” sẽ bị xóa. Danh mục đã có giao dịch sẽ được hệ thống bảo vệ và không thể xóa.` : ''}
        confirmLabel="Xóa danh mục"
        loading={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => remove(deleteTarget)}
      />
    </div>
  );
}
