import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Check, Landmark, LoaderCircle, Pencil, Plus, Users, X } from 'lucide-react';
import PlanModeTabs from '../components/plans/PlanModeTabs.jsx';
import CategoryIcon from '../components/ui/CategoryIcon.jsx';
import Avatar from '../components/ui/Avatar.jsx';
import Modal from '../components/ui/Modal.jsx';
import MonthPicker from '../components/ui/MonthPicker.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useFamilyData } from '../context/FamilyContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import api, { errorMessage } from '../utils/api.js';
import { currentMonth, formatMoney } from '../utils/formatters.js';
import { visibleFundPockets } from '../utils/fund.js';

const pocketColors = ['#3D7060', '#D47A61', '#D29D3A', '#4B83A6', '#7B6D9C', '#5E8B62', '#C45D7A', '#348A86'];

export default function FundPlans() {
  const { family } = useAuth();
  const { familyDetails, getCache, isPersonal, loadFund, prefetchPages, touch } = useFamilyData();
  const { notify } = useToast();
  const [month, setMonth] = useState(currentMonth());
  const initialCache = getCache(`fund:${month}`);
  const [data, setData] = useState(() => initialCache?.data || null);
  const [draftTargets, setDraftTargets] = useState({});
  const [loading, setLoading] = useState(() => !initialCache);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creatorOpen, setCreatorOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newPocket, setNewPocket] = useState({ name: '', color: pocketColors[1] });

  useEffect(() => {
    if (isPersonal) return undefined;
    let active = true;
    const cached = getCache(`fund:${month}`);
    if (cached) {
      setData(cached.data);
      setLoading(false);
    } else {
      setLoading(true);
    }
    loadFund(month)
      .then((entry) => {
        if (!active) return;
        setData(entry?.data || null);
      })
      .catch((error) => active && notify(errorMessage(error), 'error'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [getCache, isPersonal, loadFund, month, notify]);

  const members = familyDetails?.members || [];
  const pockets = visibleFundPockets(data?.pockets);
  const totals = useMemo(() => pockets.reduce((result, pocket) => ({
    target: result.target + Number(pocket.monthlyTarget || 0),
    contributed: result.contributed + Number(pocket.monthlyContributed || 0),
    remaining: result.remaining + Number(pocket.monthlyRemaining || 0),
  }), { target: 0, contributed: 0, remaining: 0 }), [pockets]);

  if (isPersonal) return <Navigate to="/plans" replace />;

  const openEditor = () => {
    setDraftTargets(createTargetDraft(pockets, members));
    setEditing(true);
  };

  const closeEditor = () => {
    setDraftTargets(createTargetDraft(pockets, members));
    setEditing(false);
  };

  const changeMonth = (nextMonth) => {
    if (editing) closeEditor();
    setMonth(nextMonth);
  };

  const saveTargets = async () => {
    const changes = pockets.filter((pocket) => members.some((member) => {
      const current = pocket.memberTargets?.find((item) => item.id === member.id)?.target || 0;
      return current !== Number(draftTargets[pocket.id]?.[member.id] || 0);
    }));
    if (!changes.length) {
      setEditing(false);
      return;
    }

    const invalid = changes.some((pocket) => members.some((member) => {
      const value = Number(draftTargets[pocket.id]?.[member.id] || 0);
      return !Number.isInteger(value) || value < 0 || value > 999999999999;
    }));
    if (invalid) return notify('Chỉ tiêu nạp quỹ không hợp lệ.', 'error');

    setSaving(true);
    try {
      for (const pocket of changes) {
        const memberTargets = members.map((member) => ({
          userId: member.id,
          amount: Number(draftTargets[pocket.id]?.[member.id] || 0),
        }));
        await api.post(`/fund/pockets/${pocket.id}/target`, {
          monthlyTarget: memberTargets.reduce((sum, member) => sum + member.amount, 0),
          members: memberTargets,
        });
      }
      touch();
      const entry = await loadFund(month);
      setData(entry?.data || null);
      void prefetchPages(month);
      setEditing(false);
      notify('Đã cập nhật kế hoạch nạp quỹ.');
    } catch (error) {
      notify(errorMessage(error), 'error');
    } finally {
      setSaving(false);
    }
  };

  const createPocket = async () => {
    if (newPocket.name.trim().length < 2) return notify('Tên quỹ cần ít nhất 2 ký tự.', 'error');
    setCreating(true);
    try {
      const response = await api.post('/fund/pockets', { name: newPocket.name.trim(), color: newPocket.color });
      touch();
      const entry = await loadFund(month);
      const nextData = entry?.data || null;
      setData(nextData);
      setDraftTargets(createTargetDraft(nextData?.pockets || [], members));
      setNewPocket({ name: '', color: pocketColors[(pockets.length + 1) % pocketColors.length] });
      setCreatorOpen(false);
      setEditing(true);
      void prefetchPages(month);
      notify(response.data.message);
    } catch (error) {
      notify(errorMessage(error), 'error');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-3 sm:space-y-4">
      <header className="grid min-h-9 grid-cols-[36px_minmax(0,1fr)_36px] items-center gap-2">
        {editing ? (
          <button type="button" className="grid size-9 place-items-center rounded-[11px] bg-white/80 text-ink/55 shadow-sm transition active:scale-95" onClick={closeEditor} disabled={saving} aria-label="Hủy chỉnh sửa">
            <X className="size-[18px]" strokeWidth={2.2} />
          </button>
        ) : <span />}
        <h1 className="truncate text-center font-editorial text-[21px] font-semibold tracking-[-0.025em] text-ink sm:text-2xl">{editing ? 'Chỉnh sửa quỹ' : 'Kế hoạch nạp quỹ'}</h1>
        <button
          type="button"
          className={`grid size-9 place-items-center rounded-[11px] shadow-sm transition active:scale-95 ${editing ? 'bg-forest text-white' : 'bg-white/80 text-ink/55'}`}
          onClick={editing ? saveTargets : openEditor}
          disabled={saving || loading}
          aria-label={editing ? 'Lưu kế hoạch nạp quỹ' : 'Chỉnh sửa kế hoạch nạp quỹ'}
        >
          {saving ? <LoaderCircle className="size-[18px] animate-spin" /> : editing ? <Check className="size-[19px]" strokeWidth={2.5} /> : <Pencil className="size-[16px]" strokeWidth={2.1} />}
        </button>
      </header>

      {!editing && <PlanModeTabs />}
      <MonthPicker value={month} onChange={changeMonth} dense fullWidth variant="budget" />

      {loading || !data ? <FundPlanSkeleton editing={editing} /> : editing ? (
        <FundPlanEditor
          pockets={pockets}
          members={members}
          currency={family.currency}
          values={draftTargets}
          saving={saving}
          onChange={(pocketId, memberId, value) => setDraftTargets((current) => ({
            ...current,
            [pocketId]: { ...current[pocketId], [memberId]: value },
          }))}
          onAdd={() => setCreatorOpen(true)}
        />
      ) : (
        <>
          <FundPlanSummary totals={totals} currency={family.currency} />
          <FundPlanOverview pockets={pockets} currency={family.currency} onEdit={openEditor} />
        </>
      )}

      <Modal open={creatorOpen} title="Thêm quỹ riêng" onClose={() => { if (!creating) setCreatorOpen(false); }} compact>
        <p className="-mt-1 text-[11px] font-normal leading-5 text-ink/45">Các danh mục chi tiêu đã có sẵn. Chỉ tạo thêm khi gia đình cần một quỹ riêng ngoài danh mục.</p>
        <label className="mt-4 block text-[11px] font-medium text-ink/55">
          Tên quỹ
          <input className="mt-1.5 h-11 w-full rounded-[11px] border border-ink/[0.07] bg-white/65 px-3.5 text-sm font-normal text-ink outline-none focus:border-transparent focus:ring-0" maxLength="30" value={newPocket.name} onChange={(event) => setNewPocket((current) => ({ ...current, name: event.target.value }))} placeholder="Ví dụ: Tiền nhà" autoFocus />
        </label>
        <div className="mt-4">
          <div className="text-[11px] font-medium text-ink/55">Màu nhận diện</div>
          <div className="mt-2 flex flex-wrap gap-2.5">
            {pocketColors.map((color) => <button key={color} type="button" onClick={() => setNewPocket((current) => ({ ...current, color }))} className={`size-8 rounded-[10px] border-[3px] transition active:scale-95 ${newPocket.color === color ? 'border-white shadow-[0_0_0_1px_rgba(32,49,44,0.22)]' : 'border-transparent'}`} style={{ backgroundColor: color }} aria-label={`Chọn màu ${color}`} />)}
          </div>
        </div>
        <button type="button" onClick={createPocket} disabled={creating} className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-forest px-4 text-[12px] font-medium text-white shadow-sm disabled:opacity-50">
          {creating ? <LoaderCircle className="size-4 animate-spin" /> : <Plus className="size-4" />} Tạo quỹ
        </button>
      </Modal>
    </div>
  );
}

function FundPlanSummary({ totals, currency }) {
  const percentage = totals.target > 0 ? Math.min(100, (totals.contributed / totals.target) * 100) : 0;
  return (
    <section className="overflow-hidden rounded-[16px] border border-ink/[0.07] bg-[linear-gradient(135deg,rgba(230,242,237,0.9),rgba(255,250,240,0.9))] px-4 py-3 shadow-card sm:px-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2"><Landmark className="size-4 text-forest" /><h2 className="text-sm font-semibold tracking-[-0.015em] text-ink">Tổng cần nạp</h2></div>
        <span className="shrink-0 whitespace-nowrap text-right text-xs font-medium text-ink/78">{formatMoney(totals.target, currency)}</span>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink/[0.09]"><span className="block h-full rounded-full bg-forest transition-[width] duration-700 ease-out" style={{ width: `${percentage}%` }} /></div>
      <div className="mt-2 flex items-center justify-between gap-3 text-[10px] font-normal text-ink/38">
        <span>Đã nạp: <strong className="font-normal text-ink/62">{formatMoney(totals.contributed, currency)}</strong></span>
        <span className="text-right">Còn thiếu: <strong className="font-normal text-coral">{formatMoney(totals.remaining, currency)}</strong></span>
      </div>
    </section>
  );
}

function FundPlanOverview({ pockets, currency, onEdit }) {
  const planned = pockets.filter((pocket) => pocket.monthlyTarget > 0);
  if (!planned.length) {
    return (
      <section className="rounded-[16px] border border-ink/[0.065] bg-paper/90 px-5 py-8 text-center shadow-card">
        <Landmark className="mx-auto size-7 text-forest/55" />
        <div className="mt-3 text-sm font-medium text-ink">Chưa có kế hoạch nạp quỹ</div>
        <p className="mx-auto mt-1.5 max-w-xs text-[11px] leading-5 text-ink/42">Tạo các quỹ cần nạp và đặt số tiền mỗi thành viên phải đóng hàng tháng.</p>
        <button type="button" className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-[11px] bg-forest px-4 text-xs font-medium text-white shadow-sm" onClick={onEdit}><Pencil className="size-3.5" /> Thiết lập quỹ</button>
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between px-1"><h2 className="text-sm font-semibold tracking-[-0.015em] text-ink">Chi tiết từng quỹ</h2><span className="text-[10px] font-normal text-ink/35">{planned.length} quỹ đã thiết lập</span></div>
      <div className="space-y-2.5">
        {planned.map((pocket, index) => <FundPlanCard key={pocket.id} pocket={pocket} currency={currency} index={index} />)}
      </div>
    </section>
  );
}

function FundPlanCard({ pocket, currency, index }) {
  return (
    <article className="animate-rise-in rounded-[16px] border border-ink/[0.065] bg-paper/90 p-3.5 shadow-card" style={{ animationDelay: `${Math.min(index * 35, 180)}ms` }}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5"><FundPocketIcon pocket={pocket} /><span className="truncate text-sm font-medium text-ink">{pocket.name}</span></div>
        <span className="shrink-0 text-xs font-normal text-ink/72">{formatMoney(pocket.monthlyTarget, currency)}</span>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-ink/[0.09]"><span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${pocket.monthlyPercentage}%`, backgroundColor: pocket.color }} /></div>
      <div className="mt-1.5 flex items-center justify-between text-[10px] font-normal text-ink/38"><span>Đã nạp: {formatMoney(pocket.monthlyContributed, currency)}</span><span className={pocket.monthlyRemaining > 0 ? 'text-coral' : 'text-forest'}>{pocket.monthlyRemaining > 0 ? `Còn ${formatMoney(pocket.monthlyRemaining, currency)}` : 'Đã đủ'}</span></div>
      <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {pocket.memberTargets.map((member) => (
          <div key={member.id} className="grid min-w-0 grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-x-2 rounded-[9px] bg-ink/[0.025] px-2.5 py-2">
            <Avatar user={member} size="xs" />
            <div className="min-w-0 truncate text-[10px] font-normal text-ink/62">{member.displayName}</div>
            <span className={`shrink-0 text-[9px] font-medium ${member.remaining > 0 ? 'text-coral' : 'text-forest'}`}>{member.remaining > 0 ? `Thiếu ${formatMoney(member.remaining, currency)}` : 'Đã đủ'}</span>
            <div className="col-span-2 col-start-2 mt-1 flex items-center justify-between gap-2 text-[9px] font-normal text-ink/35"><span>Đã nạp: {formatMoney(member.contributed, currency)}</span><span className="text-right">Chỉ tiêu: {formatMoney(member.target, currency)}</span></div>
          </div>
        ))}
      </div>
    </article>
  );
}

function FundPlanEditor({ pockets, members, currency, values, saving, onChange, onAdd }) {
  return (
    <section className="space-y-3">
      <div className="rounded-[16px] border border-ink/[0.065] bg-paper/90 px-4 py-3 shadow-card">
        <div className="flex items-center justify-between gap-3"><div><div className="text-sm font-medium text-ink">Chỉ tiêu mỗi tháng</div><p className="mt-0.5 text-[10px] font-normal text-ink/38">Mọi danh mục chi tiêu đều có sẵn; tổng quỹ được tính từ từng thành viên.</p></div><Users className="size-5 shrink-0 text-forest/65" /></div>
      </div>

      {pockets.map((pocket, index) => {
        const total = members.reduce((sum, member) => sum + Number(values[pocket.id]?.[member.id] || 0), 0);
        return (
          <article key={pocket.id} className="animate-rise-in overflow-hidden rounded-[16px] border border-ink/[0.065] bg-paper/90 shadow-card" style={{ animationDelay: `${Math.min(index * 30, 160)}ms` }}>
            <div className="flex items-center justify-between gap-3 border-b border-ink/[0.06] px-3.5 py-3">
              <div className="flex min-w-0 items-center gap-2.5"><FundPocketIcon pocket={pocket} /><span className="truncate text-sm font-medium text-ink">{pocket.name}</span></div>
              <span className="shrink-0 text-xs font-normal text-forest">{formatMoney(total, currency)}</span>
            </div>
            <div className="px-3.5">
              {members.map((member) => (
                <div key={member.id} className="flex min-h-[54px] items-center gap-2.5 border-b border-ink/[0.06] last:border-b-0">
                  <Avatar user={member} size="xs" />
                  <label htmlFor={`fund-target-${pocket.id}-${member.id}`} className="min-w-0 flex-1 truncate text-[11px] font-normal text-ink/62">{member.displayName}</label>
                  <div className="relative w-[132px] shrink-0 border-b border-ink/10">
                    <input id={`fund-target-${pocket.id}-${member.id}`} className="h-9 w-full border-0 bg-transparent pl-1 pr-6 text-right text-sm font-normal tabular-nums text-ink outline-none placeholder:text-xs placeholder:text-ink/25 focus:border-0 focus:ring-0" inputMode="numeric" value={formatInputAmount(values[pocket.id]?.[member.id])} onChange={(event) => onChange(pocket.id, member.id, event.target.value.replace(/\D/g, '').slice(0, 12))} onFocus={(event) => event.currentTarget.select()} placeholder="0" disabled={saving} />
                    <span className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[10px] font-normal text-ink/32">{currency === 'VND' ? '₫' : currency}</span>
                  </div>
                </div>
              ))}
            </div>
          </article>
        );
      })}

      <button type="button" onClick={onAdd} disabled={saving} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[13px] border border-dashed border-forest/25 bg-mint/30 text-[12px] font-medium text-forest transition active:scale-[0.99] disabled:opacity-50"><Plus className="size-4" /> Thêm quỹ riêng</button>
    </section>
  );
}

function FundPlanSkeleton({ editing }) {
  return (
    <div className="space-y-3" aria-label="Đang tải kế hoạch nạp quỹ" role="status">
      <Skeleton className="h-[78px] rounded-[16px]" />
      {Array.from({ length: editing ? 3 : 2 }, (_, index) => <Skeleton key={index} className="h-[138px] rounded-[16px]" />)}
    </div>
  );
}

function createTargetDraft(pockets, members) {
  return Object.fromEntries(pockets.map((pocket) => {
    const currentTargets = new Map((pocket.memberTargets || []).map((member) => [member.id, member.target]));
    return [pocket.id, Object.fromEntries(members.map((member) => [member.id, currentTargets.get(member.id) ? String(currentTargets.get(member.id)) : '']))];
  }));
}

function FundPocketIcon({ pocket }) {
  if (!pocket.category) return <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: pocket.color }} />;
  return <span className="grid size-8 shrink-0 place-items-center rounded-[10px]" style={{ color: pocket.category.color, backgroundColor: `${pocket.category.color}14` }}><CategoryIcon name={pocket.category.icon} className="size-[17px]" strokeWidth={2.15} /></span>;
}

function formatInputAmount(value) {
  if (!value) return '';
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(Number(value));
}
