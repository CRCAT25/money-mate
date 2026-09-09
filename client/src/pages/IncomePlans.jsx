import { useEffect, useRef, useState } from 'react';
import { CalendarCheck, CalendarRange, Check, LoaderCircle, Pencil, TrendingUp, X } from 'lucide-react';
import CategoryIcon from '../components/ui/CategoryIcon.jsx';
import MoneyInput from '../components/ui/MoneyInput.jsx';
import PlanModeTabs from '../components/plans/PlanModeTabs.jsx';
import Modal from '../components/ui/Modal.jsx';
import MonthPicker from '../components/ui/MonthPicker.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useFamilyData } from '../context/FamilyContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import api, { errorMessage } from '../utils/api.js';
import { currentMonth, formatInputAmount, formatMoney, shiftMonth } from '../utils/formatters.js';

const emptyPlan = { month: '', planned: 0, spent: 0, remaining: 0, percentage: 0, items: [] };

export default function IncomePlans() {
  const { family } = useAuth();
  const { touch, getCache, setCache, loadCache, prefetchPages, isPersonal } = useFamilyData();
  const { notify } = useToast();
  const [month, setMonth] = useState(currentMonth());
  const initialPlanCache = getCache(`plans:income:${month}`);
  const [data, setData] = useState(() => initialPlanCache?.data || emptyPlan);
  const [previousAmounts, setPreviousAmounts] = useState({});
  const [draftAmounts, setDraftAmounts] = useState({});
  const [loading, setLoading] = useState(() => !initialPlanCache);
  const [editing, setEditing] = useState(false);
  const editingRef = useRef(false);
  const [categoryView, setCategoryView] = useState('planned');
  const [saving, setSaving] = useState(false);
  const [saveOptionsOpen, setSaveOptionsOpen] = useState(false);

  useEffect(() => {
    const cacheKey = `plans:income:${month}`;
    let active = true;
    const cached = getCache(cacheKey);
    if (cached) {
      setData(cached.data);
      if (!editingRef.current) setDraftAmounts(createDraftAmounts(cached.data.items));
      setLoading(false);
    } else {
      setLoading(true);
    }
    loadCache(cacheKey, async () => {
      const { data: nextData } = await api.get('/budgets', { params: { month, type: 'income' } });
      return { data: nextData };
    })
      .then(({ data: nextData }) => {
        if (!active) return;
        setData(nextData);
        if (!editingRef.current) setDraftAmounts(createDraftAmounts(nextData.items));
      })
      .catch((error) => active && notify(errorMessage(error), 'error'))
      .finally(() => active && setLoading(false));

    const previousMonth = shiftMonth(month, -1);
    loadCache(`plans:income:${previousMonth}`, async () => {
      const { data: previousData } = await api.get('/budgets', { params: { month: previousMonth, type: 'income' } });
      return { data: previousData };
    }).then(({ data: previousData }) => {
      if (!active) return;
      setPreviousAmounts(Object.fromEntries(previousData.items.map((item) => [item.category.id, item.amount])));
    }).catch(() => active && setPreviousAmounts({}));
    return () => { active = false; };
  }, [month, notify, getCache, loadCache]);

  const openEditor = () => {
    editingRef.current = true;
    setDraftAmounts(createDraftAmounts(data.items));
    setEditing(true);
  };

  const closeEditor = () => {
    editingRef.current = false;
    setDraftAmounts(createDraftAmounts(data.items));
    setSaveOptionsOpen(false);
    setEditing(false);
  };

  const getChanges = () => data.items.map((item) => {
    const rawAmount = draftAmounts[item.category.id] || '';
    const amount = rawAmount ? Number(rawAmount) : 0;
    return { item, amount };
  }).filter(({ item, amount }) => amount !== item.amount);

  const chooseSaveScope = () => {
    const changes = getChanges();
    if (changes.some(({ amount }) => !Number.isInteger(amount) || amount < 0 || amount > 999999999999)) {
      notify('Kế hoạch thu nhập không hợp lệ.', 'error');
      return;
    }
    if (!changes.length) {
      editingRef.current = false;
      setEditing(false);
      return;
    }
    setSaveOptionsOpen(true);
  };

  const savePlan = async (scope) => {
    const changes = getChanges();

    if (changes.some(({ amount }) => !Number.isInteger(amount) || amount < 0 || amount > 999999999999)) {
      notify('Kế hoạch thu nhập không hợp lệ.', 'error');
      return;
    }
    if (!changes.length) {
      editingRef.current = false;
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      const { data: saveResult } = await api.post('/budgets/batch', {
        month,
        scope,
        type: 'income',
        items: changes.map(({ item, amount }) => ({ categoryId: item.category.id, amount })),
      });
      touch('base');
      const changedByCategory = new Map(changes.map(({ item, amount }) => [item.category.id, amount]));
      const nextItems = data.items.map((item) => {
        if (!changedByCategory.has(item.category.id)) return item;
        const amount = changedByCategory.get(item.category.id);
        return {
          ...item,
          amount,
          remaining: amount - item.spent,
          percentage: amount ? Math.round((item.spent / amount) * 100) : 0,
        };
      });
      const plannedItems = nextItems.filter((item) => item.amount > 0);
      const totalPlanned = plannedItems.reduce((total, item) => total + item.amount, 0);
      const totalSpent = nextItems.reduce((total, item) => total + item.spent, 0);
      const nextData = {
        ...data,
        items: nextItems,
        planned: totalPlanned,
        spent: totalSpent,
        remaining: totalPlanned - totalSpent,
        percentage: totalPlanned ? Math.round((totalSpent / totalPlanned) * 100) : (totalSpent > 0 ? 100 : 0),
      };
      setData(nextData);
      editingRef.current = false;
      setDraftAmounts(createDraftAmounts(nextData.items));
      setCache(`plans:income:${month}`, { data: nextData });
      void prefetchPages(month);
      setSaveOptionsOpen(false);
      setEditing(false);
      notify(saveResult.message);
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
        <h1 className="truncate text-center font-editorial text-[21px] font-semibold tracking-[-0.025em] text-ink sm:text-2xl">
          {editing ? 'Chỉnh sửa kế hoạch thu nhập' : 'Thu nhập'}
        </h1>
        <button
          type="button"
          className={`grid size-9 place-items-center rounded-[11px] shadow-sm transition active:scale-95 ${editing ? 'bg-[#2D8A72] text-white' : 'bg-white/80 text-ink/55'}`}
          onClick={editing ? chooseSaveScope : openEditor}
          disabled={saving || loading}
          aria-label={editing ? 'Lưu kế hoạch thu nhập' : 'Chỉnh sửa kế hoạch thu nhập'}
        >
          {saving ? <LoaderCircle className="size-[18px] animate-spin" /> : editing ? <Check className="size-[19px]" strokeWidth={2.5} /> : <Pencil className="size-[16px]" strokeWidth={2.1} />}
        </button>
      </header>

      {!editing && <PlanModeTabs showFund={!isPersonal} />}

      <div>
        <MonthPicker value={month} onChange={setMonth} dense fullWidth variant="budget" />
      </div>

      {loading ? <IncomePageSkeleton editing={editing} /> : editing ? (
        <IncomeEditor
          items={data.items}
          currency={family.currency}
          draftAmounts={draftAmounts}
          previousAmounts={previousAmounts}
          total={draftTotal}
          saving={saving}
          onChange={(categoryId, value) => setDraftAmounts((current) => ({ ...current, [categoryId]: value }))}
        />
      ) : (
        <>
          <IncomeSummary data={data} currency={family.currency} />
          <IncomeOverview
            items={data.items}
            currency={family.currency}
            view={categoryView}
            onViewChange={setCategoryView}
            onEdit={openEditor}
          />
        </>
      )}

      <SaveIncomeOptions
        open={saveOptionsOpen}
        saving={saving}
        onClose={() => { if (!saving) setSaveOptionsOpen(false); }}
        onSaveMonth={() => savePlan('month')}
        onSaveFuture={() => savePlan('future')}
      />
    </div>
  );
}

function IncomeSummary({ data, currency }) {
  const hasPlan = data.planned > 0;
  const reached = hasPlan && data.spent >= data.planned;
  const percentage = hasPlan
    ? Math.min(100, Math.max(0, (data.spent / data.planned) * 100))
    : (data.spent > 0 ? 100 : 0);

  return (
    <section className="overflow-hidden rounded-[16px] border border-ink/[0.07] bg-paper/90 px-4 py-3 shadow-card sm:px-5">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold tracking-[-0.015em] text-ink">Tổng kế hoạch thu nhập</h2>
        <span className="shrink-0 whitespace-nowrap text-right text-xs font-medium text-[#2D8A72]">{formatMoney(data.planned, currency)}</span>
      </div>

      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-ink/[0.09]"
        role="img"
        aria-label={`Đã thu ${formatMoney(data.spent, currency)} trên kế hoạch ${formatMoney(data.planned, currency)}`}
      >
        <span className="block h-full rounded-full bg-[#2D8A72] transition-[width] duration-700 ease-out" style={{ width: `${percentage}%` }} />
      </div>

      <div className="mt-2 flex items-center justify-between gap-3 text-[10px] font-normal text-ink/38">
        <span className="truncate">Thực tế: <strong className="font-normal text-ink/62">{formatMoney(data.spent, currency)}</strong></span>
        {hasPlan ? (
          <span className={`truncate text-right ${reached ? 'text-[#2D8A72]' : ''}`}>
            {reached ? 'Đã đạt' : 'Còn thiếu'}: <strong className={`font-normal ${reached ? 'text-[#2D8A72]' : 'text-ink/62'}`}>{formatMoney(Math.abs(data.planned - data.spent), currency)}</strong>
          </span>
        ) : (
          <span className="truncate text-right text-ink/40">{data.spent > 0 ? 'Chưa đặt kế hoạch' : 'Chưa có thu nhập'}</span>
        )}
      </div>
    </section>
  );
}

function IncomeOverview({ items, currency, view, onViewChange, onEdit }) {
  const plannedItems = items.filter((item) => item.amount > 0);
  const visibleItems = view === 'all' ? items : plannedItems;

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 className="shrink-0 text-sm font-semibold tracking-[-0.015em] text-ink">Chi tiết thu nhập</h2>
        <div className="grid min-w-0 grid-cols-2 rounded-[10px] bg-ink/[0.055] p-0.5">
          <IncomeViewButton active={view === 'all'} label="Tất cả danh mục" count={items.length} onClick={() => onViewChange('all')} />
          <IncomeViewButton active={view === 'planned'} label="Đã thiết lập" count={plannedItems.length} onClick={() => onViewChange('planned')} />
        </div>
      </div>
      {visibleItems.length ? (
        <div className="overflow-hidden rounded-[16px] border border-ink/[0.065] bg-paper/90 px-3.5 shadow-card sm:px-4">
          {visibleItems.map((item, index) => <IncomeViewRow key={item.category.id} item={item} currency={currency} index={index} />)}
        </div>
      ) : (
        <div className="rounded-[16px] border border-ink/[0.065] bg-paper/90 px-5 py-8 text-center shadow-card">
          <div className="text-sm font-medium text-ink">Chưa có kế hoạch thu nhập tháng này</div>
          <p className="mx-auto mt-1.5 max-w-xs text-[11px] leading-5 text-ink/42">Thiết lập kế hoạch theo từng nguồn thu để theo dõi dòng tiền vào.</p>
          <button type="button" className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-[11px] bg-[#2D8A72] px-4 text-xs font-medium text-white shadow-sm" onClick={onEdit}><Pencil className="size-3.5" /> Thiết lập kế hoạch</button>
        </div>
      )}
    </section>
  );
}

function IncomeViewButton({ active, label, count, onClick }) {
  return (
    <button
      type="button"
      className={`flex min-h-7 items-center justify-center gap-1 whitespace-nowrap rounded-[8px] px-2 text-[9px] font-medium transition active:scale-[0.98] ${active ? 'bg-white text-ink shadow-sm' : 'text-ink/38'}`}
      onClick={onClick}
    >
      {label}
      <span className={`tabular-nums ${active ? 'text-ink/42' : 'text-ink/25'}`}>{count}</span>
    </button>
  );
}

function IncomeViewRow({ item, currency, index }) {
  const hasPlan = item.amount > 0;
  const reached = hasPlan && item.spent >= item.amount;
  const percentage = hasPlan
    ? Math.min(100, Math.max(0, (item.spent / item.amount) * 100))
    : item.spent > 0 ? 100 : 0;

  return (
    <article className="animate-rise-in border-b border-ink/[0.07] py-3 last:border-b-0" style={{ animationDelay: `${Math.min(index * 30, 180)}ms` }}>
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-[10px]" style={{ color: item.category.color, backgroundColor: `${item.category.color}12` }}>
            <CategoryIcon name={item.category.icon} className="size-[17px]" strokeWidth={2.15} />
          </span>
          <span className="min-w-0 truncate text-sm font-medium tracking-[-0.015em] text-ink">{item.category.name}</span>
        </div>
        <span className={`shrink-0 whitespace-nowrap text-right text-xs font-medium ${item.amount > 0 ? 'text-[#2D8A72]' : 'text-ink/35'}`}>{formatMoney(item.amount, currency)}</span>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-ink/[0.09]" role="img" aria-label={`${item.category.name}: đã thu ${formatMoney(item.spent, currency)} trên kế hoạch ${formatMoney(item.amount, currency)}`}>
        <span className="block h-full rounded-full bg-[#2D8A72] transition-[width] duration-700 ease-out" style={{ width: `${percentage}%` }} />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-3 text-[10px] font-normal text-ink/34">
        <span className="truncate">Thực tế: <strong className="font-normal text-ink/58">{formatMoney(item.spent, currency)}</strong></span>
        {hasPlan ? (
          <span className={`truncate text-right ${reached ? 'text-[#2D8A72]' : ''}`}>
            {reached ? 'Đã đạt' : 'Còn thiếu'}: <strong className={`font-normal ${reached ? 'text-[#2D8A72]' : 'text-ink/58'}`}>{formatMoney(Math.abs(item.amount - item.spent), currency)}</strong>
          </span>
        ) : (
          <span className="truncate text-right text-ink/35">{item.spent > 0 ? 'Chưa đặt kế hoạch' : ''}</span>
        )}
      </div>
    </article>
  );
}

function IncomeEditor({ items, currency, draftAmounts, previousAmounts, total, saving, onChange }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-4 rounded-[16px] border border-ink/[0.065] bg-paper/90 px-4 py-3 shadow-card">
        <span className="text-sm font-medium text-ink">Tổng kế hoạch thu nhập</span>
        <span className="shrink-0 whitespace-nowrap text-base font-normal tabular-nums text-[#2D8A72]">{formatMoney(total, currency)}</span>
      </div>
      <p className="px-1 text-[10px] font-normal text-ink/38">Tổng được tự động tính từ các hạng mục bên dưới.</p>
      <div className="overflow-hidden rounded-[16px] border border-ink/[0.065] bg-paper/90 px-3.5 shadow-card sm:px-4">
        {items.map((item, index) => (
          <IncomeEditRow
            key={item.category.id}
            item={item}
            currency={currency}
            value={draftAmounts[item.category.id] || ''}
            previousAmount={previousAmounts[item.category.id] || 0}
            index={index}
            disabled={saving}
            onChange={(value) => onChange(item.category.id, value)}
          />
        ))}
      </div>
    </section>
  );
}

function IncomeEditRow({ item, currency, value, previousAmount, index, disabled, onChange }) {
  const currencyLabel = currency === 'VND' ? '₫' : currency;
  const inputId = `income-plan-${item.category.id}`;
  return (
    <article className="animate-rise-in flex min-h-[54px] items-center gap-2.5 border-b border-ink/[0.07] py-2 last:border-b-0" style={{ animationDelay: `${Math.min(index * 24, 160)}ms` }}>
      <span className="grid size-8 shrink-0 place-items-center rounded-[10px]" style={{ color: item.category.color, backgroundColor: `${item.category.color}12` }}>
        <CategoryIcon name={item.category.icon} className="size-[17px]" strokeWidth={2.15} />
      </span>
      <label htmlFor={inputId} className="min-w-0 flex-1 cursor-text truncate text-sm font-medium tracking-[-0.015em] text-ink">{item.category.name}</label>
      <div className="relative w-[130px] shrink-0 border-b border-ink/10 sm:w-[150px]">
        <MoneyInput
          id={inputId}
          className="money-input h-9 w-full border-0 bg-transparent pl-1 pr-6 text-right text-sm font-normal tabular-nums tracking-[-0.015em] text-ink shadow-none placeholder:text-xs placeholder:font-normal placeholder:text-ink/28 focus:border-0 focus:bg-transparent focus:outline-none focus:ring-0"
          type="text"
          inputMode="numeric"
          value={value}
          onChange={onChange}
          placeholder={previousAmount > 0 ? formatInputAmount(previousAmount) : 'Nhập tiền'}
          disabled={disabled}
        />
        <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[10px] font-normal text-ink/32">{currencyLabel}</span>
      </div>
    </article>
  );
}

function SaveIncomeOptions({ open, saving, onClose, onSaveMonth, onSaveFuture }) {
  return (
    <Modal open={open} title="Chọn cách lưu" onClose={onClose} compact>
      <p className="-mt-1 text-[12px] font-normal leading-5 text-ink/48">Bạn muốn áp dụng những thay đổi kế hoạch thu nhập này trong khoảng thời gian nào?</p>
      <div className="mt-5 space-y-2.5">
        <button type="button" className="flex min-h-[62px] w-full items-center gap-3 rounded-[15px] border border-ink/[0.07] bg-white/70 px-3.5 text-left transition active:scale-[0.985] hover:bg-white" onClick={onSaveMonth} disabled={saving}>
          <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-[#2D8A72]/10 text-[#2D8A72]"><CalendarCheck className="size-[19px]" /></span>
          <span className="min-w-0 flex-1"><strong className="block text-[13px] font-semibold text-ink">Chỉ thay đổi tháng này</strong><small className="mt-0.5 block text-[10px] font-normal leading-4 text-ink/42">Các tháng sau giữ nguyên kế hoạch hiện có.</small></span>
          {saving && <LoaderCircle className="size-4 animate-spin text-ink/35" />}
        </button>
        <button type="button" className="flex min-h-[62px] w-full items-center gap-3 rounded-[15px] border border-ink/[0.07] bg-mint/55 px-3.5 text-left transition active:scale-[0.985] hover:bg-mint/75" onClick={onSaveFuture} disabled={saving}>
          <span className="grid size-10 shrink-0 place-items-center rounded-[12px] bg-forest/10 text-forest"><CalendarRange className="size-[19px]" /></span>
          <span className="min-w-0 flex-1"><strong className="block text-[13px] font-semibold text-ink">Tháng này và các tháng sau</strong><small className="mt-0.5 block text-[10px] font-normal leading-4 text-ink/42">Dùng làm mức kế hoạch thu nhập mới cho những tháng tiếp theo.</small></span>
          {saving && <LoaderCircle className="size-4 animate-spin text-forest/45" />}
        </button>
        <button type="button" className="min-h-11 w-full rounded-xl text-xs font-medium text-ink/45 transition hover:bg-ink/[0.04]" onClick={onClose} disabled={saving}>Bỏ qua</button>
      </div>
    </Modal>
  );
}

function IncomePageSkeleton({ editing }) {
  return (
    <div className="space-y-3" aria-label="Đang tải kế hoạch thu nhập" role="status">
      <Skeleton className="h-[62px] rounded-[16px]" />
      {!editing && <div className="flex items-center justify-between px-1"><Skeleton className="h-4 w-36" /><Skeleton className="h-3 w-16" /></div>}
      <div className="overflow-hidden rounded-[16px] border border-ink/[0.06] bg-white/50 px-3.5">
        {Array.from({ length: 5 }, (_, index) => (
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
  return Object.fromEntries(items.map((item) => [item.category.id, item.amount > 0 ? String(item.amount) : '']));
}
