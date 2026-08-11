import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, LoaderCircle, Pencil, ReceiptText, UserRound } from 'lucide-react';
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
  const changeDate = (days) => {
    const date = new Date(`${form.transactionDate}T12:00:00`);
    date.setDate(date.getDate() + days);
    const nextDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    setForm({ ...form, transactionDate: nextDate });
  };
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
      <section className="-mx-4 -mt-4 overflow-hidden border-y border-ink/[0.07] bg-paper/95 shadow-soft sm:mx-0 sm:mt-0 sm:rounded-[20px] sm:border">
        <header className="grid grid-cols-[42px_minmax(0,1fr)_42px] items-center gap-2 border-b border-ink/[0.06] px-4 py-3 sm:px-7 sm:py-4">
          <button type="button" onClick={() => navigate(-1)} className="grid size-11 place-items-center rounded-full bg-white/75 text-ink/55 shadow-sm transition hover:bg-white hover:text-ink" aria-label="Quay lại">
            <ArrowLeft className="size-5" />
          </button>
          <div className="mx-auto grid w-full max-w-[320px] grid-cols-2 rounded-full bg-ink/[0.055] p-1">
            <TypeButton active={form.type === 'expense'} onClick={() => changeType('expense')} label="Tiền chi" />
            <TypeButton active={form.type === 'income'} onClick={() => changeType('income')} label="Tiền thu" />
          </div>
          <span className="grid size-11 place-items-center rounded-full bg-white/75 text-ink/48 shadow-sm" aria-hidden="true">
            {transactionId ? <Pencil className="size-5" /> : <ReceiptText className="size-5" />}
          </span>
        </header>

        <form onSubmit={submit} className="pb-[calc(140px+env(safe-area-inset-bottom))] lg:pb-0">
          <div className="divide-y divide-ink/[0.07] px-4 sm:px-7">
            <div className="grid min-h-[64px] grid-cols-[78px_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[130px_minmax(0,1fr)]">
              <span className="text-sm font-extrabold text-ink/72 sm:text-base">Ngày</span>
              <div className="grid grid-cols-[42px_minmax(0,1fr)_42px] items-center gap-1">
                <button type="button" onClick={() => changeDate(-1)} className="grid size-10 place-items-center rounded-xl text-ink/45 transition hover:bg-ink/[0.05] hover:text-ink" aria-label="Ngày trước">
                  <ChevronLeft className="size-5" />
                </button>
                <label className="relative flex min-h-11 cursor-pointer items-center justify-center rounded-xl bg-sun/15 px-2 text-center text-sm font-extrabold text-ink sm:text-base">
                  <span>{formatTransactionDate(form.transactionDate)}</span>
                  <input className="absolute inset-0 cursor-pointer opacity-0" type="date" value={form.transactionDate} onChange={(event) => setForm({ ...form, transactionDate: event.target.value })} required aria-label="Ngày giao dịch" />
                </label>
                <button type="button" onClick={() => changeDate(1)} className="grid size-10 place-items-center rounded-xl text-ink/45 transition hover:bg-ink/[0.05] hover:text-ink" aria-label="Ngày sau">
                  <ChevronRight className="size-5" />
                </button>
              </div>
            </div>

            <label className="grid min-h-[64px] grid-cols-[78px_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[130px_minmax(0,1fr)]">
              <span className="text-sm font-extrabold text-ink/72 sm:text-base">Ghi chú</span>
              <input className="min-h-11 min-w-0 bg-transparent px-3 text-[15px] font-semibold text-ink outline-none placeholder:text-ink/25" maxLength="240" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Chưa nhập vào" />
            </label>

            <label className="grid min-h-[74px] grid-cols-[78px_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[130px_minmax(0,1fr)]">
              <span className="text-sm font-extrabold text-ink/72 sm:text-base">{form.type === 'expense' ? 'Tiền chi' : 'Tiền thu'}</span>
              <span className="flex min-w-0 items-center gap-3">
                <input className="min-h-12 min-w-0 flex-1 rounded-xl bg-sun/15 px-4 text-[26px] font-bold tracking-[-0.04em] text-ink outline-none placeholder:text-ink/35" type="number" inputMode="numeric" min="1" max="999999999999" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="0" autoFocus required />
                <span className="shrink-0 text-lg font-extrabold text-ink/55">{currencySymbol(family.currency)}</span>
              </span>
            </label>
          </div>

          <div className="px-4 pb-6 pt-7 sm:px-7 sm:pb-8">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-lg font-extrabold text-ink">Danh mục</p>
                <p className="mt-1 text-xs font-semibold text-ink/38">Chọn mục phù hợp nhất với giao dịch</p>
              </div>
              {form.amount > 0 && <p className="shrink-0 text-xs font-extrabold text-coral">{formatMoney(form.amount, family.currency)}</p>}
            </div>

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
              {filteredCategories.map((category) => {
                const active = form.categoryId === category.id;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setForm({ ...form, categoryId: category.id })}
                    className={`relative flex min-h-[82px] min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border px-1.5 py-2 text-[11px] font-bold transition active:scale-[0.98] ${active ? 'border-coral/50 bg-coral/[0.07] text-ink shadow-sm' : 'border-ink/[0.09] bg-white/55 text-ink/58 hover:border-ink/15 hover:bg-white'}`}
                  >
                    {active && <span className="absolute right-2 top-2 grid size-4 place-items-center rounded-full bg-ink text-white"><Check className="size-3" strokeWidth={3} /></span>}
                    <span className="grid size-8 place-items-center rounded-[10px]" style={{ backgroundColor: `${category.color}18`, color: category.color }}>
                      <CategoryIcon name={category.icon} className="size-[18px]" strokeWidth={2.2} />
                    </span>
                    <span className="w-full truncate text-center">{category.name}</span>
                  </button>
                );
              })}
            </div>

            <label className="mt-6 flex min-h-14 items-center gap-3 rounded-2xl border border-ink/[0.08] bg-white/55 px-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-mint text-forest"><UserRound className="size-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-bold text-ink/35">Người thực hiện</span>
                <select className="w-full appearance-none bg-transparent py-0.5 text-sm font-extrabold text-ink outline-none" value={form.assignedTo} onChange={(event) => setForm({ ...form, assignedTo: event.target.value })}>
                  {familyDetails?.members.map((member) => <option key={member.id} value={member.id}>{member.id === user.id ? `${member.displayName} (tôi)` : member.displayName}</option>)}
                </select>
              </span>
            </label>

            {selectedCategory && <p className="mt-3 text-center text-xs font-semibold text-ink/38">Đã chọn <span className="font-extrabold text-ink/65">{selectedCategory.name}</span></p>}
          </div>

          <div className="fixed inset-x-0 bottom-[68px] z-30 border-t border-ink/[0.07] bg-paper/95 px-4 py-2.5 shadow-[0_-8px_22px_rgba(32,49,44,0.07)] backdrop-blur-xl lg:static lg:border-t lg:bg-transparent lg:px-7 lg:pb-6 lg:pt-0 lg:shadow-none">
            <button className="flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] bg-coral px-5 text-sm font-bold text-white shadow-md shadow-coral/20 transition active:scale-[0.99] hover:bg-[#d9634b] disabled:pointer-events-none disabled:opacity-50" disabled={submitting || !form.amount || !form.categoryId}>
              {submitting ? <LoaderCircle className="size-5 animate-spin" /> : <><Check className="size-5" /> {transactionId ? 'Lưu thay đổi' : form.type === 'expense' ? 'Nhập khoản chi' : 'Nhập khoản thu'}</>}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function TransactionFormSkeleton() {
  return (
    <div aria-label="Đang tải giao dịch" className="mx-auto max-w-4xl" role="status">
      <section className="-mx-4 -mt-4 overflow-hidden border-y border-ink/[0.07] bg-paper/90 shadow-soft sm:mx-0 sm:mt-0 sm:rounded-[20px] sm:border">
        <div className="grid grid-cols-[44px_minmax(0,1fr)_44px] items-center gap-3 border-b border-ink/[0.06] px-4 py-4 sm:px-7">
          <Skeleton className="size-11 rounded-full" />
          <Skeleton className="mx-auto h-14 w-full max-w-[340px] rounded-full" />
          <Skeleton className="size-11 rounded-full" />
        </div>
        <div className="divide-y divide-ink/[0.07] px-4 sm:px-7">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className={`${index === 2 ? 'h-[74px]' : 'h-[64px]'} w-full rounded-none`} />)}</div>
        <div className="px-4 pb-28 pt-7 sm:px-7">
          <Skeleton className="h-6 w-28 rounded-lg" />
          <Skeleton className="mt-2 h-3 w-56 rounded-lg" />
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">{Array.from({ length: 10 }, (_, index) => <Skeleton key={index} className="h-[82px] rounded-xl" />)}</div>
          <Skeleton className="mt-6 h-14 w-full rounded-2xl" />
        </div>
      </section>
    </div>
  );
}

function TypeButton({ active, onClick, label }) {
  return <button type="button" onClick={onClick} className={`min-h-11 rounded-full px-3 text-sm font-extrabold transition sm:text-base ${active ? 'bg-white text-coral shadow-sm' : 'text-ink/48 hover:text-ink'}`}>{label}</button>;
}

function formatTransactionDate(value) {
  const date = new Date(`${value}T12:00:00`);
  const weekDays = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  return `${date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })} (${weekDays[date.getDay()]})`;
}

function currencySymbol(currency) {
  if (currency === 'VND') return '₫';
  if (currency === 'USD') return '$';
  if (currency === 'EUR') return '€';
  return currency;
}
