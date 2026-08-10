import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays } from 'lucide-react';
import MonthPicker from '../components/ui/MonthPicker.jsx';
import Skeleton, { TransactionListSkeleton } from '../components/ui/Skeleton.jsx';
import TransactionList from '../components/TransactionList.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useFamilyData } from '../context/FamilyContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import api, { errorMessage } from '../utils/api.js';
import { currentMonth, formatMoney } from '../utils/formatters.js';

const weekDays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

export default function Home() {
  const { family } = useAuth();
  const { revision, getCache, setCache } = useFamilyData();
  const { notify } = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cacheKey = `home:${month}`;
    const cached = getCache(cacheKey);
    if (cached?.revision === revision) {
      setSummary(cached.summary);
      setTransactions(cached.transactions);
      setLoading(false);
      return undefined;
    }

    let active = true;
    setLoading(true);
    Promise.all([
      api.get('/reports/summary', { params: { month } }),
      api.get('/transactions', { params: { month, limit: 200 } }),
    ]).then(([summaryResponse, transactionResponse]) => {
      if (!active) return;
      const nextData = { summary: summaryResponse.data, transactions: transactionResponse.data };
      setSummary(nextData.summary);
      setTransactions(nextData.transactions);
      setCache(cacheKey, { ...nextData, revision });
    }).catch((error) => active && notify(errorMessage(error), 'error'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [month, revision, notify, getCache, setCache]);

  const dailyExpenses = useMemo(() => transactions.reduce((totals, transaction) => {
    if (transaction.type === 'expense') {
      totals[transaction.transactionDate] = (totals[transaction.transactionDate] || 0) + Number(transaction.amount);
    }
    return totals;
  }, {}), [transactions]);

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="fixed inset-x-0 top-[env(safe-area-inset-top)] z-30 flex h-12 items-center justify-center bg-cream/90 backdrop-blur-xl lg:static lg:h-auto lg:bg-transparent lg:backdrop-blur-none">
        <MonthPicker value={month} onChange={setMonth} dense fullWidth />
      </div>

      <section className="overflow-hidden rounded-[28px] border border-ink/[0.07] bg-paper/90 shadow-card">
        <div className="grid grid-cols-7 border-b border-ink/[0.07] bg-ink/[0.035]">
          {weekDays.map((day, index) => (
            <div key={day} className={`py-2 text-center text-[10px] font-extrabold ${index === 5 ? 'text-[#1698bf]' : index === 6 ? 'text-coral' : 'text-ink/45'}`}>{day}</div>
          ))}
        </div>
        {loading ? <CalendarSkeleton /> : <CashflowCalendar month={month} dailyExpenses={dailyExpenses} />}
        <div className="grid grid-cols-3 border-t border-ink/[0.07] bg-white/55">
          <SummaryItem label="Thu nhập" value={summary?.income} currency={family.currency} tone="income" loading={loading} />
          <SummaryItem label="Chi tiêu" value={summary?.expense} currency={family.currency} tone="expense" loading={loading} />
          <SummaryItem label="Còn lại" value={summary?.balance} currency={family.currency} tone={summary?.balance >= 0 ? 'income' : 'expense'} loading={loading} />
        </div>
      </section>

      <section className="rounded-[28px] border border-ink/[0.06] bg-paper/90 p-4 shadow-card sm:p-6">
        <div className="mb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-5 text-forest" />
            <h2 className="whitespace-nowrap text-lg font-extrabold tracking-[-0.02em] text-ink sm:text-2xl">Giao dịch gần đây</h2>
          </div>
          <Link to="/reports" className="flex min-h-10 shrink-0 items-center gap-1 whitespace-nowrap text-xs font-extrabold text-forest sm:text-sm">Xem tất cả <ArrowRight className="size-4" /></Link>
        </div>
        {loading ? <TransactionListSkeleton compact /> : <TransactionList transactions={transactions.slice(0, 10)} currency={family.currency} compact />}
      </section>
    </div>
  );
}

function CashflowCalendar({ month, dailyExpenses }) {
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
        const expense = dailyExpenses[dateKey];
        const isToday = dateKey === todayKey;

        return (
          <div
            key={dateKey}
            className={`relative min-h-[48px] border-b border-r border-ink/[0.06] p-1 sm:min-h-[62px] sm:p-1.5 ${inCurrentMonth ? 'bg-white/35' : 'bg-ink/[0.018]'} ${isToday ? 'bg-sun/15' : ''}`}
          >
            <span className={`text-[11px] font-bold sm:text-xs ${!inCurrentMonth ? 'text-ink/20' : dayOfWeek === 5 ? 'text-[#1698bf]' : dayOfWeek === 6 ? 'text-coral' : 'text-ink/60'}`}>{date.getUTCDate()}</span>
            {inCurrentMonth && expense > 0 && <div className="mt-1.5 truncate text-right text-[9px] font-extrabold text-coral sm:mt-2 sm:text-[11px]">{formatCalendarAmount(expense)}</div>}
          </div>
        );
      })}
    </div>
  );
}

function SummaryItem({ label, value, currency, tone, loading }) {
  const valueColor = tone === 'income' ? 'text-[#1698bf]' : 'text-coral';
  return (
    <div className="min-w-0 border-r border-ink/[0.06] px-1.5 py-3 text-center last:border-r-0 sm:px-4 sm:py-4">
      <div className="text-[9px] font-bold uppercase tracking-[0.08em] text-ink/42 sm:text-[11px]">{label}</div>
      {loading ? <Skeleton className="mx-auto mt-2 h-4 w-16" /> : <div className={`mt-1 truncate text-xs font-black tracking-[-0.03em] sm:text-lg ${valueColor}`}>{formatMoney(value, currency)}</div>}
    </div>
  );
}

function CalendarSkeleton() {
  return (
    <div className="grid grid-cols-7">
      {Array.from({ length: 42 }, (_, index) => <Skeleton key={index} className="min-h-[48px] rounded-none border-b border-r border-white/50 bg-ink/[0.045] sm:min-h-[62px]" />)}
    </div>
  );
}

function formatCalendarAmount(value) {
  const compact = (amount) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(amount);
  if (value >= 1_000_000_000) return `${compact(value / 1_000_000_000)}tỷ`;
  if (value >= 1_000_000) return `${compact(value / 1_000_000)}tr`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}
