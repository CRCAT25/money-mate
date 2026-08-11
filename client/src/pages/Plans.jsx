import { useEffect, useState } from 'react';
import { Check, LoaderCircle, X } from 'lucide-react';
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
  const [savedId, setSavedId] = useState(null);

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
      setSavedId(item.category.id);
      window.setTimeout(() => setSavedId((current) => current === item.category.id ? null : current), 1200);
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
    <div className="mx-auto max-w-3xl space-y-3 sm:space-y-4">
      <header className="flex min-h-9 items-center justify-center">
        <h1 className="font-editorial text-[21px] font-semibold tracking-[-0.025em] text-ink sm:text-2xl">Kế hoạch chi tiêu</h1>
      </header>

      <div>
        <MonthPicker value={month} onChange={setMonth} dense fullWidth variant="budget" />
      </div>

      {loading ? <PlanPageSkeleton /> : (
        <>
          <BudgetSummary data={data} currency={family.currency} />

          <section className="space-y-2">
            <div className="flex items-end justify-between gap-3 px-1">
              <div>
                <h2 className="text-sm font-extrabold tracking-[-0.015em] text-ink">Ngân sách theo danh mục</h2>
                <p className="mt-0.5 text-[10px] font-semibold text-ink/38">Chạm vào số tiền để chỉnh sửa</p>
              </div>
              <span className="pb-0.5 text-[10px] font-bold text-ink/32">{data.items.filter((item) => item.id).length}/{data.items.length} đã nhập</span>
            </div>
            <div className="grid overflow-hidden rounded-[16px] border border-ink/[0.07] bg-paper/90 px-3 shadow-card sm:grid-cols-2 sm:gap-x-5 sm:px-4">
              {data.items.map((item, index) => (
                <BudgetInputRow
                  key={item.category.id}
                  item={item}
                  currency={family.currency}
                  value={draftAmounts[item.category.id] || ''}
                  index={index}
                  saving={savingId === item.category.id}
                  deleting={deletingId === item.category.id}
                  saved={savedId === item.category.id}
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
  const over = data.remaining < 0;

  return (
    <section className="overflow-hidden rounded-[16px] border border-ink/[0.07] bg-paper/90 px-4 py-3 shadow-card sm:px-5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-extrabold tracking-[-0.015em] text-ink">Tổng ngân sách</h2>
          <p className="mt-1 truncate text-[10px] font-semibold text-ink/38">
            Đã chi {formatMoney(data.spent, currency)} · {over ? 'Vượt' : 'Còn'} {formatMoney(Math.abs(data.remaining), currency)}
          </p>
        </div>
        <div className="shrink-0 whitespace-nowrap text-right text-lg font-normal tracking-[-0.02em] text-ink sm:text-xl">{formatMoney(data.planned, currency)}</div>
      </div>
    </section>
  );
}

function BudgetInputRow({ item, currency, value, index, saving, deleting, saved, onChange, onSave, onDelete }) {
  const currencyLabel = currency === 'VND' ? '₫' : currency;
  const inputId = `budget-${item.category.id}`;

  return (
    <article className="group animate-rise-in flex min-h-[52px] items-center gap-2.5 border-b border-ink/[0.07] py-2 last:border-b-0 sm:min-h-[56px] sm:py-2.5 sm:[&:nth-last-child(-n+2)]:border-b-0" style={{ animationDelay: `${Math.min(index * 24, 180)}ms` }}>
      <span className="grid size-8 shrink-0 place-items-center rounded-[10px] sm:size-9" style={{ color: item.category.color, backgroundColor: `${item.category.color}12` }}>
        <CategoryIcon name={item.category.icon} className="size-[17px] sm:size-[18px]" strokeWidth={2.15} />
      </span>
      <label htmlFor={inputId} className="min-w-0 flex-1 cursor-text truncate text-[13px] font-medium tracking-[-0.01em] text-ink sm:text-sm">{item.category.name}</label>
      <div className="relative w-[126px] shrink-0 border-b border-ink/10 sm:w-[142px]">
        <label htmlFor={inputId} className="sr-only">Ngân sách {item.category.name}</label>
        <input
          id={inputId}
          className="h-9 w-full border-0 bg-transparent pl-1 pr-8 text-right text-[13px] font-normal tracking-[-0.01em] text-ink shadow-none placeholder:text-[10px] placeholder:font-normal placeholder:text-ink/25 focus:border-0 focus:bg-transparent focus:outline-none focus:ring-0 sm:text-sm"
          type="text"
          inputMode="numeric"
          value={formatInputAmount(value)}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 12))}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={onSave}
          onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
          placeholder="Nhập tiền"
          disabled={saving || deleting}
        />
        <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[11px] font-normal text-ink/35">
          {saving || deleting ? <LoaderCircle className="size-3.5 animate-spin" /> : saved ? <Check className="size-3.5 text-forest" strokeWidth={3} /> : currencyLabel}
        </span>
        {item.id && !saving && !deleting && (
          <button
            type="button"
            className="absolute -right-0.5 -top-1 grid size-4 place-items-center rounded-full bg-ink/8 text-ink/35 opacity-0 transition hover:bg-coral/12 hover:text-coral group-focus-within:opacity-100 group-hover:opacity-100"
            onPointerDown={(event) => event.preventDefault()}
            onClick={onDelete}
            aria-label={`Xóa ngân sách ${item.category.name}`}
          >
            <X className="size-2.5" strokeWidth={3} />
          </button>
        )}
      </div>
    </article>
  );
}

function PlanPageSkeleton() {
  return (
    <div className="space-y-3" aria-label="Đang tải ngân sách" role="status">
      <Skeleton className="h-[62px] rounded-[16px]" />
      <div className="flex items-center justify-between px-1"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-16" /></div>
      <div className="grid overflow-hidden rounded-[16px] border border-ink/[0.06] bg-white/50 px-3 sm:grid-cols-2 sm:gap-x-5 sm:px-4">
        {Array.from({ length: 10 }, (_, index) => (
          <div key={index} className="flex min-h-[52px] items-center gap-2.5 border-b border-ink/[0.06] py-2 last:border-0">
            <Skeleton className="size-8 shrink-0 rounded-[10px]" />
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="h-8 w-28 rounded-md" />
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
