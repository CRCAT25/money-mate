import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, LoaderCircle, Pencil, Plus, Sparkles, Target, Trash2, WalletCards } from 'lucide-react';
import CategoryIcon from '../components/ui/CategoryIcon.jsx';
import Modal from '../components/ui/Modal.jsx';
import MonthPicker from '../components/ui/MonthPicker.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useFamilyData } from '../context/FamilyContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import api, { errorMessage } from '../utils/api.js';
import { currentMonth, formatMoney } from '../utils/formatters.js';

const emptyPlan = { month: '', planned: 0, spent: 0, remaining: 0, percentage: 0, items: [] };

export default function Plans() {
  const { family } = useAuth();
  const { categories, revision, reloadBaseData, getCache, setCache } = useFamilyData();
  const { notify } = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState(emptyPlan);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ categoryId: '', amount: '' });
  const [submitting, setSubmitting] = useState(false);

  const expenseCategories = useMemo(() => categories.filter((category) => category.type === 'expense'), [categories]);
  const plannedCategoryIds = useMemo(() => new Set(data.items.map((item) => item.category.id)), [data.items]);
  const selectableCategories = modal === 'create'
    ? expenseCategories.filter((category) => !plannedCategoryIds.has(category.id))
    : expenseCategories.filter((category) => category.id === form.categoryId);

  useEffect(() => {
    const cacheKey = `plans:${month}`;
    const cached = getCache(cacheKey);
    if (cached?.revision === revision) {
      setData(cached.data);
      setLoading(false);
      return undefined;
    }

    let active = true;
    setLoading(true);
    api.get('/budgets', { params: { month } })
      .then(({ data: nextData }) => {
        if (!active) return;
        setData(nextData);
        setCache(cacheKey, { data: nextData, revision });
      })
      .catch((error) => active && notify(errorMessage(error), 'error'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [month, revision, notify, getCache, setCache]);

  const refreshPlan = async () => {
    const { data: nextData } = await api.get('/budgets', { params: { month } });
    setData(nextData);
    setCache(`plans:${month}`, { data: nextData, revision });
  };

  const openCreate = () => {
    const firstAvailable = expenseCategories.find((category) => !plannedCategoryIds.has(category.id));
    setForm({ categoryId: firstAvailable?.id || '', amount: '' });
    setModal('create');
  };

  const openEdit = (item) => {
    setForm({ categoryId: item.category.id, amount: String(item.amount) });
    setModal(item);
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!form.categoryId) return notify('Vui lòng chọn một danh mục.', 'error');
    setSubmitting(true);
    try {
      const { data: response } = await api.post('/budgets', {
        month,
        categoryId: form.categoryId,
        amount: Number(form.amount),
      });
      await reloadBaseData();
      await refreshPlan();
      setModal(null);
      notify(response.message);
    } catch (error) {
      notify(errorMessage(error), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Xóa kế hoạch cho ${item.category.name}?`)) return;
    try {
      await api.delete(`/budgets/${item.id}`);
      await reloadBaseData();
      await refreshPlan();
      notify('Đã xóa kế hoạch chi tiêu.');
    } catch (error) {
      notify(errorMessage(error), 'error');
    }
  };

  const canAdd = expenseCategories.some((category) => !plannedCategoryIds.has(category.id));
  const tone = data.percentage > 100 ? 'danger' : data.percentage >= 80 ? 'warning' : 'safe';

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.17em] text-coral">Chủ động trước mỗi khoản chi</p>
          <h1 className="font-editorial text-4xl font-semibold tracking-[-0.03em] text-ink sm:text-5xl">Kế hoạch tháng.</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-ink/52">Cùng đặt giới hạn cho từng danh mục để cả nhà biết tháng này còn có thể chi bao nhiêu.</p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <MonthPicker value={month} onChange={setMonth} compact />
          <button className="primary-button" onClick={openCreate} disabled={!canAdd || loading}><Plus className="size-5" /> Thêm kế hoạch</button>
        </div>
      </div>

      {loading ? <PlanPageSkeleton /> : (
        <>
          <section className="relative overflow-hidden rounded-[30px] bg-ink p-5 text-white shadow-soft sm:p-7">
            <div className="absolute -right-16 -top-20 size-64 rounded-full bg-forest/70 blur-3xl" />
            <div className="absolute -bottom-24 left-1/3 size-56 rounded-full bg-sun/15 blur-3xl" />
            <div className="relative grid gap-7 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.14em] text-white/48"><Sparkles className="size-4 text-sun" /> Ngân sách cả tháng</div>
                <div className="mt-3 font-editorial text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">{formatMoney(data.planned, family.currency)}</div>
                <div className="mt-6 grid grid-cols-2 gap-3 sm:max-w-xl sm:grid-cols-3">
                  <PlanMetric label="Đã chi" value={data.spent} currency={family.currency} />
                  <PlanMetric label={data.remaining >= 0 ? 'Còn lại' : 'Vượt mức'} value={Math.abs(data.remaining)} currency={family.currency} tone={data.remaining < 0 ? 'danger' : 'sun'} />
                  <PlanMetric className="col-span-2 sm:col-span-1" label="Danh mục" value={`${data.items.length} kế hoạch`} />
                </div>
              </div>
              <ProgressRing percentage={data.percentage} tone={tone} />
            </div>
          </section>

          {data.items.length ? (
            <section>
              <div className="mb-4 flex items-end justify-between gap-4">
                <div><p className="mb-2 text-xs font-extrabold uppercase tracking-[0.15em] text-ink/35">Giới hạn từng khoản</p><h2 className="section-title">Kế hoạch chi tiết</h2></div>
                {data.percentage > 100 && <span className="hidden items-center gap-2 rounded-full bg-coral/10 px-3 py-2 text-xs font-extrabold text-coral sm:flex"><AlertTriangle className="size-4" /> Đã vượt tổng ngân sách</span>}
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                {data.items.map((item, index) => <BudgetCard key={item.id} item={item} currency={family.currency} index={index} onEdit={openEdit} onDelete={remove} />)}
              </div>
            </section>
          ) : (
            <section className="rounded-[30px] border border-dashed border-ink/15 bg-white/50 px-6 py-12 text-center">
              <span className="mx-auto grid size-16 place-items-center rounded-[22px] bg-sun/25 text-[#9a6b0a]"><Target className="size-7" /></span>
              <h2 className="mt-5 font-editorial text-3xl font-semibold text-ink">Tháng này chưa có kế hoạch.</h2>
              <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-ink/50">Bắt đầu từ một danh mục thường chi nhiều nhất. Bạn có thể bổ sung hoặc điều chỉnh bất cứ lúc nào.</p>
              <button className="primary-button mt-6" onClick={openCreate}><Plus className="size-5" /> Tạo kế hoạch đầu tiên</button>
            </section>
          )}
        </>
      )}

      <Modal open={Boolean(modal)} onClose={() => setModal(null)} title={modal === 'create' ? 'Kế hoạch mới' : 'Điều chỉnh kế hoạch'}>
        <form onSubmit={submit} className="space-y-5">
          <label className="block"><span className="label">Danh mục chi</span><select className="field" value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })} disabled={modal !== 'create'} required><option value="">Chọn danh mục</option>{selectableCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label className="block"><span className="label">Ngân sách dự kiến</span><span className="relative block"><input className="field h-16 pr-20 text-2xl font-extrabold" type="number" inputMode="numeric" min="1" max="999999999999" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="0" required /><span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-extrabold text-ink/35">{family.currency}</span></span>{Number(form.amount) > 0 && <span className="mt-2 block text-right text-xs font-bold text-ink/40">{formatMoney(form.amount, family.currency)}</span>}</label>
          <div className="rounded-2xl bg-mint/60 p-4 text-sm leading-6 text-ink/55"><strong className="text-forest">Dùng chung cho cả nhà:</strong> thành viên còn lại sẽ thấy kế hoạch mới trong lần thao tác tiếp theo.</div>
          <div className="flex gap-3 pt-1"><button type="button" className="secondary-button flex-1" onClick={() => setModal(null)}>Hủy</button><button className="primary-button flex-1" disabled={submitting}>{submitting ? <LoaderCircle className="size-5 animate-spin" /> : 'Lưu kế hoạch'}</button></div>
        </form>
      </Modal>
    </div>
  );
}

function PlanMetric({ label, value, currency, tone = 'default', className = '' }) {
  const color = tone === 'danger' ? 'text-coral' : tone === 'sun' ? 'text-sun' : 'text-white';
  return <div className={`rounded-2xl border border-white/10 bg-white/[0.06] p-3 ${className}`}><div className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-white/38">{label}</div><div className={`mt-1 truncate text-sm font-extrabold ${color}`}>{currency ? formatMoney(value, currency) : value}</div></div>;
}

function ProgressRing({ percentage, tone }) {
  const progress = Math.min(percentage, 100);
  const color = tone === 'danger' ? '#F2735B' : tone === 'warning' ? '#F3C96B' : '#79C7A4';
  return (
    <div className="mx-auto grid size-36 place-items-center rounded-full p-2 lg:mx-0" style={{ background: `conic-gradient(${color} ${progress}%, rgba(255,255,255,.1) 0)` }}>
      <div className="grid size-full place-items-center rounded-full bg-ink text-center"><div><div className="font-editorial text-3xl font-semibold">{percentage}%</div><div className="mt-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-white/40">đã sử dụng</div></div></div>
    </div>
  );
}

function BudgetCard({ item, currency, index, onEdit, onDelete }) {
  const over = item.remaining < 0;
  const progress = Math.min(item.percentage, 100);
  return (
    <article className="animate-rise-in rounded-[26px] border border-ink/[0.06] bg-paper/85 p-4 shadow-sm sm:p-5" style={{ animationDelay: `${Math.min(index * 45, 270)}ms` }}>
      <div className="flex items-start gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-[16px]" style={{ color: item.category.color, backgroundColor: `${item.category.color}1F` }}><CategoryIcon name={item.category.icon} className="size-5" /></span>
        <div className="min-w-0 flex-1"><h3 className="truncate font-extrabold text-ink">{item.category.name}</h3><p className="mt-1 text-xs font-semibold text-ink/42">Đã chi {formatMoney(item.spent, currency)} / {formatMoney(item.amount, currency)}</p></div>
        <div className="flex gap-1"><button className="grid size-9 place-items-center rounded-xl text-ink/38 transition hover:bg-mint hover:text-forest" onClick={() => onEdit(item)} aria-label={`Sửa kế hoạch ${item.category.name}`}><Pencil className="size-4" /></button><button className="grid size-9 place-items-center rounded-xl text-ink/38 transition hover:bg-coral/10 hover:text-coral" onClick={() => onDelete(item)} aria-label={`Xóa kế hoạch ${item.category.name}`}><Trash2 className="size-4" /></button></div>
      </div>
      <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-ink/[0.06]"><div className={`h-full rounded-full transition-all duration-700 ${over ? 'bg-coral' : 'bg-forest'}`} style={{ width: `${progress}%` }} /></div>
      <div className="mt-3 flex items-center justify-between text-xs font-bold"><span className="text-ink/38">{item.percentage}% ngân sách</span><span className={over ? 'text-coral' : 'text-forest'}>{over ? `Vượt ${formatMoney(Math.abs(item.remaining), currency)}` : `Còn ${formatMoney(item.remaining, currency)}`}</span></div>
    </article>
  );
}

function PlanPageSkeleton() {
  return (
    <div className="space-y-7" aria-label="Đang tải kế hoạch" role="status">
      <Skeleton className="h-64 rounded-[30px] bg-ink/10" />
      <div className="space-y-4"><Skeleton className="h-8 w-52" /><div className="grid gap-4 xl:grid-cols-2">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-40 rounded-[26px]" />)}</div></div>
    </div>
  );
}
