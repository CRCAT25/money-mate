import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, CalendarDays, Check, LoaderCircle, Sparkles } from 'lucide-react';
import CategoryIcon from '../components/ui/CategoryIcon.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useFamilyData } from '../context/FamilyContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import api, { errorMessage } from '../utils/api.js';
import { formatMoney } from '../utils/formatters.js';

const localToday = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export default function TransactionForm() {
  const { id: transactionId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, family } = useAuth();
  const { categories, familyDetails, touch, loading: baseLoading } = useFamilyData();
  const { notify } = useToast();
  const [form, setForm] = useState({
    type: params.get('type') === 'income' ? 'income' : 'expense',
    amount: '', categoryId: '', transactionDate: localToday(), note: '', assignedTo: user.id,
  });
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(Boolean(transactionId));

  const filteredCategories = useMemo(() => categories.filter((item) => item.type === form.type), [categories, form.type]);
  const selectedCategory = categories.find((item) => item.id === form.categoryId);

  useEffect(() => {
    if (!transactionId) return;
    api.get(`/transactions/${transactionId}`).then(({ data }) => {
      setForm({ type: data.type, amount: String(data.amount), categoryId: data.category.id, transactionDate: data.transactionDate, note: data.note || '', assignedTo: data.assignedTo.id });
    }).catch((error) => { notify(errorMessage(error), 'error'); navigate('/'); }).finally(() => setLoading(false));
  }, [transactionId, navigate, notify]);

  useEffect(() => {
    if (form.categoryId && !filteredCategories.some((item) => item.id === form.categoryId)) {
      setForm((current) => ({ ...current, categoryId: '' }));
    }
  }, [form.categoryId, filteredCategories]);

  const changeType = (type) => setForm({ ...form, type, categoryId: '' });
  const submit = async (event) => {
    event.preventDefault();
    if (!form.categoryId) return notify('Vui lòng chọn một danh mục.', 'error');
    setSubmitting(true);
    try {
      const payload = { ...form, amount: Number(form.amount) };
      const { data } = transactionId ? await api.patch(`/transactions/${transactionId}`, payload) : await api.post('/transactions', payload);
      notify(data.message);
      touch();
      navigate('/');
    } catch (error) {
      notify(errorMessage(error), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || baseLoading) return <TransactionFormSkeleton />;

  return (
    <div className="mx-auto max-w-4xl">
      <button onClick={() => navigate(-1)} className="mb-6 flex min-h-11 items-center gap-2 text-sm font-extrabold text-ink/55"><ArrowLeft className="size-4" /> Quay lại</button>
      <div className="grid gap-7 lg:grid-cols-[1fr_300px]">
        <section className="rounded-[32px] border border-ink/[0.06] bg-paper/90 p-5 shadow-soft sm:p-8">
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.16em] text-coral">{transactionId ? 'Chỉnh sửa' : 'Ghi lại dòng tiền'}</p>
          <h1 className="font-editorial text-4xl font-semibold tracking-[-0.03em] text-ink">{transactionId ? 'Cập nhật giao dịch.' : 'Hôm nay có gì mới?'}</h1>

          <form onSubmit={submit} className="mt-8 space-y-7">
            <div className="grid grid-cols-2 rounded-[20px] bg-ink/[0.05] p-1.5">
              <TypeButton active={form.type === 'expense'} onClick={() => changeType('expense')} icon={ArrowUpRight} label="Khoản chi" activeClass="bg-coral text-white shadow-lg shadow-coral/20" />
              <TypeButton active={form.type === 'income'} onClick={() => changeType('income')} icon={ArrowDownLeft} label="Khoản thu" activeClass="bg-forest text-white shadow-lg shadow-forest/20" />
            </div>

            <div>
              <label className="label">Số tiền</label>
              <div className="relative">
                <input className="field h-20 pr-20 text-3xl font-extrabold tracking-tight" type="number" inputMode="numeric" min="1" max="999999999999" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" autoFocus required />
                <span className="absolute right-5 top-1/2 -translate-y-1/2 text-sm font-extrabold text-ink/35">{family.currency}</span>
              </div>
              {form.amount > 0 && <p className="mt-2 text-right text-xs font-semibold text-ink/40">{formatMoney(form.amount, family.currency)}</p>}
            </div>

            <div>
              <label className="label">Danh mục</label>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {filteredCategories.map((category) => (
                  <button key={category.id} type="button" onClick={() => setForm({ ...form, categoryId: category.id })} className={`relative flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-[20px] border p-2 text-xs font-extrabold transition ${form.categoryId === category.id ? 'border-forest bg-mint text-forest shadow-sm' : 'border-ink/[0.07] bg-white/60 text-ink/60 hover:bg-white'}`}>
                    {form.categoryId === category.id && <span className="absolute right-2 top-2 grid size-4 place-items-center rounded-full bg-forest text-white"><Check className="size-3" /></span>}
                    <span className="grid size-9 place-items-center rounded-xl" style={{ backgroundColor: `${category.color}1F`, color: category.color }}><CategoryIcon name={category.icon} className="size-4" /></span>
                    <span className="max-w-full truncate">{category.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block"><span className="label">Ngày giao dịch</span><span className="relative block"><CalendarDays className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink/35" /><input className="field pl-12" type="date" value={form.transactionDate} onChange={(e) => setForm({ ...form, transactionDate: e.target.value })} required /></span></label>
              <label className="block"><span className="label">Người thực hiện</span><select className="field" value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}>{familyDetails?.members.map((member) => <option key={member.id} value={member.id}>{member.id === user.id ? `${member.displayName} (tôi)` : member.displayName}</option>)}</select></label>
            </div>

            <label className="block"><span className="label">Ghi chú <span className="font-medium text-ink/35">(không bắt buộc)</span></span><textarea className="field min-h-24 resize-none py-3" maxLength="240" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Thêm một chút bối cảnh..." /></label>

            <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end">
              <button type="button" className="secondary-button" onClick={() => navigate(-1)}>Hủy</button>
              <button className="primary-button min-w-40" disabled={submitting || !form.amount}>{submitting ? <LoaderCircle className="size-5 animate-spin" /> : <><Check className="size-5" /> {transactionId ? 'Lưu thay đổi' : 'Lưu giao dịch'}</>}</button>
            </div>
          </form>
        </section>

        <aside className="h-fit rounded-[28px] bg-mint/70 p-6 lg:sticky lg:top-8">
          <Sparkles className="size-6 text-forest" />
          <h2 className="mt-4 font-editorial text-2xl font-semibold text-ink">Ghi nhanh, nhớ lâu.</h2>
          <p className="mt-3 text-sm leading-6 text-ink/55">Chỉ cần số tiền, danh mục và ngày. MoneyMate tự gán giao dịch cho bạn, nhưng vẫn có thể chọn người còn lại khi cần.</p>
          {selectedCategory && <div className="mt-5 flex items-center gap-3 rounded-2xl bg-white/65 p-3"><span className="grid size-10 place-items-center rounded-xl" style={{ color: selectedCategory.color, backgroundColor: `${selectedCategory.color}1F` }}><CategoryIcon name={selectedCategory.icon} className="size-5" /></span><div><div className="text-xs font-bold text-ink/35">Đã chọn</div><div className="text-sm font-extrabold text-ink">{selectedCategory.name}</div></div></div>}
        </aside>
      </div>
    </div>
  );
}

function TransactionFormSkeleton() {
  return (
    <div aria-label="Đang tải giao dịch" className="mx-auto max-w-4xl" role="status">
      <Skeleton className="mb-6 h-11 w-28 rounded-2xl" />
      <div className="grid gap-7 lg:grid-cols-[1fr_300px]">
        <section className="rounded-[32px] border border-ink/[0.06] bg-paper/90 p-5 shadow-soft sm:p-8">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="mt-4 h-10 w-72 max-w-full rounded-2xl" />
          <div className="mt-8 space-y-7">
            <Skeleton className="h-14 w-full rounded-[20px]" />
            <div className="space-y-2"><Skeleton className="h-3 w-20" /><Skeleton className="h-20 w-full rounded-2xl" /></div>
            <div className="space-y-3">
              <Skeleton className="h-3 w-24" />
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-[88px] rounded-[20px]" />)}</div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2"><Skeleton className="h-16 rounded-2xl" /><Skeleton className="h-16 rounded-2xl" /></div>
            <Skeleton className="h-24 w-full rounded-2xl" />
          </div>
        </section>
        <aside className="rounded-[28px] bg-mint/45 p-6"><Skeleton className="size-7 rounded-lg" /><Skeleton className="mt-5 h-7 w-48" /><Skeleton className="mt-4 h-3 w-full" /><Skeleton className="mt-2 h-3 w-5/6" /></aside>
      </div>
    </div>
  );
}

function TypeButton({ active, onClick, icon: Icon, label, activeClass }) {
  return <button type="button" onClick={onClick} className={`flex min-h-12 items-center justify-center gap-2 rounded-[15px] text-sm font-extrabold transition ${active ? activeClass : 'text-ink/42'}`}><Icon className="size-5" />{label}</button>;
}
