import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Landmark, Pencil, Trash2, X } from 'lucide-react';
import MonthPicker from '../components/ui/MonthPicker.jsx';
import Skeleton, { TransactionListSkeleton } from '../components/ui/Skeleton.jsx';
import TransactionList from '../components/TransactionList.jsx';
import ConfirmModal from '../components/ui/ConfirmModal.jsx';
import Avatar from '../components/ui/Avatar.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useFamilyData } from '../context/FamilyContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import api, { errorMessage } from '../utils/api.js';
import { currentMonth, formatMoney } from '../utils/formatters.js';
import { visibleFundPockets } from '../utils/fund.js';

const weekDays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export default function Home() {
  const { family } = useAuth();
  const navigate = useNavigate();
  const { familyDetails, touch, getCache, loadCache, loadFund, prefetchPages, loading: baseLoading, isPersonal } = useFamilyData();
  const { notify } = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [selectedDates, setSelectedDates] = useState([]);
  const [contentView, setContentView] = useState(() => family?.type === 'family' ? 'fund' : 'transactions');
  const initialHomeCache = getCache(`home:${month}`);
  const [summary, setSummary] = useState(() => initialHomeCache?.summary || null);
  const [transactions, setTransactions] = useState(() => initialHomeCache?.transactions || []);
  const [fund, setFund] = useState(() => initialHomeCache?.fund || null);
  const [loading, setLoading] = useState(() => !initialHomeCache);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteContributionTarget, setDeleteContributionTarget] = useState(null);
  const [deletingContribution, setDeletingContribution] = useState(false);
  const showRecentTransactions = isPersonal || familyDetails?.showRecentTransactions !== false;

  useEffect(() => {
    setContentView(family?.type === 'family' ? 'fund' : 'transactions');
    setSelectedDates([]);
  }, [family?.id, family?.type]);

  useEffect(() => {
    if (!showRecentTransactions && contentView === 'transactions') setContentView('fund');
  }, [contentView, showRecentTransactions]);

  useEffect(() => {
    if (baseLoading) return undefined;

    let active = true;
    const cacheKey = `home:${month}`;
    const cached = getCache(cacheKey);
    if (cached) {
      setSummary(cached.summary);
      setTransactions(cached.transactions);
      setFund(cached.fund || null);
      setLoading(false);
    } else {
      setLoading(true);
    }

    const homeRequest = loadCache(cacheKey, async () => {
      const [summaryResponse, transactionResponse, fundEntry] = await Promise.all([
        api.get('/reports/summary', { params: { month } }),
        api.get('/transactions', { params: { month, limit: 200 } }),
        loadFund(month),
      ]);
      return { summary: summaryResponse.data, transactions: transactionResponse.data, fund: fundEntry?.data || null };
    });

    // Reuse the current request while warming the other menu screens.
    void prefetchPages(month);

    homeRequest.then((nextData) => {
      if (!active) return;
      setSummary(nextData.summary);
      setTransactions(nextData.transactions);
      setFund(nextData.fund || null);
    }).catch((error) => active && notify(errorMessage(error), 'error'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [month, notify, getCache, loadCache, loadFund, prefetchPages, baseLoading]);

  const transactionDailyCashflow = useMemo(() => transactions.reduce((totals, transaction) => {
    const day = totals[transaction.transactionDate] || { income: 0, expense: 0 };
    day[transaction.type] += Number(transaction.amount);
    totals[transaction.transactionDate] = day;
    return totals;
  }, {}), [transactions]);
  const fundDailyCashflow = useMemo(() => (fund?.dailyActivity || []).reduce((totals, activity) => {
    totals[activity.date] = {
      income: Number(activity.contributed || 0),
      expense: Number(activity.spent || 0),
    };
    return totals;
  }, {}), [fund]);
  const showingFund = !isPersonal && contentView === 'fund';
  const dailyCashflow = showingFund ? fundDailyCashflow : transactionDailyCashflow;
  const selectedDateSet = useMemo(() => new Set(selectedDates), [selectedDates]);
  const fundSummary = useMemo(() => Object.values(fundDailyCashflow).reduce((totals, day) => ({
    income: totals.income + day.income,
    expense: totals.expense + day.expense,
    balance: totals.balance + day.income - day.expense,
  }), { income: 0, expense: 0, balance: 0 }), [fundDailyCashflow]);
  const displayedTransactions = useMemo(
    () => selectedDates.length ? transactions.filter((transaction) => selectedDateSet.has(transaction.transactionDate)) : transactions,
    [selectedDates.length, selectedDateSet, transactions],
  );
  const displayedFundTransactions = useMemo(
    () => displayedTransactions.filter((transaction) => transaction.paidFromFund),
    [displayedTransactions],
  );
  const displayedContributions = useMemo(
    () => flattenFundContributions(fund?.recentContributions, selectedDates.length ? selectedDateSet : null),
    [fund?.recentContributions, selectedDates.length, selectedDateSet],
  );
  const selectedSummary = useMemo(() => selectedDates.reduce((totals, date) => {
    const day = dailyCashflow[date];
    const income = Number(day?.income || 0);
    const expense = Number(day?.expense || 0);
    return {
      income: totals.income + income,
      expense: totals.expense + expense,
      balance: totals.balance + income - expense,
    };
  }, { income: 0, expense: 0, balance: 0 }), [dailyCashflow, selectedDates]);
  const displayedSummary = selectedDates.length ? selectedSummary : showingFund ? fundSummary : summary;
  const selectedDateLabel = selectedDates.length === 1
    ? formatSelectedDate(selectedDates[0])
    : `${selectedDates.length} ngày đã chọn`;
  const summaryLabels = showingFund
    ? { income: 'Đã góp', expense: 'Đã dùng', balance: 'Còn lại' }
    : { income: 'Thu nhập', expense: 'Chi tiêu', balance: 'Còn lại' };

  const remove = async (transaction) => {
    setDeleting(true);
    try {
      await api.delete(`/transactions/${transaction.id}`);
      setTransactions((current) => current.filter((item) => item.id !== transaction.id));
      setDeleteTarget(null);
      notify('Đã xóa giao dịch.');
      touch();
      void prefetchPages(month);
    } catch (error) {
      notify(errorMessage(error), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const openContributionEditor = (contribution) => {
    navigate(`/fund/contributions/${contribution.id}/edit`);
  };

  const removeContribution = async () => {
    if (!deleteContributionTarget) return;
    setDeletingContribution(true);
    try {
      await api.delete(`/fund/contributions/${deleteContributionTarget.id}`);
      touch();
      const entry = await loadFund(month);
      setFund(entry?.data || null);
      void prefetchPages(month);
      setDeleteContributionTarget(null);
      notify('Đã xóa khoản nạp quỹ.');
    } catch (error) {
      notify(errorMessage(error), 'error');
    } finally {
      setDeletingContribution(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="fixed inset-x-0 top-[env(safe-area-inset-top)] z-30 flex h-12 items-center bg-cream/90 px-4 backdrop-blur-xl sm:px-7 lg:static lg:h-auto lg:bg-transparent lg:px-0 lg:backdrop-blur-none">
        <MonthPicker value={month} onChange={(nextMonth) => { setMonth(nextMonth); setSelectedDates([]); }} dense fullWidth variant="budget" />
      </div>

      <section className="overflow-hidden rounded-[18px] border border-ink/[0.07] bg-paper/90 shadow-card">
        {!isPersonal && showRecentTransactions && <div className="border-b border-ink/[0.07] bg-white/38 p-1.5"><HomeContentTabs value={contentView} onChange={setContentView} /></div>}
        <div className="grid grid-cols-7 border-b border-ink/[0.07] bg-ink/[0.035]">
          {weekDays.map((day, index) => (
            <div key={day} className={`py-1.5 text-center text-[10px] font-semibold ${index === 5 ? 'text-[#1698bf]' : index === 6 ? 'text-coral' : 'text-ink/45'}`}>{day}</div>
          ))}
        </div>
        {loading ? <CalendarSkeleton /> : <CashflowCalendar month={month} dailyCashflow={dailyCashflow} selectedDates={selectedDateSet} onToggleDate={(date) => setSelectedDates((current) => current.includes(date) ? current.filter((item) => item !== date) : [...current, date])} />}
        <div className="grid grid-cols-3 border-t border-ink/[0.07] bg-white/55">
          <SummaryItem label={summaryLabels.income} value={displayedSummary?.income} currency={family.currency} tone="income" loading={loading} />
          <SummaryItem label={summaryLabels.expense} value={displayedSummary?.expense} currency={family.currency} tone="expense" loading={loading} />
          <SummaryItem label={summaryLabels.balance} value={displayedSummary?.balance} currency={family.currency} tone={displayedSummary?.balance >= 0 ? 'income' : 'expense'} loading={loading} />
        </div>
      </section>

      {!isPersonal && contentView === 'fund' ? (
        <div key="fund" className="animate-fade-only"><FundCard fund={fund} currency={family.currency} loading={loading} contributions={displayedContributions} transactions={displayedFundTransactions} filtered={selectedDates.length > 0} groupTransactionsByDate={selectedDates.length !== 1} onEditContribution={openContributionEditor} onDeleteContribution={setDeleteContributionTarget} onDeleteTransaction={setDeleteTarget} /></div>
      ) : (
        <section key="transactions" className="animate-fade-only overflow-hidden rounded-[18px] border border-ink/[0.06] bg-paper/90 p-3.5 shadow-card sm:p-5">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-5 text-forest" />
              <h2 className="whitespace-nowrap text-base font-bold tracking-[-0.02em] text-ink sm:text-xl">{selectedDates.length ? `Giao dịch ${selectedDateLabel}` : 'Giao dịch gần đây'}</h2>
            </div>
            {selectedDates.length > 0 && <button type="button" onClick={() => setSelectedDates([])} className="inline-flex min-h-8 shrink-0 items-center gap-1 rounded-[9px] bg-ink/[0.045] px-2.5 text-[10px] font-medium text-ink/52 transition active:scale-[0.98]"><X className="size-3.5" /> Xem cả tháng</button>}
          </div>
          {loading ? <TransactionListSkeleton compact /> : <TransactionList transactions={displayedTransactions} currency={family.currency} onDelete={setDeleteTarget} compact groupByDate={selectedDates.length !== 1} showTime showMember={!isPersonal} />}
        </section>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Xóa giao dịch?"
        description={deleteTarget ? `Giao dịch “${deleteTarget.category.name}” sẽ bị xóa khỏi lịch sử và báo cáo của gia đình.` : ''}
        confirmLabel="Xóa giao dịch"
        loading={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => remove(deleteTarget)}
      />

      <ConfirmModal
        open={Boolean(deleteContributionTarget)}
        title="Xóa khoản nạp quỹ?"
        description={deleteContributionTarget ? `${formatMoney(deleteContributionTarget.amount, family.currency)} sẽ được trừ khỏi số tiền thực tế trong kế hoạch nạp quỹ.` : ''}
        confirmLabel="Xóa khoản nạp"
        loading={deletingContribution}
        onClose={() => { if (!deletingContribution) setDeleteContributionTarget(null); }}
        onConfirm={removeContribution}
      />

    </div>
  );
}

function HomeContentTabs({ value, onChange }) {
  return (
    <div className="grid grid-cols-2 rounded-[12px] bg-ink/[0.045] p-0.5">
      <button type="button" aria-pressed={value === 'fund'} onClick={() => onChange('fund')} className={`flex min-h-10 items-center justify-center gap-1.5 rounded-[11px] px-2 text-[10px] font-medium transition active:scale-[0.99] ${value === 'fund' ? 'bg-white/90 text-forest shadow-sm' : 'text-ink/40'}`}><Landmark className="size-3.5" /> Chỉ thuộc quỹ chung</button>
      <button type="button" aria-pressed={value === 'transactions'} onClick={() => onChange('transactions')} className={`flex min-h-10 items-center justify-center gap-1.5 rounded-[11px] px-2 text-[10px] font-medium transition active:scale-[0.99] ${value === 'transactions' ? 'bg-white/90 text-forest shadow-sm' : 'text-ink/40'}`}><CalendarDays className="size-3.5" /> Tất cả giao dịch gần đây</button>
    </div>
  );
}

function FundCard({ fund, currency, loading, contributions, transactions, filtered, groupTransactionsByDate, onEditContribution, onDeleteContribution, onDeleteTransaction }) {
  const pockets = visibleFundPockets(fund?.pockets);
  const plannedPockets = pockets.filter((pocket) => Number(pocket.monthlyTarget || 0) > 0);
  const fundPockets = pockets.filter((pocket) => Number(pocket.monthlyContributed || 0) > 0);
  const monthlyTarget = plannedPockets.reduce((sum, pocket) => sum + Number(pocket.monthlyTarget || 0), 0);
  const monthlyContributed = plannedPockets.reduce((sum, pocket) => sum + Number(pocket.monthlyContributed || 0), 0);
  const monthlyRemaining = plannedPockets.reduce((sum, pocket) => sum + Number(pocket.monthlyRemaining || 0), 0);
  const monthlyPercentage = monthlyTarget > 0 ? Math.min(100, (monthlyContributed / monthlyTarget) * 100) : 0;

  return (
    <section className="overflow-hidden rounded-[16px] border border-ink/[0.06] bg-[linear-gradient(135deg,rgba(230,242,237,0.92),rgba(255,250,240,0.88))] p-3.5 shadow-card sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid size-8 place-items-center rounded-[10px] bg-white/75 text-forest shadow-sm"><Landmark className="size-4" /></span>
          <div>
            <h2 className="text-[13px] font-medium text-ink sm:text-sm">Quỹ chung</h2>
            <p className="text-[10px] font-normal text-ink/42">Theo dõi kế hoạch nạp quỹ tháng này</p>
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-[11px] border border-white/70 bg-white/42 px-2.5 py-2">
        <div className="flex items-center justify-between gap-3 text-[9px] font-normal text-ink/42">
          <span>Tiến độ nạp quỹ</span>
          <span>{loading ? '...' : `Mục tiêu ${formatMoney(monthlyTarget, currency)}`}</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/[0.08]">
          <div className={`h-full rounded-full transition-[width] duration-700 ease-out ${monthlyRemaining > 0 ? 'bg-coral' : 'bg-forest'}`} style={{ width: `${monthlyPercentage}%` }} />
        </div>
        <div className="mt-1.5 flex items-center justify-between gap-3 text-[10px] font-normal">
          <span className="text-forest">Đã góp: {loading ? '...' : formatMoney(monthlyContributed, currency)}</span>
          <span className="text-coral">Còn thiếu: {loading ? '...' : formatMoney(monthlyRemaining, currency)}</span>
        </div>
      </div>

      {!loading && fundPockets.length > 0 && (
        <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
          {fundPockets.map((pocket) => {
            const hasTarget = Number(pocket.monthlyTarget || 0) > 0;
            const progress = hasTarget ? pocket.monthlyPercentage : 0;
            return (
              <div key={pocket.id} className="rounded-[10px] border border-white/75 bg-white/52 px-2.5 py-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: pocket.color }} />
                  <span className="min-w-0 flex-1 truncate text-[11px] font-normal text-ink/65">{pocket.name}</span>
                  <span className="shrink-0 text-[10px] font-normal text-ink">{hasTarget ? `${formatMoney(pocket.monthlyContributed, currency)} / ${formatMoney(pocket.monthlyTarget, currency)}` : formatMoney(pocket.balance, currency)}</span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-ink/[0.07]"><div className={`h-full rounded-full transition-[width] duration-500 ${pocket.monthlyRemaining > 0 ? 'bg-coral' : 'bg-forest'}`} style={{ width: `${progress}%` }} /></div>
                {hasTarget ? (
                  <div className="mt-1.5 flex items-center justify-between text-[9px] font-normal text-ink/42">
                    <span>Đã góp {formatMoney(pocket.monthlyContributed, currency)}</span>
                    <span className={pocket.monthlyRemaining > 0 ? 'text-coral' : 'text-forest'}>{pocket.monthlyRemaining > 0 ? `Còn thiếu ${formatMoney(pocket.monthlyRemaining, currency)}` : 'Đã góp đủ'}</span>
                  </div>
                ) : <div className="mt-1.5 text-[9px] font-normal text-ink/30">Chưa đặt chỉ tiêu nạp quỹ</div>}
              </div>
            );
          })}
        </div>
      )}

      {!loading && !fundPockets.length && <p className="mt-3 rounded-[10px] border border-white/70 bg-white/45 px-3 py-4 text-center text-[10px] font-normal text-ink/38">Chưa có danh mục nào được thiết lập nạp quỹ trong tháng này.</p>}

      {!loading && (fund?.recentContributions?.length > 0 || filtered) && (
        <section className="mt-3 rounded-[11px] border border-white/75 bg-white/45 px-2.5 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-3.5 text-forest" />
              <h3 className="text-[10px] font-medium text-ink/65">Nạp quỹ gần đây</h3>
            </div>
            {filtered && <span className="text-[9px] text-ink/35">Theo ngày đã chọn</span>}
          </div>
          <FundContributionList contributions={contributions} currency={currency} onEdit={onEditContribution} onDelete={onDeleteContribution} />
        </section>
      )}

      {!loading && (transactions.length > 0 || filtered) && (
        <section className="mt-3 rounded-[11px] border border-white/75 bg-white/45 px-2.5 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Landmark className="size-3.5 text-coral" />
              <h3 className="text-[10px] font-medium text-ink/65">Chi tiêu quỹ gần đây</h3>
            </div>
            {filtered && <span className="text-[9px] text-ink/35">Theo ngày đã chọn</span>}
          </div>
          {transactions.length ? (
            <div className="mt-1.5 -mx-2.5 overflow-hidden rounded-[10px] bg-paper">
              <TransactionList transactions={transactions} currency={currency} onDelete={onDeleteTransaction} compact groupByDate={groupTransactionsByDate} showTime showMember />
            </div>
          ) : <p className="mt-2.5 rounded-[10px] bg-white/55 px-3 py-4 text-center text-[10px] text-ink/38">Không có chi tiêu quỹ trong ngày đã chọn.</p>}
        </section>
      )}
    </section>
  );
}

function FundContributionList({ contributions, currency, onEdit, onDelete }) {
  if (!contributions.length) {
    return <p className="mt-2.5 rounded-[10px] bg-white/55 px-3 py-4 text-center text-[10px] text-ink/38">Không có khoản nạp quỹ trong ngày đã chọn.</p>;
  }

  return (
    <div className="mt-1.5 -mx-2.5 overflow-hidden rounded-[10px] bg-paper">
      {groupContributionsByDate(contributions).map((group) => (
        <section key={group.date}>
          <div className="flex items-center justify-between gap-4 border-y border-ink/[0.06] bg-ink/[0.035] px-3 py-2 text-[10px] font-medium text-ink/58 first:border-t-0">
            <span>{formatContributionDay(group.date)}</span>
            <span className="text-forest">+{formatMoney(group.total, currency)}</span>
          </div>
          {group.contributions.map((contribution) => (
            <FundContributionRow key={contribution.id} contribution={contribution} currency={currency} onEdit={onEdit} onDelete={onDelete} />
          ))}
        </section>
      ))}
    </div>
  );
}

function FundContributionRow({ contribution, currency, onEdit, onDelete }) {
  const actionWidth = 128;
  const gesture = useRef(null);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (!dragging) setOffset(open ? -actionWidth : 0);
  }, [open, dragging]);

  const finishGesture = () => {
    const current = gesture.current;
    gesture.current = null;
    setDragging(false);
    if (!current) return;
    if (!current.horizontal) {
      if (open) setOpen(false);
      return;
    }
    setOpen(current.currentOffset <= -actionWidth * 0.35);
  };

  const handlePointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffset: open ? -actionWidth : 0,
      currentOffset: open ? -actionWidth : 0,
      horizontal: false,
    };
    setDragging(true);
  };

  const handlePointerMove = (event) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - current.startX;
    const deltaY = event.clientY - current.startY;

    if (!current.horizontal) {
      if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 6) {
        gesture.current = null;
        setDragging(false);
        return;
      }
      if (Math.abs(deltaX) <= 6 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
      current.horizontal = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    event.preventDefault();
    current.currentOffset = Math.round(Math.max(-actionWidth, Math.min(0, current.startOffset + deltaX)));
    setOffset(current.currentOffset);
  };

  const close = () => setOpen(false);

  return (
    <div className="relative overflow-hidden border-b border-ink/[0.06] bg-paper last:border-b-0" data-swipe-row>
      <div
        className={`absolute bottom-px right-[-2px] top-px flex overflow-hidden ${dragging ? '' : 'transition-[clip-path] duration-300 ease-out'}`}
        style={{
          width: `${actionWidth + 2}px`,
          clipPath: `inset(0 0 0 ${Math.max(0, actionWidth + offset)}px)`,
        }}
        aria-hidden={!open && !dragging}
      >
        <button type="button" className="flex w-16 flex-col items-center justify-center gap-1 bg-forest text-[10px] font-medium text-white transition hover:bg-[#255c50]" onClick={() => { close(); onEdit(contribution); }} tabIndex={open ? 0 : -1} aria-label={`Sửa khoản nạp ${formatMoney(contribution.amount, currency)}`}>
          <Pencil className="size-[18px]" />
          Sửa
        </button>
        <button type="button" className="flex w-16 flex-col items-center justify-center gap-1 bg-coral text-[10px] font-medium text-white transition hover:bg-[#d9634b]" onClick={() => { close(); onDelete(contribution); }} tabIndex={open ? 0 : -1} aria-label={`Xóa khoản nạp ${formatMoney(contribution.amount, currency)}`}>
          <Trash2 className="size-[18px]" />
          Xóa
        </button>
      </div>

      <article
        className={`relative z-10 flex w-[calc(100%+2px)] touch-pan-y select-none items-center gap-2.5 bg-paper ${dragging ? '' : 'transition-transform duration-300 ease-out'} py-3`}
        style={{ transform: `translateX(${offset}px)`, willChange: 'transform', backfaceVisibility: 'hidden' }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishGesture}
        onPointerCancel={finishGesture}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') { event.preventDefault(); setOpen(true); }
          if (event.key === 'ArrowRight' || event.key === 'Escape') { event.preventDefault(); setOpen(false); }
        }}
        tabIndex={0}
        aria-label={`Khoản nạp ${contribution.pocket.name}. Vuốt sang trái để sửa hoặc xóa.`}
      >
        <span className="ml-3 grid size-10 shrink-0 place-items-center rounded-xl bg-mint/35 text-forest">
          <Landmark className="size-[18px]" style={{ color: contribution.pocket.color || '#3D7060' }} />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="truncate text-sm font-bold text-ink">{contribution.pocket.name}</h4>
          <p className="mt-0.5 truncate text-xs font-semibold text-ink/38">{contribution.note || 'Nạp quỹ'}</p>
          <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[11px] leading-4 text-ink/42">
            <span className="shrink-0">{formatContributionTime(contribution.createdAt)}</span>
            <span className="size-0.5 shrink-0 rounded-full bg-ink/25" />
            <Avatar user={{ displayName: contribution.displayName, avatarUrl: contribution.avatarUrl }} size="xs" />
            <span className="truncate">{shortDisplayName(contribution.displayName)}</span>
          </div>
        </div>
        <div className="shrink-0 pr-3 text-right sm:pr-4">
          <div className="whitespace-nowrap text-sm font-normal text-[#2D8A72]">+{formatMoney(contribution.amount, currency)}</div>
        </div>
      </article>
    </div>
  );
}

function CashflowCalendar({ month, dailyCashflow, selectedDates, onToggleDate }) {
  const [year, monthNumber] = month.split('-').map(Number);
  const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1));
  const leadingDays = (firstDay.getUTCDay() + 6) % 7;

  return (
    <div className="grid grid-cols-7">
      {Array.from({ length: 42 }, (_, index) => {
        const dayOffset = index - leadingDays + 1;
        const date = new Date(Date.UTC(year, monthNumber - 1, dayOffset));
        const dateKey = date.toISOString().slice(0, 10);
        const inCurrentMonth = date.getUTCMonth() === monthNumber - 1;
        const dayOfWeek = index % 7;
        const cashflow = dailyCashflow[dateKey];
        const isSelected = selectedDates.has(dateKey);
        const backgroundClass = !inCurrentMonth
          ? 'cursor-default bg-ink/[0.018]'
          : isSelected
            ? 'cursor-pointer bg-sun/15 active:bg-sun/20'
            : 'cursor-pointer bg-white/35 active:bg-sun/15';

        return (
          <button
            type="button"
            key={dateKey}
            disabled={!inCurrentMonth}
            aria-label={`${date.getUTCDate()} tháng ${monthNumber}${cashflow ? `, thu ${cashflow.income || 0}, chi ${cashflow.expense || 0}` : ''}`}
            aria-pressed={isSelected}
            onClick={() => onToggleDate(dateKey)}
            className={`relative flex min-h-[40px] flex-col items-stretch justify-start border-b border-r border-ink/[0.06] p-0.5 text-left align-top outline-none focus:shadow-none focus:outline-none focus-visible:shadow-none focus-visible:outline-none transition-colors sm:min-h-[52px] sm:p-1 ${backgroundClass}`}
          >
            <span className={`text-[11px] font-bold sm:text-xs ${!inCurrentMonth ? 'text-ink/20' : dayOfWeek === 5 ? 'text-[#1698bf]' : dayOfWeek === 6 ? 'text-coral' : 'text-ink/60'}`}>{date.getUTCDate()}</span>
            {inCurrentMonth && cashflow && (
              <div className="mt-0.5 grid grid-rows-2 justify-items-end whitespace-nowrap text-[7.5px] font-normal leading-[9px] tracking-[-0.03em] sm:mt-1 sm:text-[9px] sm:leading-[11px]">
                {cashflow.income > 0 && <span className="row-start-1 text-[#2D8A72]">+{formatCalendarAmount(cashflow.income)}</span>}
                {cashflow.expense > 0 && <span className="row-start-2 text-coral">−{formatCalendarAmount(cashflow.expense)}</span>}
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function formatSelectedDate(value) {
  const [, month, day] = value.split('-');
  return `${day}/${month}`;
}

function SummaryItem({ label, value, currency, tone, loading }) {
  const valueColor = tone === 'income' ? 'text-[#1698bf]' : 'text-coral';
  return (
    <div className="min-w-0 border-r border-ink/[0.06] px-1.5 py-2.5 text-center last:border-r-0 sm:px-4 sm:py-3">
      <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-ink/42 sm:text-[11px]">{label}</div>
      {loading ? <Skeleton className="mx-auto mt-2 h-4 w-16" /> : <div className={`mt-1 truncate text-xs font-normal tracking-[-0.02em] sm:text-lg ${valueColor}`}>{formatMoney(value, currency)}</div>}
    </div>
  );
}

function CalendarSkeleton() {
  return (
    <div className="grid grid-cols-7">
      {Array.from({ length: 42 }, (_, index) => <Skeleton key={index} className="min-h-[40px] rounded-none border-b border-r border-white/50 bg-ink/[0.045] sm:min-h-[52px]" />)}
    </div>
  );
}

function formatCalendarAmount(value) {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function flattenFundContributions(batches = [], selectedDateSet = null) {
  return batches
    .flatMap((batch) => batch.contributors.map((contributor) => ({
      ...contributor,
      contributionDate: batch.contributionDate,
      note: contributor.note || batch.note,
      pocket: batch.pocket,
    })))
    .filter((contribution) => !selectedDateSet || selectedDateSet.has(contribution.contributionDate));
}

function groupContributionsByDate(contributions) {
  const groups = [];
  contributions.forEach((contribution) => {
    const current = groups[groups.length - 1];
    if (current?.date === contribution.contributionDate) {
      current.contributions.push(contribution);
      current.total += Number(contribution.amount);
    } else {
      groups.push({ date: contribution.contributionDate, total: Number(contribution.amount), contributions: [contribution] });
    }
  });
  return groups;
}

function formatContributionDay(value) {
  const day = new Date(`${value}T12:00:00`);
  const weekDays = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  return `${day.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })} (${weekDays[day.getDay()]})`;
}

function formatContributionTime(value) {
  if (!value) return '--:--';
  let normalized = String(value).trim().replace(' ', 'T');
  normalized = normalized.replace(/(\.\d{3})\d+/, '$1');
  if (/([+-]\d{4})$/.test(normalized)) {
    normalized = `${normalized.slice(0, -2)}:${normalized.slice(-2)}`;
  } else if (/([+-]\d{2})$/.test(normalized)) {
    normalized = `${normalized}:00`;
  } else if (!/(Z|[+-]\d{2}:\d{2})$/.test(normalized)) {
    normalized += 'Z';
  }
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Ho_Chi_Minh' }).format(date);
}

function shortDisplayName(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  return parts.at(-1) || '';
}
