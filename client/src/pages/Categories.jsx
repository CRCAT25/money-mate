import { useMemo, useState } from 'react';
import { Edit3, LoaderCircle, Plus, Sparkles, Trash2, X } from 'lucide-react';
import CategoryIcon from '../components/ui/CategoryIcon.jsx';
import ConfirmModal from '../components/ui/ConfirmModal.jsx';
import Modal from '../components/ui/Modal.jsx';
import Skeleton, { CategoryGridSkeleton } from '../components/ui/Skeleton.jsx';
import { useFamilyData } from '../context/FamilyContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import api, { errorMessage } from '../utils/api.js';
import { currentMonth } from '../utils/formatters.js';
import { getDefaultSuggestions } from '../utils/categorySuggestions.js';

const icons = [
  'Utensils', 'Apple', 'Beef', 'Coffee', 'Martini', 'CakeSlice',
  'House', 'ShoppingBag', 'Shirt', 'Store', 'Package', 'Gift',
  'Car', 'Bike', 'BusFront', 'TrainFront', 'Plane', 'Fuel',
  'HeartPulse', 'Hospital', 'Stethoscope', 'Dumbbell', 'Baby', 'PawPrint',
  'GraduationCap', 'BookOpen', 'Laptop', 'BriefcaseBusiness', 'Phone', 'Smartphone',
  'Gamepad2', 'Clapperboard', 'Music2', 'Ticket', 'PartyPopper', 'Sparkles',
  'ReceiptText', 'WalletCards', 'Banknote', 'Coins', 'PiggyBank', 'HandCoins',
  'CircleDollarSign', 'TrendingUp', 'Landmark', 'ShieldCheck', 'Zap', 'Droplets',
  'Wifi', 'Wrench', 'TreePine', 'Cat', 'Palette', 'Shapes',
];
const colors = [
  '#F9735B', '#F07A53', '#E6A15C', '#C6932D', '#B7A83B', '#7FA34A', '#45A878', '#258C68',
  '#3EAA72', '#249272', '#4A8F8B', '#318F8B', '#3B8FA8', '#397DB5', '#5377B8', '#706BC1',
  '#9B78B6', '#B568AA', '#D27B9A', '#CE6B91', '#E56B78', '#D95454', '#A86F5A', '#8C786C',
  '#8E938B', '#7B8794', '#708090', '#667482', '#5E7F75', '#4F7564', '#324F48', '#334155',
];
const blank = { name: '', type: 'expense', icon: 'Shapes', color: '#4A8F8B', subcategories: [] };

export default function Categories() {
  const { categories, reloadBaseData, prefetchPages, loading } = useFamilyData();
  const { notify } = useToast();
  const [tab, setTab] = useState('expense');
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(blank);
  const [tagInput, setTagInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const visible = useMemo(() => categories.filter((item) => item.type === tab), [categories, tab]);

  const defaultPresets = useMemo(() => getDefaultSuggestions(form.name), [form.name]);

  const openCreate = () => {
    setForm({ ...blank, type: tab, subcategories: [] });
    setTagInput('');
    setModal('create');
  };
  const openEdit = (category) => {
    setForm({
      ...category,
      subcategories: Array.isArray(category.subcategories) ? category.subcategories : [],
    });
    setTagInput('');
    setModal(category);
  };

  const addSubTag = (tagToAdd) => {
    const trimmed = (tagToAdd || tagInput).trim().replace(/^[,\s]+|[,\s]+$/g, '');
    if (!trimmed) return;
    if (form.subcategories?.includes(trimmed)) {
      setTagInput('');
      return;
    }
    setForm((current) => ({
      ...current,
      subcategories: [...(current.subcategories || []), trimmed],
    }));
    setTagInput('');
  };

  const removeSubTag = (tagToRemove) => {
    setForm((current) => ({
      ...current,
      subcategories: (current.subcategories || []).filter((tag) => tag !== tagToRemove),
    }));
  };

  const applyDefaultSuggestions = () => {
    if (!defaultPresets.length) return;
    setForm((current) => ({
      ...current,
      subcategories: Array.from(new Set([...(current.subcategories || []), ...defaultPresets])),
    }));
  };

  const handleTagKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addSubTag(tagInput);
    } else if (e.key === 'Backspace' && !tagInput && form.subcategories?.length) {
      removeSubTag(form.subcategories[form.subcategories.length - 1]);
    }
  };

  const submit = async (event) => {
    event.preventDefault(); setSubmitting(true);
    let finalSubcategories = form.subcategories || [];
    if (tagInput.trim()) {
      const extra = tagInput.trim().replace(/^[,\s]+|[,\s]+$/g, '');
      if (extra && !finalSubcategories.includes(extra)) {
        finalSubcategories = [...finalSubcategories, extra];
      }
    }
    try {
      if (modal === 'create') await api.post('/categories', { ...form, subcategories: finalSubcategories });
      else await api.patch(`/categories/${modal.id}`, { name: form.name, icon: form.icon, color: form.color, subcategories: finalSubcategories });
      notify(modal === 'create' ? 'Đã thêm danh mục mới.' : 'Đã cập nhật danh mục.');
      setModal(null); await reloadBaseData(); void prefetchPages(currentMonth());
    } catch (error) { notify(errorMessage(error), 'error'); }
    finally { setSubmitting(false); }
  };
  const remove = async (category) => {
    setDeleting(true);
    try { await api.delete(`/categories/${category.id}`); setDeleteTarget(null); notify('Đã xóa danh mục.'); await reloadBaseData(); void prefetchPages(currentMonth()); }
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
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-sm font-bold text-ink">{category.name}</h2>
              <p className="mt-0.5 text-[11px] font-semibold text-ink/48">
                {category.transactionCount} giao dịch {category.subcategories?.length ? `· ${category.subcategories.length} gợi ý` : ''} {category.isDefault && '· Mặc định'}
              </p>
            </div>
            <div className="flex gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
              <button onClick={() => openEdit(category)} className="grid size-10 place-items-center rounded-xl text-ink/40 hover:bg-mint hover:text-forest" aria-label="Sửa danh mục"><Edit3 className="size-4" /></button>
              <button onClick={() => setDeleteTarget(category)} className="grid size-10 place-items-center rounded-xl text-ink/40 hover:bg-coral/10 hover:text-coral" aria-label="Xóa danh mục"><Trash2 className="size-4" /></button>
            </div>
          </article>
          ))}
        </section>
      )}

      <div className="rounded-[16px] border border-sun/25 bg-sun/10 p-4 text-sm leading-5 text-ink/65"><strong className="text-ink">Lưu ý:</strong> Bạn có thể xóa danh mục bất cứ lúc nào. Các giao dịch cũ vẫn giữ tên danh mục tại thời điểm phát sinh để bảo toàn lịch sử.</div>

      <Modal open={Boolean(modal)} onClose={() => setModal(null)} title={modal === 'create' ? 'Danh mục mới' : 'Chỉnh sửa danh mục'}>
        <form onSubmit={submit} className="space-y-4">
          {modal === 'create' && <div className="grid grid-cols-2 rounded-2xl bg-ink/[0.05] p-1.5">{[['expense', 'Khoản chi'], ['income', 'Khoản thu']].map(([value, label]) => <button type="button" key={value} onClick={() => setForm({ ...form, type: value })} className={`min-h-11 rounded-xl text-sm font-extrabold ${form.type === value ? 'bg-white text-ink shadow-sm' : 'text-ink/40'}`}>{label}</button>)}</div>}
          <label className="block"><span className="label">Tên danh mục</span><input className="field" maxLength="40" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ví dụ: Thú cưng" required /></label>
          <div><span className="label">Biểu tượng</span><div className="grid max-h-48 grid-cols-6 gap-2 overflow-y-auto overscroll-contain rounded-xl pr-1">{icons.map((icon) => <button type="button" key={icon} onClick={() => setForm({ ...form, icon })} className={`grid aspect-square place-items-center rounded-xl border transition active:scale-95 ${form.icon === icon ? 'border-forest bg-mint text-forest' : 'border-ink/[0.07] bg-white text-ink/45 hover:border-ink/15 hover:text-ink/65'}`} aria-label={`Chọn biểu tượng ${icon}`}><CategoryIcon name={icon} className="size-5" /></button>)}</div></div>
          <div><span className="label">Màu sắc</span><div className="grid grid-cols-8 gap-3">{colors.map((color) => <button type="button" key={color} onClick={() => setForm({ ...form, color })} className={`grid aspect-square w-full place-items-center rounded-full transition active:scale-90 ${form.color === color ? 'ring-2 ring-ink ring-offset-2' : ''}`} style={{ backgroundColor: color }} aria-label={`Chọn màu ${color}`}>{form.color === color && <span className="size-2 rounded-full bg-white" />}</button>)}</div></div>
          
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="label !mb-0">Gợi ý ghi chú (sub-menu)</span>
              {defaultPresets.length > 0 && (
                <button
                  type="button"
                  onClick={applyDefaultSuggestions}
                  className="flex items-center gap-1 text-[11px] font-medium text-forest hover:underline"
                >
                  <Sparkles className="size-3" />
                  Áp dụng mẫu ({defaultPresets.length})
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 min-h-[42px] p-2 rounded-xl border border-ink/[0.08] bg-white/70 focus-within:border-forest focus-within:ring-1 focus-within:ring-forest/20">
              {form.subcategories?.map((tag, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-mint/60 text-forest border border-forest/15 shadow-2xs"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeSubTag(tag)}
                    className="text-forest/60 hover:text-coral transition-colors"
                    aria-label={`Xóa ${tag}`}
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder={form.subcategories?.length ? 'Thêm gợi ý...' : 'Nhập gợi ý (Enter hoặc dấu phẩy)...'}
                className="flex-1 min-w-[140px] bg-transparent text-xs text-ink outline-none placeholder:text-ink/30 px-1 py-0.5"
              />
            </div>
            <p className="mt-1 text-[10px] text-ink/40">Gợi ý xuất hiện dưới ô Ghi chú khi chọn danh mục này. Nhấn Enter hoặc phẩy để thêm.</p>
          </div>

          <div className="flex gap-3 pt-2"><button type="button" className="secondary-button flex-1" onClick={() => setModal(null)}>Hủy</button><button className="primary-button flex-1" disabled={submitting}>{submitting ? <LoaderCircle className="size-5 animate-spin" /> : 'Lưu danh mục'}</button></div>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Xóa danh mục?"
        description={deleteTarget ? `Danh mục “${deleteTarget.name}” sẽ bị xóa khỏi danh sách. Các giao dịch cũ vẫn giữ lại tên danh mục này trong lịch sử.` : ''}
        confirmLabel="Xóa danh mục"
        loading={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => remove(deleteTarget)}
      />
    </div>
  );
}
