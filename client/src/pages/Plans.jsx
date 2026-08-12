import { useEffect, useState } from 'react';
import { Check, LoaderCircle, Pencil, X } from 'lucide-react';
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
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

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

  const openEditor = () => {
    setDraftAmounts(createDraftAmounts(data.items));
    setEditing(true);
  };

  const closeEditor = () => {
    setDraftAmounts(createDraftAmounts(data.items));
    setEditing(false);
  };

  const savePlan = async () => {
    const changes = data.items.map((item) => {
      const rawAmount = draftAmounts[item.category.id] || '';
      const amount = rawAmount ? Number(rawAmount) : 0;
      return { item, amount };
    }).filter(({ item, amount }) => amount !== item.amount);

    if (changes.some(({ amount }) => !Number.isInteger(amount) || amount < 0 || amount > 999999999999)) {
      notify('Ngân sách không hợp lệ.', 'error');
      return;
    }
    if (!changes.length) {
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      await Promise.all(changes.map(({ item, amount }) => {
        if (!amount && item.id) return api.delete(`/budgets/${item.id}`);
        if (amount) return api.post('/budgets', { month, categoryId: item.category.id, amount });
        return Promise.resolve();
      }));
      const { data: nextData } = await api.get('/budgets', { params: { month } });
      setData(nextData);
      setDraftAmounts(createDraftAmounts(nextData.items));
      setCache(`plans:${month}`, { data: nextData, revision });
      setEditing(false);
      notify('Đã cập nhật kế hoạch chi tiêu.');
    } catch (error) {
      notify(errorMessage(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  const draftTotal = Object.values(draftAmounts).reduce((total, amount) => total + Number(amount || 0), 0);

  return (
    <div className="mx-auto max-w-3xl space-y-3 sm:space-y-4">
      <header className="grid min-h-9 grid-cols-[36px_minmax(0,1fr)_36px] items-center gap-2">
        {editing ? (
          <button type="button" className="grid size-9 place-items-center rounded-[11px] bg-white/80 text-ink/55 shadow-sm transition active:scale-95" onClick={closeEditor} disabled={saving} aria-label="Hủy chỉnh sửa">
            <X className="size-[18px]" strokeWidth={2.2} />
          </button>
        ) : <span />}
        <h1 className="truncate text-center font-editorial text-[21px] font-semibold tracking-[-0.025em] text-ink sm:text-2xl">{editing ? 'Chỉnh sửa ngân sách' : 'Kế hoạch chi tiêu'}</h1>
        <button
          type="button"
          className={`grid size-9 place-items-center rounded-[11px] shadow-sm transition active:scale-95 ${editing ? 'bg-[#3B82D0] text-white' : 'bg-white/80 text-ink/55'}`}
          onClick={editing ? savePlan : openEditor}
          disabled={saving || loading}
          aria-label={editing ? 'Lưu kế hoạch' : 'Chỉnh sửa kế hoạch'}
        >
          {saving ? <LoaderCircle className="size-[18px] animate-spin" /> : editing ? <Check className="size-[19px]" strokeWidth={2.5} /> : <Pencil className="size-[16px]" strokeWidth={2.1} />}
        </button>
      </header>

      <div>
        <MonthPicker value={month} onChange={setMonth} dense fullWidth variant="budget" />
      </div>

      {loading ? <PlanPageSkeleton editing={editing} /> : editing ? (
        <BudgetEditor
          items={data.items}
          currency={family.currency}
          draftAmounts={draftAmounts}
          total={draftTotal}
          saving={saving}
          onChange={(categoryId, value) => setDraftAmounts((current) => ({ ...current, [categoryId]: value }))}
        />
      ) : (
        <>
          <BudgetSummary data={data} currency={family.currency} />
          <BudgetOverview items={data.items} currency={family.currency} onEdit={openEditor} />
        </>
      )}
    </div>
  );
}

function BudgetSummary({ data, currency }) {
  const over = data.remaining < 0;
  const hasBudget = data.planned > 0;
  const spentPercentage = hasBudget ? Math.min(100, Math.max(0, (data.spent / data.planned) * 100)) : 0;
  const remainingPercentage = hasBudget ? Math.max(0, 100 - spentPercentage) : 0;
  const percentage = hasBudget ? Math.round((data.spent / data.planned) * 100) : 0;

  return (
    <section className="overflow-hidden rounded-[16px] border border-ink/[0.07] bg-paper/90 px-4 py-3 shadow-card sm:px-5">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold tracking-[-0.015em] text-ink">Tổng ngân sách</h2>
        <div className={`shrink-0 whitespace-nowrap text-right text-xs font-normal ${over ? 'text-[#E45757]' : 'text-ink/56'}`}>
          {over ? 'Vượt' : 'Còn lại'}: <strong className="font-medium text-ink">{formatMoney(Math.abs(data.remaining), currency)}</strong>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div
          className="flex h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-ink/[0.06]"
          role="img"
          aria-label={`Đã chi ${formatMoney(data.spent, currency)}, ${over ? 'vượt' : 'còn'} ${formatMoney(Math.abs(data.remaining), currency)}`}
        >
          <span className="h-full bg-[#E45757] transition-[width] duration-700 ease-out" style={{ width: `${spentPercentage}%` }} />
          <span className="h-full bg-[#3B82D0] transition-[width] duration-700 ease-out" style={{ width: `${remainingPercentage}%` }} />
        </div>
        <span className={`w-9 shrink-0 text-right text-[11px] font-normal tabular-nums ${over ? 'text-[#E45757]' : 'text-ink/38'}`}>{percentage}%</span>
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 text-[10px] font-normal text-ink/38">
        <span className="truncate">Ngân sách <strong className="font-normal text-ink/62">{formatMoney(data.planned, currency)}</strong></span>
        <span className="truncate text-right">Chi tiêu: <strong className="font-normal text-ink/62">{formatMoney(data.spent, currency)}</strong></span>
      </div>
    </section>
  );
}

function BudgetOverview({ items, currency, onEdit }) {
  const plannedItems = items.filter((item) => item.id);
  if (!plannedItems.length) {
    return (
      <section className="rounded-[16px] border border-ink/[0.065] bg-paper/90 px-5 py-8 text-center shadow-card">
        <div className="text-sm font-medium text-ink">Chưa có ngân sách tháng này</div>
        <p className="mx-auto mt-1.5 max-w-xs text-[11px] leading-5 text-ink/42">Thiết lập ngân sách theo danh mục để theo dõi số đã chi và phần còn lại.</p>
        <button type="button" className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-[11px] bg-[#3B82D0] px-4 text-xs font-medium text-white shadow-sm" onClick={onEdit}><Pencil className="size-3.5" /> Thiết lập ngân sách</button>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 className="text-sm font-semibold tracking-[-0.015em] text-ink">Chi tiết ngân sách</h2>
        <span className="text-[10px] font-normal text-ink/35">{plannedItems.length} hạng mục</span>
      </div>
      <div className="overflow-hidden rounded-[16px] border border-ink/[0.065] bg-paper/90 px-3.5 shadow-card sm:px-4">
        {plannedItems.map((item, index) => <BudgetViewRow key={item.category.id} item={item} currency={currency} index={index} />)}
      </div>
    </section>
  );
}

function BudgetViewRow({ item, currency, index }) {
  const over = item.remaining < 0;
  const percentage = Math.round((item.spent / item.amount) * 100);
  const spentPercentage = Math.min(100, Math.max(0, (item.spent / item.amount) * 100));
  const remainingPercentage = Math.max(0, 100 - spentPercentage);

  return (
    <article className="animate-rise-in border-b border-ink/[0.07] py-3 last:border-b-0" style={{ animationDelay: `${Math.min(index * 30, 180)}ms` }}>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-[10px]" style={{ color: item.category.color, backgroundColor: `${item.category.color}12` }}>
            <CategoryIcon name={item.category.icon} className="size-[17px]" strokeWidth={2.15} />
          </span>
          <span className="min-w-0 truncate text-sm font-medium tracking-[-0.015em] text-ink">{item.category.name}</span>
        </div>
        <div className={`shrink-0 whitespace-nowrap text-right text-[10px] font-normal ${over ? 'text-[#E45757]' : 'text-ink/42'}`}>
          {over ? 'Vượt' : 'Còn lại'}: <strong className={`text-xs font-medium ${over ? 'text-[#E45757]' : 'text-ink/78'}`}>{formatMoney(Math.abs(item.remaining), currency)}</strong>
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-2.5">
        <div className="flex h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-ink/[0.055]" role="img" aria-label={`${item.category.name}: đã dùng ${percentage}% ngân sách`}>
          <span className="h-full bg-[#E45757] transition-[width] duration-700 ease-out" style={{ width: `${spentPercentage}%` }} />
          <span className="h-full bg-[#3B82D0] transition-[width] duration-700 ease-out" style={{ width: `${remainingPercentage}%` }} />
        </div>
        <span className={`w-9 shrink-0 text-right text-[10px] font-normal tabular-nums ${over ? 'text-[#E45757]' : 'text-ink/35'}`}>{percentage}%</span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3 text-[10px] font-normal text-ink/34">
        <span className="truncate">Ngân sách: <strong className="font-normal text-ink/58">{formatMoney(item.amount, currency)}</strong></span>
        <span className="truncate text-right">Thực tế: <strong className="font-normal text-ink/58">{formatMoney(item.spent, currency)}</strong></span>
      </div>
    </article>
  );
}

function BudgetEditor({ items, currency, draftAmounts, total, saving, onChange }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-4 rounded-[16px] border border-ink/[0.065] bg-paper/90 px-4 py-3 shadow-card">
        <span className="text-sm font-medium text-ink">Tổng ngân sách</span>
        <span className="shrink-0 whitespace-nowrap text-base font-normal tabular-nums text-ink">{formatMoney(total, currency)}</span>
      </div>
      <p className="px-1 text-[10px] font-normal text-ink/38">Tổng được tự động tính từ các hạng mục bên dưới.</p>
      <div className="overflow-hidden rounded-[16px] border border-ink/[0.065] bg-paper/90 px-3.5 shadow-card sm:px-4">
        {items.map((item, index) => (
          <BudgetEditRow
            key={item.category.id}
            item={item}
            currency={currency}
            value={draftAmounts[item.category.id] || ''}
            index={index}
            disabled={saving}
            onChange={(value) => onChange(item.category.id, value)}
          />
        ))}
      </div>
    </section>
  );
}

function BudgetEditRow({ item, currency, value, index, disabled, onChange }) {
  const currencyLabel = currency === 'VND' ? '₫' : currency;
  const inputId = `budget-${item.category.id}`;
  return (
    <article className="animate-rise-in flex min-h-[54px] items-center gap-2.5 border-b border-ink/[0.07] py-2 last:border-b-0" style={{ animationDelay: `${Math.min(index * 24, 160)}ms` }}>
      <span className="grid size-8 shrink-0 place-items-center rounded-[10px]" style={{ color: item.category.color, backgroundColor: `${item.category.color}12` }}>
        <CategoryIcon name={item.category.icon} className="size-[17px]" strokeWidth={2.15} />
      </span>
      <label htmlFor={inputId} className="min-w-0 flex-1 cursor-text truncate text-sm font-medium tracking-[-0.015em] text-ink">{item.category.name}</label>
      <div className="relative w-[130px] shrink-0 border-b border-ink/10 sm:w-[150px]">
        <input
          id={inputId}
          className="h-9 w-full border-0 bg-transparent pl-1 pr-6 text-right text-sm font-normal tabular-nums tracking-[-0.015em] text-ink shadow-none placeholder:text-[10px] placeholder:font-normal placeholder:text-ink/24 focus:border-0 focus:bg-transparent focus:outline-none focus:ring-0"
          type="text"
          inputMode="numeric"
          value={formatInputAmount(value)}
          onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 12))}
          onFocus={(event) => event.currentTarget.select()}
          placeholder="Nhập tiền"
          disabled={disabled}
        />
        <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[10px] font-normal text-ink/32">{currencyLabel}</span>
      </div>
    </article>
  );
}

function PlanPageSkeleton({ editing }) {
  return (
    <div className="space-y-3" aria-label="Đang tải ngân sách" role="status">
      <Skeleton className="h-[62px] rounded-[16px]" />
      {!editing && <div className="flex items-center justify-between px-1"><Skeleton className="h-4 w-36" /><Skeleton className="h-3 w-16" /></div>}
      <div className="overflow-hidden rounded-[16px] border border-ink/[0.06] bg-white/50 px-3.5">
        {Array.from({ length: 10 }, (_, index) => (
          <div key={index} className="border-b border-ink/[0.06] py-3 last:border-0">
            <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2.5"><Skeleton className="size-8 shrink-0 rounded-[10px]" /><Skeleton className="h-3.5 w-24" /></div><Skeleton className="h-3.5 w-24" /></div>
            {!editing && <><div className="mt-2.5 flex items-center gap-2.5"><Skeleton className="h-1.5 flex-1 rounded-full" /><Skeleton className="h-3 w-8" /></div><div className="mt-2 flex items-center justify-between"><Skeleton className="h-3 w-28" /><Skeleton className="h-3 w-24" /></div></>}
          </div>
        ))}
      </div>
    </div>
  );
}

function createDraftAmounts(items) {
  return Object.fromEntries(items.map((item) => [item.category.id, item.id ? String(item.amount) : '']));
}

function formatInputAmount(value) {
  if (!value) return '';
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number(value));
}
