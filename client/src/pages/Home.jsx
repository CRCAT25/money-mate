import { useEffect, useMemo, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import MonthPicker from '../components/ui/MonthPicker.jsx';
import Skeleton, { TransactionListSkeleton } from '../components/ui/Skeleton.jsx';
import TransactionList from '../components/TransactionList.jsx';
import ConfirmModal from '../components/ui/ConfirmModal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useFamilyData } from '../context/FamilyContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import api, { errorMessage } from '../utils/api.js';
import { currentMonth, formatMoney } from '../utils/formatters.js';

const weekDays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export default function Home() {
  const { family } = useAuth();
  const { touch, loadCache, loading: baseLoading, isPersonal } = useFamilyData();
  const { notify } = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (baseLoading) return undefined;

    let active = true;
    setLoading(true);

    const homeRequest = loadCache(`home:${month}`, async () => {
      const [summaryResponse, transactionResponse] = await Promise.all([
        api.get('/reports/summary', { params: { month } }),
        api.get('/transactions', { params: { month, limit: 200 } }),
      ]);
      return { summary: summaryResponse.data, transactions: transactionResponse.data };
    });

    // Warm the other menu screens while Home is visible. Shared in-flight requests
    // prevent duplicate calls if the user opens a menu before preloading finishes.
    loadCache(`plans:${month}`, async () => {
      const { data } = await api.get('/budgets', { params: { month } });
      return { data };
    }).catch(() => {});
    loadCache(`reports:${month}::`, async () => {
      const [homeData, trendResponse] = await Promise.all([
        homeRequest,
        api.get('/reports/trend', { params: { endMonth: month, months: 6 } }),
      ]);
      return {
        data: {
          summary: homeData.summary,
          trend: trendResponse.data,
          transactions: homeData.transactions,
        },
      };
    }).catch(() => {});

    homeRequest.then((nextData) => {
      if (!active) return;
      setSummary(nextData.summary);
      setTransactions(nextData.transactions);
    }).catch((error) => active && notify(errorMessage(error), 'error'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [month, notify, loadCache, baseLoading]);

  const dailyCashflow = useMemo(() => transactions.reduce((totals, transaction) => {
    const day = totals[transaction.transactionDate] || { income: 0, expense: 0 };
    day[transaction.type] += Number(transaction.amount);
    totals[transaction.transactionDate] = day;
    return totals;
  }, {}), [transactions]);

  const remove = async (transaction) => {
    setDeleting(true);
    try {
      await api.delete(`/transactions/${transaction.id}`);
      setTransactions((current) => current.filter((item) => item.id !== transaction.id));
      setDeleteTarget(null);
      notify('Đã xóa giao dịch.');
      touch();
    } catch (error) {
      notify(errorMessage(error), 'error');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="fixed inset-x-0 top-[env(safe-area-inset-top)] z-30 flex h-12 items-center bg-cream/90 px-4 backdrop-blur-xl sm:px-7 lg:static lg:h-auto lg:bg-transparent lg:px-0 lg:backdrop-blur-none">
        <MonthPicker value={month} onChange={setMonth} dense fullWidth variant="budget" />
      </div>

      <section className="overflow-hidden rounded-[18px] border border-ink/[0.07] bg-paper/90 shadow-card">
        <div className="grid grid-cols-7 border-b border-ink/[0.07] bg-ink/[0.035]">
          {weekDays.map((day, index) => (
            <div key={day} className={`py-1.5 text-center text-[10px] font-semibold ${index === 5 ? 'text-[#1698bf]' : index === 6 ? 'text-coral' : 'text-ink/45'}`}>{day}</div>
          ))}
        </div>
        {loading ? <CalendarSkeleton /> : <CashflowCalendar month={month} dailyCashflow={dailyCashflow} />}
        <div className="grid grid-cols-3 border-t border-ink/[0.07] bg-white/55">
          <SummaryItem label="Thu nhập" value={summary?.income} currency={family.currency} tone="income" loading={loading} />
          <SummaryItem label="Chi tiêu" value={summary?.expense} currency={family.currency} tone="expense" loading={loading} />
          <SummaryItem label="Còn lại" value={summary?.balance} currency={family.currency} tone={summary?.balance >= 0 ? 'income' : 'expense'} loading={loading} />
        </div>
      </section>

      <section className="overflow-hidden rounded-[18px] border border-ink/[0.06] bg-paper/90 p-3.5 shadow-card sm:p-5">
        <div className="mb-2 flex items-center">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-5 text-forest" />
            <h2 className="whitespace-nowrap text-base font-bold tracking-[-0.02em] text-ink sm:text-xl">Giao dịch gần đây</h2>
          </div>
        </div>
        {loading ? <TransactionListSkeleton compact /> : <TransactionList transactions={transactions.slice(0, 10)} currency={family.currency} onDelete={setDeleteTarget} compact groupByDate showTime showMember={!isPersonal} />}
      </section>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Xóa giao dịch?"
        description={deleteTarget ? `Giao dịch “${deleteTarget.category.name}” sẽ bị xóa khỏi lịch sử và báo cáo của gia đình.` : ''}
        confirmLabel="Xóa giao dịch"
        loading={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => remove(deleteTarget)}
      />
    </div>
  );
}

function CashflowCalendar({ month, dailyCashflow }) {
  const [year, monthNumber] = month.split('-').map(Number);
  const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1));
  const leadingDays = (firstDay.getUTCDay() + 6) % 7;
  const today = new Date();
  const todayKey = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())).toISOString().slice(0, 10);

  return (
    <div className="grid grid-cols-7">
      {Array.from({ length: 42 }, (_, index) => {
        const dayOffset = index - leadingDays + 1;
        const date = new Date(Date.UTC(year, monthNumber - 1, dayOffset));
        const dateKey = date.toISOString().slice(0, 10);
        const inCurrentMonth = date.getUTCMonth() === monthNumber - 1;
        const dayOfWeek = index % 7;
        const cashflow = dailyCashflow[dateKey];
        const isToday = dateKey === todayKey;

        return (
          <div
            key={dateKey}
            className={`relative min-h-[40px] border-b border-r border-ink/[0.06] p-0.5 sm:min-h-[52px] sm:p-1 ${inCurrentMonth ? 'bg-white/35' : 'bg-ink/[0.018]'} ${isToday ? 'bg-sun/15' : ''}`}
          >
            <span className={`text-[11px] font-bold sm:text-xs ${!inCurrentMonth ? 'text-ink/20' : dayOfWeek === 5 ? 'text-[#1698bf]' : dayOfWeek === 6 ? 'text-coral' : 'text-ink/60'}`}>{date.getUTCDate()}</span>
            {inCurrentMonth && cashflow && (
              <div className="mt-0.5 flex flex-col items-end whitespace-nowrap text-[6.5px] font-normal leading-[8px] tracking-[-0.03em] sm:mt-1 sm:text-[8px] sm:leading-[10px]">
                {cashflow.income > 0 && <span className="text-[#2D8A72]">+{formatCalendarAmount(cashflow.income)}</span>}
                {cashflow.expense > 0 && <span className="text-coral">−{formatCalendarAmount(cashflow.expense)}</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
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
