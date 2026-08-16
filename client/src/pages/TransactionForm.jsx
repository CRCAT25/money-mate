import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, ChevronLeft, ChevronRight, Grid2X2, Landmark, LoaderCircle } from 'lucide-react';
import CategoryIcon from '../components/ui/CategoryIcon.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useFamilyData } from '../context/FamilyContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import api, { errorMessage } from '../utils/api.js';
import { visibleFundPockets } from '../utils/fund.js';

const localToday = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

export default function TransactionForm() {
  const { id: transactionId } = useParams();
  const [params] = useSearchParams();
  const requestedType = params.get('type');
  const initialMode = requestedType === 'income' || requestedType === 'fund' ? 'income' : 'expense';
  const navigate = useNavigate();
  const { family, user } = useAuth();
  const { categories, touch, loadFund, prefetchPages, loading: baseLoading, isPersonal } = useFamilyData();
  const { notify } = useToast();
  const [form, setForm] = useState({
    type: initialMode,
    amount: '', categoryId: '', transactionDate: localToday(), note: '', paidFromFund: false, fundPocketId: '',
  });
  const [mode, setMode] = useState(initialMode);
  const [entryKind, setEntryKind] = useState(requestedType === 'fund' ? 'fund' : 'regular');
  const [fund, setFund] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(Boolean(transactionId));
  const amountInput = useRef(null);

  const filteredCategories = useMemo(() => categories.filter((item) => item.type === form.type), [categories, form.type]);
  useEffect(() => {
    if (!transactionId) return;
    api.get(`/transactions/${transactionId}`).then(({ data }) => {
      setMode(data.type);
      setEntryKind(data.type === 'expense' && data.paidFromFund ? 'fund' : 'regular');
      setForm({ type: data.type, amount: String(data.amount), categoryId: data.category.id, transactionDate: data.transactionDate, note: data.note || '', paidFromFund: data.paidFromFund || false, fundPocketId: data.fundPocket?.id || '' });
    }).catch((error) => { notify(errorMessage(error), 'error'); navigate('/'); }).finally(() => setLoading(false));
  }, [transactionId, navigate, notify]);

  useEffect(() => {
    if (form.categoryId && !filteredCategories.some((item) => item.id === form.categoryId)) {
      setForm((current) => ({ ...current, categoryId: '' }));
    }
  }, [form.categoryId, filteredCategories]);

  useEffect(() => {
    if (isPersonal) {
      setFund(null);
      return undefined;
    }
    let active = true;
    loadFund(form.transactionDate.slice(0, 7)).then((entry) => {
      if (!active) return;
      const nextFund = entry?.data || null;
      const nextPockets = visibleFundPockets(nextFund?.pockets);
      setFund(nextFund);
      setForm((current) => {
        if (!nextPockets.length || nextPockets.some((pocket) => pocket.id === current.fundPocketId)) return current;
        const preferred = nextPockets.find((pocket) => pocket.monthlyTarget > 0)
          || nextPockets.find((pocket) => pocket.balance > 0)
          || nextPockets[0];
        return { ...current, fundPocketId: preferred.id };
      });
    }).catch(() => {});
    return () => { active = false; };
  }, [isPersonal, loadFund, form.transactionDate]);

  const changeMode = (nextMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    setEntryKind('regular');
    setForm((current) => ({
      ...current,
      type: nextMode,
      categoryId: '',
      paidFromFund: false,
      fundPocketId: '',
    }));
  };
  const changeEntryKind = (nextKind) => {
    if (nextKind === entryKind) return;
    setEntryKind(nextKind);
    if (nextKind === 'regular') {
      setForm((current) => ({ ...current, categoryId: '', paidFromFund: false, fundPocketId: '' }));
      return;
    }

    const pockets = visibleFundPockets(fund?.pockets);
    const preferredPocket = mode === 'expense'
      ? pockets.find((pocket) => pocket.balance > 0)
      : pockets.find((pocket) => pocket.monthlyTarget > 0) || pockets[0];
    setForm((current) => ({
      ...current,
      categoryId: '',
      paidFromFund: mode === 'expense',
      fundPocketId: pockets.some((pocket) => pocket.id === current.fundPocketId && (mode !== 'expense' || pocket.balance > 0))
        ? current.fundPocketId
        : preferredPocket?.id || '',
    }));
  };
  const changeDate = (days) => {
    const date = new Date(`${form.transactionDate}T12:00:00`);
    date.setDate(date.getDate() + days);
    const nextDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    setForm({ ...form, transactionDate: nextDate });
  };
  const submit = async (event) => {
    event.preventDefault();
    if (mode === 'income' && entryKind === 'fund' && !transactionId && !isPersonal) {
      const total = Number(form.amount);
      if (!total) return notify('Vui lòng nhập số tiền nạp quỹ.', 'error');
      setSubmitting(true);
      try {
        if (!selectedPocket) return notify('Vui lòng chọn quỹ nhận tiền.', 'error');
        const { data } = await api.post('/fund/contributions', {
          contributionDate: form.transactionDate,
          pocketId: form.fundPocketId,
          note: form.note,
          contributions: [{ userId: user.id, amount: total }],
        });
        notify(data.message);
        touch();
        void prefetchPages(form.transactionDate.slice(0, 7));
        loadFund(form.transactionDate.slice(0, 7)).then((entry) => setFund(entry?.data || null)).catch(() => {});
        setForm((current) => ({ ...current, amount: '', note: '' }));
        window.requestAnimationFrame(() => amountInput.current?.focus());
      } catch (error) {
        notify(errorMessage(error), 'error');
      } finally {
        setSubmitting(false);
      }
      return;
    }
    if (!form.amount) return notify('Vui lòng nhập số tiền.', 'error');
    if (!form.categoryId) return notify('Vui lòng chọn một danh mục.', 'error');
    if (isFundExpense && !selectedPocket) return notify('Vui lòng chọn quỹ thanh toán.', 'error');
    if (!transactionId && isFundExpense && selectedPocket && Number(form.amount) > selectedPocket.balance) {
      return notify(`Số dư ${selectedPocket.name} không đủ cho khoản chi này.`, 'error');
    }
    setSubmitting(true);
    try {
      const payload = {
        type: form.type,
        amount: Number(form.amount),
        categoryId: form.categoryId,
        transactionDate: form.transactionDate,
        note: form.note,
        paidFromFund: isFundExpense,
        fundPocketId: isFundExpense ? form.fundPocketId : null,
      };
      const { data } = transactionId ? await api.patch(`/transactions/${transactionId}`, payload) : await api.post('/transactions', payload);
      notify(data.message);
      touch();
      void prefetchPages([localToday().slice(0, 7), form.transactionDate.slice(0, 7)]);
      if (transactionId) {
        navigate('/');
      } else {
        setForm((current) => ({ ...current, amount: '', categoryId: '', note: '', paidFromFund: isFundExpense }));
        window.requestAnimationFrame(() => amountInput.current?.focus());
      }
    } catch (error) {
      notify(errorMessage(error), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const changeMainAmount = (value) => {
    const amount = value.replace(/\D/g, '').slice(0, 12);
    setForm((current) => ({ ...current, amount }));
  };

  const fundPockets = visibleFundPockets(fund?.pockets);
  const spendablePockets = fundPockets.filter((pocket) => pocket.balance > 0 || pocket.id === form.fundPocketId);
  const isFundContribution = mode === 'income' && entryKind === 'fund' && !transactionId && !isPersonal;
  const isFundExpense = mode === 'expense' && entryKind === 'fund' && !isPersonal;
  const selectedPocket = fundPockets.find((pocket) => pocket.id === form.fundPocketId);
  const fundExpenseExceedsBalance = Boolean(!transactionId && isFundExpense && selectedPocket && Number(form.amount) > selectedPocket.balance);
  const submitDisabled = submitting || !form.amount || (isFundContribution
    ? !selectedPocket
    : !form.categoryId || (isFundExpense && (!selectedPocket || fundExpenseExceedsBalance)));

  if (loading || baseLoading) return <TransactionFormSkeleton />;

  return (
    <div className="mx-auto max-w-3xl">
      <section className="-mx-4 -mt-4 overflow-hidden border-y border-ink/[0.07] bg-paper/95 shadow-card sm:mx-0 sm:mt-0 sm:rounded-[18px] sm:border">
        <header className="grid grid-cols-[36px_minmax(0,1fr)_36px] items-center gap-2 border-b border-ink/[0.06] px-4 py-2 sm:px-6 sm:py-3">
          <button type="button" onClick={() => navigate(-1)} className="grid size-9 place-items-center rounded-full bg-white/70 text-ink/48 shadow-sm transition hover:bg-white hover:text-ink" aria-label="Quay lại">
            <ArrowLeft className="size-[18px]" />
          </button>
          <div className="mx-auto grid w-full max-w-[280px] grid-cols-2 rounded-full bg-ink/[0.05] p-0.5">
            <TypeButton active={mode === 'expense'} onClick={() => changeMode('expense')} label="Tiền chi" tone="expense" />
            <TypeButton active={mode === 'income'} onClick={() => changeMode('income')} label="Tiền thu" tone="income" />
          </div>
          <span />
        </header>

        <form onSubmit={submit} className="pb-[calc(136px+env(safe-area-inset-bottom))] lg:pb-0">
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

            <label className="grid min-h-[56px] grid-cols-[70px_minmax(0,1fr)] items-center gap-2 sm:grid-cols-[112px_minmax(0,1fr)]">
              <span className="text-[13px] font-medium text-ink/68 sm:text-sm">{form.type === 'expense' ? 'Tiền chi' : 'Tiền thu'}</span>
              <span className="flex min-w-0 items-center gap-2">
                <input
                  ref={amountInput}
                  className="h-9 min-w-0 flex-1 rounded-[9px] bg-sun/12 px-2.5 text-[18px] font-normal tracking-[-0.02em] text-ink outline-none placeholder:text-ink/28 sm:h-10 sm:text-xl"
                  type="text"
                  inputMode="numeric"
                  value={formatInputAmount(form.amount)}
                  onChange={(event) => changeMainAmount(event.target.value)}
                  placeholder="0"
                  autoFocus
                  required
                  aria-label={form.type === 'expense' ? 'Tiền chi' : 'Tiền thu'}
                />
                <span className="shrink-0 text-sm font-normal text-ink/48">{currencySymbol(family.currency)}</span>
              </span>
            </label>
          </div>

          {!isPersonal && !transactionId && (
            <div className="px-4 pt-3 sm:px-6">
              <div className="flex items-center justify-between gap-3 rounded-[12px] border border-ink/[0.06] bg-mint/25 p-2.5">
                <div className="min-w-0">
                  <div className="text-[12px] font-medium text-ink">{mode === 'expense' ? 'Loại khoản chi' : 'Loại khoản thu'}</div>
                  <p className="mt-0.5 truncate text-[9px] font-normal text-ink/38">{mode === 'expense' ? 'Chi thông thường hoặc thanh toán bằng quỹ' : 'Thu nhập thực tế hoặc nạp tiền vào quỹ'}</p>
                </div>
                <div className="grid shrink-0 grid-cols-2 rounded-[10px] bg-ink/[0.05] p-0.5">
                  <SourceButton active={entryKind === 'regular'} onClick={() => changeEntryKind('regular')} tone={mode}>{mode === 'expense' ? 'Chi tiêu bình thường' : 'Thu bình thường'}</SourceButton>
                  <SourceButton active={entryKind === 'fund'} onClick={() => changeEntryKind('fund')} tone={mode}>{mode === 'expense' ? 'Chi tiêu quỹ' : 'Thu trong quỹ'}</SourceButton>
                </div>
              </div>
            </div>
          )}

          {isFundContribution ? (
            <div className="px-4 pb-5 pt-4 sm:px-6 sm:pb-6">
              <div>
                <div className="mb-3 flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[14px] font-medium text-ink"><Landmark className="size-4 text-forest" /> Danh mục nạp quỹ</div>
                    <p className="mt-0.5 text-[10px] font-normal text-ink/38">Chọn mục nhận tiền</p>
                  </div>
                  <button type="button" onClick={() => navigate('/fund-plans')} className="min-h-8 shrink-0 rounded-[9px] border border-ink/[0.07] bg-white/55 px-2.5 text-[10px] font-medium text-forest transition active:scale-[0.98]">Quản lý quỹ</button>
                </div>
                <FundPocketGrid pockets={fundPockets} value={form.fundPocketId} onChange={(fundPocketId) => setForm((current) => ({ ...current, fundPocketId }))} currency={family.currency} userId={user.id} />
                <p className="mt-2.5 text-[9px] font-normal text-ink/32">Tiền được ghi nhận cho tài khoản đang đăng nhập và không cộng vào thu nhập thực tế.</p>
              </div>
            </div>
          ) : (
            <div className="px-4 pb-4 pt-4 sm:px-6 sm:pb-6 sm:pt-5">
              {isFundExpense && (
                <div className="mb-4 rounded-[12px] border border-ink/[0.06] bg-mint/25 p-2.5">
                  <div className="flex items-center gap-1.5 text-[12px] font-medium text-ink"><Landmark className="size-3.5 text-forest" /> Chọn quỹ thanh toán</div>
                  <p className="mt-0.5 text-[9px] font-normal text-ink/38">Tổng số dư quỹ {formatInputAmount(fund?.balance || 0) || '0'} {currencySymbol(family.currency)}</p>
                  {spendablePockets.length ? (
                    <PocketSelector pockets={spendablePockets} value={form.fundPocketId} onChange={(fundPocketId) => setForm((current) => ({ ...current, fundPocketId, paidFromFund: true }))} currency={family.currency} compact />
                  ) : <p className="mt-2.5 rounded-[9px] bg-white/50 px-3 py-2.5 text-center text-[10px] font-normal text-coral">Quỹ chưa có số dư để thanh toán.</p>}
                  {fundExpenseExceedsBalance && <p className="mt-2 text-[9px] font-normal text-coral">Số tiền đang lớn hơn số dư của {selectedPocket.name}.</p>}
                </div>
              )}

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
                      className={`relative flex min-h-[64px] min-w-0 flex-col items-center justify-center gap-1 rounded-[10px] border px-1 py-1.5 text-[10px] font-medium text-ink transition active:scale-[0.98] ${active ? mode === 'income' ? 'border-forest/35 bg-forest/[0.06] shadow-sm' : 'border-coral/45 bg-coral/[0.07] shadow-sm' : 'border-ink/[0.08] bg-white/45 hover:border-ink/15 hover:bg-white'}`}
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

              <button
                type="button"
                className="mt-2.5 flex min-h-9 w-full items-center justify-center gap-1.5 rounded-[10px] border border-ink/[0.07] bg-white/45 px-3 text-[11px] font-medium text-forest transition active:scale-[0.99] hover:bg-mint/55"
                onClick={() => navigate('/categories')}
              >
                <Grid2X2 className="size-3.5" />
                Quản lý danh mục
              </button>
            </div>
          )}

          <div className="fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-30 border-t border-ink/[0.07] bg-paper/95 px-4 py-2 shadow-[0_-8px_22px_rgba(32,49,44,0.07)] backdrop-blur-xl lg:static lg:border-t lg:bg-transparent lg:px-6 lg:pb-5 lg:pt-0 lg:shadow-none">
            <button className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-[12px] px-5 text-[13px] font-semibold text-white shadow-md transition active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50 ${mode === 'income' ? 'bg-forest shadow-forest/20 hover:bg-[#315f54]' : 'bg-coral shadow-coral/20 hover:bg-[#d9634b]'}`} disabled={submitDisabled}>
              {submitting ? <LoaderCircle className="size-[18px] animate-spin" /> : <><Check className="size-[18px]" /> {transactionId ? 'Lưu thay đổi' : isFundContribution ? `Nạp vào ${selectedPocket?.name || 'quỹ chung'}` : isFundExpense ? `Chi từ ${selectedPocket?.name || 'quỹ'}` : mode === 'expense' ? 'Nhập khoản chi' : 'Nhập khoản thu'}</>}
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

function TypeButton({ active, onClick, label, tone }) {
  const activeTone = tone === 'income' ? 'text-forest' : 'text-coral';
  return <button type="button" onClick={onClick} className={`min-h-9 rounded-full px-2 text-[12px] font-medium transition sm:px-3 sm:text-sm ${active ? `bg-white ${activeTone} shadow-sm` : 'text-ink/45 hover:text-ink'}`}>{label}</button>;
}

function SourceButton({ active, disabled, onClick, children, tone }) {
  const activeTone = tone === 'income' ? 'text-forest' : 'text-coral';
  return <button type="button" disabled={disabled} onClick={onClick} className={`min-h-8 rounded-[8px] px-2.5 text-[10px] font-medium transition disabled:cursor-not-allowed disabled:opacity-35 ${active ? `bg-white ${activeTone} shadow-sm` : 'text-ink/42'}`}>{children}</button>;
}

function FundPocketGrid({ pockets = [], value, onChange, currency, userId }) {
  if (!pockets.length) return <Skeleton className="mt-2.5 h-20 w-full rounded-[12px]" />;
  const selected = pockets.find((pocket) => pocket.id === value);
  const memberTarget = selected?.memberTargets?.find((member) => member.id === userId);
  const memberPercentage = memberTarget?.target > 0
    ? Math.min(100, Math.round((memberTarget.contributed / memberTarget.target) * 100))
    : 0;
  return (
    <>
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5 lg:grid-cols-6">
        {pockets.map((pocket) => {
          const active = value === pocket.id;
          return (
            <button key={pocket.id} type="button" onClick={() => onChange(pocket.id)} className={`relative flex min-h-[64px] min-w-0 flex-col items-center justify-center gap-1 rounded-[10px] border px-1 py-1.5 text-[10px] font-medium text-ink transition active:scale-[0.98] ${active ? 'border-forest/35 bg-forest/[0.06] shadow-sm' : 'border-ink/[0.08] bg-white/45 hover:border-ink/15 hover:bg-white'}`}>
              {active && <span className="absolute right-1.5 top-1.5 grid size-3.5 place-items-center rounded-full bg-forest text-white"><Check className="size-2.5" strokeWidth={3} /></span>}
              {pocket.category ? (
                <span className="grid size-7 place-items-center rounded-lg" style={{ color: pocket.category.color, backgroundColor: `${pocket.category.color}14` }}>
                  <CategoryIcon name={pocket.category.icon} className="size-4" strokeWidth={2.1} />
                </span>
              ) : <span className="grid size-7 place-items-center rounded-lg bg-ink/[0.04]"><span className="size-2.5 rounded-full" style={{ backgroundColor: pocket.color }} /></span>}
              <span className="w-full truncate text-center">{pocket.name}</span>
            </button>
          );
        })}
      </div>
      {selected && (
        <div className="mt-2 rounded-[9px] bg-mint/28 px-2.5 py-2 text-[9px] font-normal">
          <div className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-ink/48">{selected.name} · Phần của bạn</span>
            {memberTarget?.target > 0 ? (
              <span className={memberTarget.remaining > 0 ? 'shrink-0 text-coral' : 'shrink-0 text-forest'}>
                {memberTarget.remaining > 0
                  ? `Còn ${formatInputAmount(memberTarget.remaining)} / ${formatInputAmount(memberTarget.target)} ${currencySymbol(currency)}`
                  : `Đã đủ ${formatInputAmount(memberTarget.target)} ${currencySymbol(currency)}`}
              </span>
            ) : <span className="shrink-0 text-ink/35">Chưa đặt chỉ tiêu</span>}
          </div>
          {memberTarget?.target > 0 && (
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink/[0.08]">
              <div className="h-full rounded-full bg-forest transition-[width] duration-500" style={{ width: `${memberPercentage}%` }} />
            </div>
          )}
        </div>
      )}
    </>
  );
}

function PocketSelector({ pockets = [], value, onChange, currency, compact = false }) {
  if (!pockets.length) return <Skeleton className="mt-2.5 h-12 w-full rounded-[10px]" />;
  return (
    <div className={`mt-2.5 grid gap-1.5 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
      {pockets.map((pocket) => {
        const active = value === pocket.id;
        return (
          <button key={pocket.id} type="button" onClick={() => onChange(pocket.id)} className={`flex min-h-[46px] min-w-0 items-center gap-2 rounded-[10px] border px-2.5 text-left transition active:scale-[0.98] ${active ? 'border-forest/30 bg-white shadow-sm' : 'border-ink/[0.06] bg-white/38'}`}>
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: pocket.color }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[11px] font-medium text-ink">{pocket.name}</span>
              <span className="mt-0.5 block truncate text-[9px] font-normal text-ink/42">{formatInputAmount(pocket.balance) || '0'} {currencySymbol(currency)}</span>
            </span>
            {active && <Check className="size-3.5 shrink-0 text-forest" strokeWidth={2.5} />}
          </button>
        );
      })}
    </div>
  );
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
