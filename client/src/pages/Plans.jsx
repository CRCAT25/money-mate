import { useEffect, useState } from 'react';
import { LoaderCircle, Trash2, WalletCards } from 'lucide-react';
import CategoryIcon from '../components/ui/CategoryIcon.jsx';
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
  const { revision, getCache, setCache } = useFamilyData();
  const { notify } = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState(emptyPlan);
  const [draftAmounts, setDraftAmounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  useEffect(() => {
    const cacheKey = `plans:${month}`;
    const cached = getCache(cacheKey);
    if (cached?.revision === revision) {
      setData(cached.data);
      setDraftAmounts(createDraftAmounts(cached.data.items));
      setLoading(false);
      return undefined;
    }

    let active = true;
    setLoading(true);
    api.get('/budgets', { params: { month } })
      .then(({ data: nextData }) => {
        if (!active) return;
        setData(nextData);
        setDraftAmounts(createDraftAmounts(nextData.items));
        setCache(cacheKey, { data: nextData, revision });
      })
      .catch((error) => active && notify(errorMessage(error), 'error'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [month, revision, notify, getCache, setCache]);

  const updateLocalPlan = (categoryId, changes) => {
    setData((current) => {
      const items = current.items.map((item) => item.category.id === categoryId ? { ...item, ...changes } : item);
      const nextData = summarizePlan(current, items);
      setCache(`plans:${month}`, { data: nextData, revision });
      return nextData;
    });
  };

  const saveBudget = async (item) => {
    const rawAmount = draftAmounts[item.category.id] || '';
    const amount = Number(rawAmount);
    if (!rawAmount || !Number.isInteger(amount) || amount < 1) {
      setDraftAmounts((current) => ({ ...current, [item.category.id]: item.amount ? String(item.amount) : '' }));
      return;
    }
    if (item.id && amount === item.amount) return;

    setSavingId(item.category.id);
    try {
      const { data: response } = await api.post('/budgets', { month, categoryId: item.category.id, amount });
      updateLocalPlan(item.category.id, {
        id: response.id,
        month,
        amount,
        remaining: amount - item.spent,
        percentage: Math.round((item.spent / amount) * 100),
      });
    } catch (error) {
      setDraftAmounts((current) => ({ ...current, [item.category.id]: item.amount ? String(item.amount) : '' }));
      notify(errorMessage(error), 'error');
    } finally {
      setSavingId(null);
    }
  };

  const removeBudget = async (item) => {
    if (!item.id || !window.confirm(`Xóa ngân sách cho ${item.category.name}?`)) return;
    setDeletingId(item.category.id);
    try {
      await api.delete(`/budgets/${item.id}`);
      setDraftAmounts((current) => ({ ...current, [item.category.id]: '' }));
      updateLocalPlan(item.category.id, {
        id: null,
        amount: 0,
        remaining: -item.spent,
        percentage: 0,
      });
    } catch (error) {
      notify(errorMessage(error), 'error');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4 sm:space-y-5">
      <header className="flex min-h-12 items-center justify-center">
        <h1 className="font-editorial text-[30px] font-semibold tracking-[-0.025em] text-ink sm:text-4xl">Kế hoạch chi tiêu</h1>
      </header>

      <div>
        <MonthPicker value={month} onChange={setMonth} dense fullWidth />
      </div>

      {loading ? <PlanPageSkeleton /> : (
        <>
          <BudgetSummary data={data} currency={family.currency} />

          <section>
            <div className="mb-3 px-1">
              <h2 className="font-editorial text-[26px] font-semibold tracking-[-0.02em] text-ink">Kế hoạch chi tiết</h2>
              <p className="mt-1 text-xs font-semibold text-ink/40">Nhập số tiền cho từng danh mục, hệ thống sẽ tự lưu khi bạn rời ô nhập.</p>
            </div>
            <div className="overflow-hidden rounded-[28px] border border-ink/[0.06] bg-white/70 px-4 shadow-sm backdrop-blur sm:px-6">
              {data.items.map((item, index) => (
                <BudgetInputRow
                  key={item.category.id}
                  item={item}
                  currency={family.currency}
                  value={draftAmounts[item.category.id] || ''}
                  index={index}
                  saving={savingId === item.category.id}
                  deleting={deletingId === item.category.id}
                  onChange={(value) => setDraftAmounts((current) => ({ ...current, [item.category.id]: value }))}
                  onSave={() => saveBudget(item)}
                  onDelete={() => removeBudget(item)}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function BudgetSummary({ data, currency }) {
  const plannedCount = data.items.filter((item) => item.id).length;
  const over = data.remaining < 0;
  const progress = Math.min(data.percentage, 100);

  return (
    <section className="rounded-[28px] border border-ink/[0.06] bg-white/75 p-5 shadow-sm backdrop-blur sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-[15px] bg-coral/10 text-coral"><WalletCards className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="whitespace-nowrap font-editorial text-[23px] font-semibold leading-none text-ink sm:text-[25px]">Tổng ngân sách</h2>
            <p className="mt-2 text-xs font-bold text-ink/35">{plannedCount}/{data.items.length} danh mục đã nhập</p>
          </div>
        </div>
        <div className="shrink-0 whitespace-nowrap text-right">
          <div className="text-[11px] font-bold text-ink/38">{over ? 'Vượt mức' : 'Còn lại'}</div>
          <div className={`mt-0.5 text-lg font-black tracking-[-0.02em] ${over ? 'text-coral' : 'text-ink'}`}>{formatMoney(Math.abs(data.remaining), currency)}</div>
        </div>
      </div>
      <ProgressBar percentage={progress} color={over ? '#F2735B' : '#E98855'} className="mt-5" />
      <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-4">
        <div className="text-xs font-semibold text-ink/38">Ngân sách <strong className="ml-1 text-ink/65">{formatMoney(data.planned, currency)}</strong></div>
        <div className="text-right">
          <div className={`text-sm font-black ${over ? 'text-coral' : 'text-ink/55'}`}>{data.percentage}%</div>
          <div className="mt-1 text-xs font-semibold text-ink/38">Chi tiêu <strong className="ml-1 text-ink/65">{formatMoney(data.spent, currency)}</strong></div>
        </div>
      </div>
    </section>
  );
}

function BudgetInputRow({ item, currency, value, index, saving, deleting, onChange, onSave, onDelete }) {
  const planned = Boolean(item.id);
  const over = planned && item.remaining < 0;
  const progress = planned ? Math.min(item.percentage, 100) : 0;
  const currencyLabel = currency === 'VND' ? '₫' : currency;

  return (
    <article className="animate-rise-in border-b border-ink/[0.08] py-5 last:border-b-0 sm:py-6" style={{ animationDelay: `${Math.min(index * 35, 245)}ms` }}>
      <div className="flex items-center gap-2.5 sm:gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-[14px] sm:size-11 sm:rounded-[15px]" style={{ color: item.category.color, backgroundColor: `${item.category.color}16` }}>
          <CategoryIcon name={item.category.icon} className="size-5" strokeWidth={2.25} />
        </span>
        <h3 className="min-w-0 flex-1 truncate text-base font-black tracking-[-0.01em] text-ink sm:text-lg">{item.category.name}</h3>
        <label className="relative block w-[126px] shrink-0 sm:w-40">
          <span className="sr-only">Ngân sách {item.category.name}</span>
          <input
            className="h-11 w-full rounded-[14px] border border-ink/10 bg-white/80 pl-3 pr-9 text-right text-[15px] font-black text-ink shadow-sm transition placeholder:text-xs placeholder:font-bold placeholder:text-ink/28 focus:border-forest/40 focus:bg-white"
            type="text"
            inputMode="numeric"
            value={formatInputAmount(value)}
            onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 12))}
            onBlur={onSave}
            onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
            placeholder="Nhập số tiền"
            disabled={saving || deleting}
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-extrabold text-ink/30">{saving ? <LoaderCircle className="size-4 animate-spin" /> : currencyLabel}</span>
        </label>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto] items-center gap-4">
        <ProgressBar percentage={progress} color={over ? '#F2735B' : item.category.color} />
        <span className={`w-11 text-right text-sm font-extrabold ${over ? 'text-coral' : planned ? 'text-ink/38' : 'text-ink/20'}`}>{planned ? `${item.percentage}%` : '—'}</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-4 text-xs font-semibold">
        <span className={planned ? over ? 'text-coral' : 'text-forest' : 'text-ink/30'}>
          {planned ? over ? `Vượt ${formatMoney(Math.abs(item.remaining), currency)}` : `Còn lại ${formatMoney(item.remaining, currency)}` : 'Chưa đặt ngân sách'}
        </span>
        <span className="flex items-center gap-1 text-ink/35">
          Chi tiêu <strong className="ml-1 text-ink/55">{formatMoney(item.spent, currency)}</strong>
          {planned && (
            <button type="button" className="ml-1 grid size-7 shrink-0 place-items-center rounded-lg text-ink/22 transition hover:bg-coral/10 hover:text-coral" onClick={onDelete} disabled={saving || deleting} aria-label={`Xóa ngân sách ${item.category.name}`}>
              {deleting ? <LoaderCircle className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
            </button>
          )}
        </span>
      </div>
    </article>
  );
}

function ProgressBar({ percentage, color, className = '' }) {
  return (
    <div className={`h-2.5 overflow-hidden rounded-full bg-ink/[0.06] ${className}`}>
      <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${percentage}%`, backgroundColor: color }} />
    </div>
  );
}

function PlanPageSkeleton() {
  return (
    <div className="space-y-5" aria-label="Đang tải ngân sách" role="status">
      <Skeleton className="h-48 rounded-[28px]" />
      <div className="space-y-3"><Skeleton className="h-8 w-52" /><Skeleton className="h-4 w-72" /></div>
      <div className="overflow-hidden rounded-[28px] border border-ink/[0.06] bg-white/50 px-4 sm:px-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 border-b border-ink/[0.06] py-5 last:border-0">
            <Skeleton className="size-10 shrink-0 rounded-[14px]" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-11 w-32 rounded-[14px]" />
          </div>
        ))}
      </div>
    </div>
  );
}

function createDraftAmounts(items) {
  return Object.fromEntries(items.map((item) => [item.category.id, item.id ? String(item.amount) : '']));
}

function summarizePlan(current, items) {
  const plannedItems = items.filter((item) => item.id);
  const planned = plannedItems.reduce((total, item) => total + Number(item.amount), 0);
  const spent = plannedItems.reduce((total, item) => total + Number(item.spent), 0);
  return {
    ...current,
    items,
    planned,
    spent,
    remaining: planned - spent,
    percentage: planned ? Math.round((spent / planned) * 100) : 0,
  };
}

function formatInputAmount(value) {
  if (!value) return '';
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number(value));
}
