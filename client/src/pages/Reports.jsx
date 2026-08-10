import { useEffect, useMemo, useState } from 'react';
import { BarChart3, Download, Filter, TrendingDown, TrendingUp, Wallet } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import MonthPicker from '../components/ui/MonthPicker.jsx';
import Skeleton, { ChartSkeleton, TransactionListSkeleton } from '../components/ui/Skeleton.jsx';
import TransactionList from '../components/TransactionList.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useFamilyData } from '../context/FamilyContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import api, { errorMessage } from '../utils/api.js';
import { compactMoney, currentMonth, formatMoney } from '../utils/formatters.js';

export default function Reports() {
  const { family } = useAuth();
  const { categories, familyDetails, revision, touch, loading: baseLoading } = useFamilyData();
  const { notify } = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [type, setType] = useState('expense');
  const [categoryId, setCategoryId] = useState('');
  const [memberId, setMemberId] = useState('');
  const [data, setData] = useState({ summary: null, trend: [], transactions: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true; setLoading(true);
    const transactionParams = { month, limit: 200 };
    if (categoryId) transactionParams.categoryId = categoryId;
    if (memberId) transactionParams.memberId = memberId;
    const summaryParams = { month };
    if (memberId) summaryParams.memberId = memberId;
    Promise.all([
      api.get('/reports/summary', { params: summaryParams }),
      api.get('/reports/trend', { params: { endMonth: month, months: 6 } }),
      api.get('/transactions', { params: transactionParams }),
    ]).then(([summary, trend, transactions]) => active && setData({ summary: summary.data, trend: trend.data, transactions: transactions.data }))
      .catch((error) => notify(errorMessage(error), 'error'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [month, memberId, categoryId, revision, notify]);

  const chartCategories = useMemo(() => data.summary?.categories.filter((item) => item.type === type) || [], [data.summary, type]);
  const trend = data.trend.map((item) => ({ ...item, label: `T${Number(item.month.slice(5))}` }));
  const contentLoading = loading || baseLoading;

  const remove = async (transaction) => {
    if (!window.confirm(`Xóa giao dịch ${transaction.category.name}?`)) return;
    try { await api.delete(`/transactions/${transaction.id}`); notify('Đã xóa giao dịch.'); touch(); }
    catch (error) { notify(errorMessage(error), 'error'); }
  };
  const exportCsv = async () => {
    try {
      const response = await api.get('/reports/export', { params: { month }, responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a'); link.href = url; link.download = `moneymate-${month}.csv`; link.click(); URL.revokeObjectURL(url);
      notify('Đã xuất báo cáo CSV.');
    } catch (error) { notify(errorMessage(error), 'error'); }
  };

  return (
    <div className="space-y-7">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div><p className="mb-2 text-xs font-extrabold uppercase tracking-[0.17em] text-coral">Nhìn lại để đi xa hơn</p><h1 className="font-editorial text-4xl font-semibold tracking-[-0.03em] text-ink sm:text-5xl">Báo cáo dòng tiền.</h1></div>
        <div className="flex flex-col gap-3 sm:flex-row"><MonthPicker value={month} onChange={setMonth} compact /><button className="secondary-button" onClick={exportCsv}><Download className="size-4" /> Xuất CSV</button></div>
      </div>

      <section className="grid gap-4 sm:grid-cols-3">
        <ReportMetric title="Thu nhập" value={data.summary?.income} currency={family.currency} icon={TrendingUp} color="text-[#258C68] bg-mint" loading={contentLoading} />
        <ReportMetric title="Chi tiêu" value={data.summary?.expense} currency={family.currency} icon={TrendingDown} color="text-coral bg-coral/10" loading={contentLoading} />
        <ReportMetric title="Còn lại" value={data.summary?.balance} currency={family.currency} icon={Wallet} color="text-[#9a6b0a] bg-sun/25" loading={contentLoading} />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-[30px] border border-ink/[0.06] bg-paper/85 p-5 shadow-card sm:p-7">
          <div className="flex items-start justify-between gap-3"><div><p className="mb-2 text-xs font-extrabold uppercase tracking-[0.15em] text-ink/35">6 tháng gần nhất</p><h2 className="section-title">Nhịp thu và chi</h2></div><BarChart3 className="size-6 text-forest" /></div>
          {contentLoading ? <ChartSkeleton /> : (
            <>
              <div className="mt-7 h-72">
                <ResponsiveContainer width="100%" height="100%"><BarChart data={trend} barGap={4}><CartesianGrid vertical={false} stroke="#17362f" strokeOpacity={0.07} /><XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#17362f77', fontSize: 12, fontWeight: 700 }} /><YAxis hide /><Tooltip formatter={(value) => formatMoney(value, family.currency)} contentStyle={{ borderRadius: 16, border: 'none', boxShadow: '0 8px 30px rgba(23,54,47,.12)', fontSize: 12 }} /><Bar dataKey="income" name="Thu" fill="#4A8F8B" radius={[8, 8, 2, 2]} maxBarSize={22} /><Bar dataKey="expense" name="Chi" fill="#F2735B" radius={[8, 8, 2, 2]} maxBarSize={22} /></BarChart></ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-6 text-xs font-bold text-ink/50"><span className="flex items-center gap-2"><i className="size-2.5 rounded-full bg-[#4A8F8B]" />Thu nhập</span><span className="flex items-center gap-2"><i className="size-2.5 rounded-full bg-coral" />Chi tiêu</span></div>
            </>
          )}
        </div>

        <div className="rounded-[30px] border border-ink/[0.06] bg-paper/85 p-5 shadow-card sm:p-7">
          <div className="flex items-start justify-between gap-3"><div><p className="mb-2 text-xs font-extrabold uppercase tracking-[0.15em] text-ink/35">Cơ cấu tháng này</p><h2 className="section-title">Theo từng danh mục</h2></div><div className="flex rounded-xl bg-ink/[0.05] p-1">{[['expense', 'Chi'], ['income', 'Thu']].map(([value, label]) => <button key={value} onClick={() => { setType(value); setCategoryId(''); }} className={`min-h-9 rounded-lg px-3 text-xs font-extrabold ${type === value ? 'bg-white text-ink shadow-sm' : 'text-ink/40'}`}>{label}</button>)}</div></div>
          {contentLoading ? <ChartSkeleton type="pie" /> : chartCategories.length ? <div className="mt-4 grid items-center sm:grid-cols-[220px_1fr]"><div className="relative h-56"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={chartCategories} dataKey="amount" innerRadius={55} outerRadius={84} paddingAngle={3} stroke="none">{chartCategories.map((item) => <Cell key={item.id} fill={item.color} />)}</Pie><Tooltip formatter={(value) => formatMoney(value, family.currency)} contentStyle={{ borderRadius: 16, border: 'none', fontSize: 12 }} /></PieChart></ResponsiveContainer></div><div className="space-y-3">{chartCategories.slice(0, 6).map((item) => <div key={item.id} className="flex items-center gap-3 text-sm"><span className="size-2.5 rounded-full" style={{ backgroundColor: item.color }} /><span className="flex-1 truncate font-bold text-ink/60">{item.name}</span><span className="font-extrabold text-ink">{compactMoney(item.amount, family.currency)}</span></div>)}</div></div> : <div className="grid h-64 place-items-center text-sm font-semibold text-ink/35">Chưa có dữ liệu cho phần này.</div>}
        </div>
      </section>

      <section className="rounded-[30px] border border-ink/[0.06] bg-paper/85 p-5 shadow-card sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="mb-2 text-xs font-extrabold uppercase tracking-[0.15em] text-ink/35">Chi tiết</p><h2 className="section-title">Tất cả giao dịch</h2></div>
          {baseLoading ? <div className="grid gap-2 sm:grid-cols-2"><Skeleton className="h-12 w-44 rounded-2xl" /><Skeleton className="h-12 w-44 rounded-2xl" /></div> : <div className="grid gap-2 sm:grid-cols-2 lg:flex"><label className="relative"><Filter className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink/35" /><select className="field min-w-44 pl-9 text-sm" value={memberId} onChange={(e) => setMemberId(e.target.value)}><option value="">Cả hai thành viên</option>{familyDetails?.members.map((member) => <option value={member.id} key={member.id}>{member.displayName}</option>)}</select></label><select className="field min-w-44 text-sm" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}><option value="">Mọi danh mục</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name} ({category.type === 'expense' ? 'Chi' : 'Thu'})</option>)}</select></div>}
        </div>
        <div className="mt-4">{contentLoading ? <TransactionListSkeleton rows={5} /> : <TransactionList transactions={data.transactions} currency={family.currency} onDelete={remove} />}</div>
      </section>
    </div>
  );
}

function ReportMetric({ title, value, currency, icon: Icon, color, loading }) {
  return <div className="flex items-center gap-4 rounded-[24px] border border-ink/[0.06] bg-white/65 p-5 shadow-sm"><span className={`grid size-12 place-items-center rounded-[17px] ${color}`}><Icon className="size-5" /></span><div><div className="text-xs font-extrabold uppercase tracking-[0.12em] text-ink/35">{title}</div>{loading ? <Skeleton className="mt-2 h-6 w-28" /> : <div className="mt-1 text-xl font-extrabold text-ink">{formatMoney(value, currency)}</div>}</div></div>;
}
