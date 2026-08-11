import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, LoaderCircle, Pencil, ReceiptText } from 'lucide-react';
import CategoryIcon from '../components/ui/CategoryIcon.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useFamilyData } from '../context/FamilyContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import api, { errorMessage } from '../utils/api.js';

const localToday = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export default function TransactionForm() {
  const { id: transactionId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { family } = useAuth();
  const { categories, touch, loading: baseLoading } = useFamilyData();
  const { notify } = useToast();
  const [form, setForm] = useState({
    type: params.get('type') === 'income' ? 'income' : 'expense',
    amount: '', categoryId: '', transactionDate: localToday(), note: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(Boolean(transactionId));

  const filteredCategories = useMemo(() => categories.filter((item) => item.type === form.type), [categories, form.type]);
  useEffect(() => {
    if (!transactionId) return;
    api.get(`/transactions/${transactionId}`).then(({ data }) => {
      setForm({ type: data.type, amount: String(data.amount), categoryId: data.category.id, transactionDate: data.transactionDate, note: data.note || '' });
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
      const payload = {
        type: form.type,
        amount: Number(form.amount),
        categoryId: form.categoryId,
        transactionDate: form.transactionDate,
        note: form.note,
      };
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
    <div className="mx-auto max-w-3xl">
      <section className="-mx-4 -mt-4 overflow-hidden border-y border-ink/[0.07] bg-paper/95 shadow-card sm:mx-0 sm:mt-0 sm:rounded-[18px] sm:border">
        <header className="grid grid-cols-[36px_minmax(0,1fr)_36px] items-center gap-2 border-b border-ink/[0.06] px-4 py-2 sm:px-6 sm:py-3">
          <button type="button" onClick={() => navigate(-1)} className="grid size-9 place-items-center rounded-full bg-white/70 text-ink/48 shadow-sm transition hover:bg-white hover:text-ink" aria-label="Quay lại">
            <ArrowLeft className="size-[18px]" />
          </button>
          <div className="mx-auto grid w-full max-w-[280px] grid-cols-2 rounded-full bg-ink/[0.05] p-0.5">
            <TypeButton active={form.type === 'expense'} onClick={() => changeType('expense')} label="Tiền chi" />
            <TypeButton active={form.type === 'income'} onClick={() => changeType('income')} label="Tiền thu" />
          </div>
          <span className="grid size-9 place-items-center rounded-full bg-white/70 text-ink/40 shadow-sm" aria-hidden="true">
            {transactionId ? <Pencil className="size-[17px]" /> : <ReceiptText className="size-[17px]" />}
          </span>
        </header>

        <form onSubmit={submit} className="pb-[calc(128px+env(safe-area-inset-bottom))] lg:pb-0">
          <div className="divide-y divide-ink/[0.07] px-4 sm:px-6">
            <div className="grid min-h-[54px] grid-cols-[70px_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[112px_minmax(0,1fr)]">
              <span className="text-[13px] font-medium text-ink/68 sm:text-sm">Ngày</span>
              <div className="grid grid-cols-[34px_minmax(0,1fr)_34px] items-center gap-1">
                <button type="button" onClick={() => changeDate(-1)} className="grid size-8 place-items-center rounded-lg text-ink/40 transition hover:bg-ink/[0.05] hover:text-ink" aria-label="Ngày trước">
                  <ChevronLeft className="size-[18px]" />
                </button>
                <label className="relative flex min-h-9 cursor-pointer items-center justify-center rounded-[10px] bg-sun/15 px-2 text-center text-[13px] font-medium text-ink sm:text-sm">
                  <span>{formatTransactionDate(form.transactionDate)}</span>
                  <input className="absolute inset-0 cursor-pointer opacity-0" type="date" value={form.transactionDate} onChange={(event) => setForm({ ...form, transactionDate: event.target.value })} required aria-label="Ngày giao dịch" />
                </label>
                <button type="button" onClick={() => changeDate(1)} className="grid size-8 place-items-center rounded-lg text-ink/40 transition hover:bg-ink/[0.05] hover:text-ink" aria-label="Ngày sau">
                  <ChevronRight className="size-[18px]" />
                </button>
              </div>
            </div>

            <label className="grid min-h-[52px] grid-cols-[70px_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[112px_minmax(0,1fr)]">
              <span className="text-[13px] font-medium text-ink/68 sm:text-sm">Ghi chú</span>
              <input className="min-h-10 min-w-0 bg-transparent px-2 text-[13px] font-normal text-ink outline-none placeholder:text-ink/25 sm:text-sm" maxLength="240" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="Chưa nhập" />
            </label>

            <label className="grid min-h-[62px] grid-cols-[70px_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[112px_minmax(0,1fr)]">
              <span className="text-[13px] font-medium text-ink/68 sm:text-sm">{form.type === 'expense' ? 'Tiền chi' : 'Tiền thu'}</span>
              <span className="flex min-w-0 items-center gap-2.5">
                <input
                  className="min-h-11 min-w-0 flex-1 rounded-[10px] bg-sun/15 px-3 text-[22px] font-normal tracking-[-0.025em] text-ink outline-none placeholder:text-ink/30 sm:text-2xl"
                  type="text"
                  inputMode="numeric"
                  value={formatInputAmount(form.amount)}
                  onChange={(event) => setForm({ ...form, amount: event.target.value.replace(/\D/g, '').slice(0, 12) })}
                  placeholder="0"
                  autoFocus
                  required
                  aria-label={form.type === 'expense' ? 'Tiền chi' : 'Tiền thu'}
                />
                <span className="shrink-0 text-base font-normal text-ink/50">{currencySymbol(family.currency)}</span>
              </span>
            </label>
          </div>

          <div className="px-4 pb-4 pt-4 sm:px-6 sm:pb-6 sm:pt-5">
            <div className="mb-3">
              <p className="text-[15px] font-semibold text-ink">Danh mục</p>
              <p className="mt-0.5 text-[10px] font-normal text-ink/38">Chọn mục phù hợp với giao dịch</p>
            </div>

            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5 lg:grid-cols-6">
              {filteredCategories.map((category) => {
                const active = form.categoryId === category.id;
                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setForm({ ...form, categoryId: category.id })}
                    className={`relative flex min-h-[64px] min-w-0 flex-col items-center justify-center gap-1 rounded-[10px] border px-1 py-1.5 text-[10px] font-medium transition active:scale-[0.98] ${active ? 'border-coral/45 bg-coral/[0.07] text-ink shadow-sm' : 'border-ink/[0.08] bg-white/45 text-ink/55 hover:border-ink/15 hover:bg-white'}`}
                  >
                    {active && <span className="absolute right-1.5 top-1.5 grid size-3.5 place-items-center rounded-full bg-ink text-white"><Check className="size-2.5" strokeWidth={3} /></span>}
                    <span className="grid size-7 place-items-center rounded-lg" style={{ backgroundColor: `${category.color}14`, color: category.color }}>
                      <CategoryIcon name={category.icon} className="size-4" strokeWidth={2.1} />
                    </span>
                    <span className="w-full truncate text-center">{category.name}</span>
                  </button>
                );
              })}
            </div>

          </div>

          <div className="fixed inset-x-0 bottom-[calc(68px+env(safe-area-inset-bottom))] z-30 border-t border-ink/[0.07] bg-paper/95 px-4 py-2 shadow-[0_-8px_22px_rgba(32,49,44,0.07)] backdrop-blur-xl lg:static lg:border-t lg:bg-transparent lg:px-6 lg:pb-5 lg:pt-0 lg:shadow-none">
            <button className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-coral px-5 text-[13px] font-semibold text-white shadow-md shadow-coral/20 transition active:scale-[0.99] hover:bg-[#d9634b] disabled:pointer-events-none disabled:opacity-50" disabled={submitting || !form.amount || !form.categoryId}>
              {submitting ? <LoaderCircle className="size-[18px] animate-spin" /> : <><Check className="size-[18px]" /> {transactionId ? 'Lưu thay đổi' : form.type === 'expense' ? 'Nhập khoản chi' : 'Nhập khoản thu'}</>}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function TransactionFormSkeleton() {
  return (
    <div aria-label="Đang tải giao dịch" className="mx-auto max-w-3xl" role="status">
      <section className="-mx-4 -mt-4 overflow-hidden border-y border-ink/[0.07] bg-paper/90 shadow-card sm:mx-0 sm:mt-0 sm:rounded-[18px] sm:border">
        <div className="grid grid-cols-[36px_minmax(0,1fr)_36px] items-center gap-2 border-b border-ink/[0.06] px-4 py-2 sm:px-6 sm:py-3">
          <Skeleton className="size-9 rounded-full" />
          <Skeleton className="mx-auto h-10 w-full max-w-[280px] rounded-full" />
          <Skeleton className="size-9 rounded-full" />
        </div>
        <div className="divide-y divide-ink/[0.07] px-4 sm:px-6">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className={`${index === 2 ? 'h-[62px]' : 'h-[52px]'} w-full rounded-none`} />)}</div>
        <div className="px-4 pb-28 pt-4 sm:px-6">
          <Skeleton className="h-5 w-24 rounded-lg" />
          <Skeleton className="mt-2 h-3 w-56 rounded-lg" />
          <div className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-5 lg:grid-cols-6">{Array.from({ length: 10 }, (_, index) => <Skeleton key={index} className="h-16 rounded-[10px]" />)}</div>
        </div>
      </section>
    </div>
  );
}

function TypeButton({ active, onClick, label }) {
  return <button type="button" onClick={onClick} className={`min-h-9 rounded-full px-3 text-[13px] font-medium transition sm:text-sm ${active ? 'bg-white text-coral shadow-sm' : 'text-ink/45 hover:text-ink'}`}>{label}</button>;
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

function formatInputAmount(value) {
  if (!value) return '';
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number(value));
}
