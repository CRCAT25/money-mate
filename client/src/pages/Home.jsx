import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Plus, TrendingDown, Wallet } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import MonthPicker from '../components/ui/MonthPicker.jsx';
import Skeleton, { ChartSkeleton, TransactionListSkeleton } from '../components/ui/Skeleton.jsx';
import TransactionList from '../components/TransactionList.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useFamilyData } from '../context/FamilyContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import api, { errorMessage } from '../utils/api.js';
import { compactMoney, currentMonth, formatMoney } from '../utils/formatters.js';

export default function Home() {
  const { user, family } = useAuth();
  const { revision } = useFamilyData();
  const { notify } = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [summary, setSummary] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      api.get('/reports/summary', { params: { month } }),
      api.get('/transactions', { params: { month, limit: 10 } }),
    ]).then(([summaryResponse, transactionResponse]) => {
      if (!active) return;
      setSummary(summaryResponse.data);
      setTransactions(transactionResponse.data);
    }).catch((error) => active && notify(errorMessage(error), 'error'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [month, revision, notify]);

  const expenseCategories = useMemo(() => summary?.categories.filter((item) => item.type === 'expense') || [], [summary]);
  const hour = new Date().getHours();
  const greeting = hour < 11 ? 'Chào buổi sáng' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.17em] text-coral">{greeting}, {user.displayName}</p>
          <h1 className="font-editorial text-4xl font-semibold tracking-[-0.03em] text-ink sm:text-5xl">Nhà mình hôm nay.</h1>
        </div>
        <MonthPicker value={month} onChange={setMonth} compact />
      </div>

      <section className="relative overflow-hidden rounded-[32px] bg-ink p-6 text-white shadow-soft sm:p-8 lg:p-10">
        <div className="absolute -right-16 -top-24 size-72 rounded-full bg-forest blur-2xl" />
        <div className="absolute bottom-[-60%] left-[32%] size-80 rounded-full bg-coral/20 blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-white/45"><Wallet className="size-4 text-sun" /> Số dư trong tháng</div>
            {loading ? <Skeleton className="mt-5 h-12 w-64 max-w-full bg-white/10" /> : <div className="mt-3 font-editorial text-[46px] font-bold leading-none tracking-[-0.03em] sm:text-6xl">{formatMoney(summary?.balance, family.currency)}</div>}
            <p className="mt-4 max-w-lg text-sm leading-6 text-white/48">Thu nhập trừ chi tiêu của tháng đã chọn. Khoản tiết kiệm được tính như một mục chi để phản ánh đúng dòng tiền thực tế.</p>
          </div>
          <div className="flex gap-3">
            <Link to="/add?type=expense" className="flex min-h-12 items-center gap-2 rounded-2xl bg-white px-4 text-sm font-extrabold text-ink transition hover:-translate-y-0.5"><Plus className="size-4" /> Ghi khoản chi</Link>
            <Link to="/add?type=income" className="grid size-12 place-items-center rounded-2xl border border-white/15 bg-white/10 text-white transition hover:bg-white/15" aria-label="Thêm khoản thu"><ArrowDownLeft className="size-5" /></Link>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        <MetricCard label="Tổng thu" value={summary?.income} currency={family.currency} icon={ArrowDownLeft} tone="green" loading={loading} />
        <MetricCard label="Tổng chi" value={summary?.expense} currency={family.currency} icon={ArrowUpRight} tone="coral" loading={loading} />
        <MetricCard label="Giao dịch" value={summary?.transactionCount || 0} icon={TrendingDown} loading={loading} plain />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-[30px] border border-ink/[0.06] bg-paper/85 p-5 shadow-card sm:p-7">
          <div className="mb-2 flex items-center justify-between">
            <div><p className="mb-2 text-xs font-extrabold uppercase tracking-[0.15em] text-ink/35">Mới nhất</p><h2 className="section-title">Giao dịch gần đây</h2></div>
            <Link to="/reports" className="flex items-center gap-1 text-sm font-extrabold text-forest">Xem tất cả <ArrowRight className="size-4" /></Link>
          </div>
          {loading ? <TransactionListSkeleton compact /> : <TransactionList transactions={transactions} currency={family.currency} compact />}
        </div>

        <div className="rounded-[30px] border border-ink/[0.06] bg-paper/85 p-5 shadow-card sm:p-7">
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.15em] text-ink/35">Theo danh mục</p>
          <h2 className="section-title">Chi tiêu đi đâu?</h2>
          {loading ? <ChartSkeleton type="pie" /> : expenseCategories.length ? (
            <>
              <div className="relative mx-auto mt-3 h-56 max-w-xs">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart><Pie data={expenseCategories} dataKey="amount" nameKey="name" innerRadius={62} outerRadius={88} paddingAngle={3} stroke="none">{expenseCategories.map((item) => <Cell key={item.id} fill={item.color} />)}</Pie><Tooltip formatter={(value) => formatMoney(value, family.currency)} contentStyle={{ borderRadius: 16, border: 'none', boxShadow: '0 8px 30px rgba(23,54,47,.12)', fontSize: 12 }} /></PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 grid place-items-center text-center"><div><div className="text-[11px] font-bold uppercase tracking-wider text-ink/35">Tổng chi</div><div className="mt-1 text-lg font-extrabold text-ink">{compactMoney(summary.expense, family.currency)}</div></div></div>
              </div>
              <div className="mt-2 space-y-3">{expenseCategories.slice(0, 4).map((item) => <div key={item.id} className="flex items-center gap-3 text-sm"><span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} /><span className="flex-1 truncate font-bold text-ink/65">{item.name}</span><span className="font-extrabold text-ink">{compactMoney(item.amount, family.currency)}</span></div>)}</div>
            </>
          ) : <div className="grid h-64 place-items-center text-center text-sm text-ink/40">Chưa có khoản chi trong tháng này.</div>}
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value, currency, icon: Icon, tone, loading, plain }) {
  const colors = tone === 'green' ? 'bg-mint text-forest' : tone === 'coral' ? 'bg-coral/10 text-coral' : 'bg-sun/25 text-[#9a6b0a]';
  return <div className="flex items-center gap-4 rounded-[24px] border border-ink/[0.06] bg-white/65 p-5 shadow-sm"><span className={`grid size-12 place-items-center rounded-[17px] ${colors}`}><Icon className="size-5" /></span><div><div className="text-xs font-bold uppercase tracking-[0.12em] text-ink/35">{label}</div>{loading ? <Skeleton className="mt-2 h-6 w-28" /> : <div className="mt-1 text-lg font-extrabold text-ink">{plain ? value : formatMoney(value, currency)}</div>}</div></div>;
}
