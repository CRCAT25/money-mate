import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AlertCircle, Check, ExternalLink, LoaderCircle, Pencil, Plus, RefreshCw, ShoppingBasket, Sparkles, Trash2, WalletCards } from 'lucide-react';
import PlanModeTabs from '../components/plans/PlanModeTabs.jsx';
import CategoryIcon from '../components/ui/CategoryIcon.jsx';
import ConfirmModal from '../components/ui/ConfirmModal.jsx';
import Modal from '../components/ui/Modal.jsx';
import MonthPicker from '../components/ui/MonthPicker.jsx';
import MoneyInput from '../components/ui/MoneyInput.jsx';
import Skeleton from '../components/ui/Skeleton.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useFamilyData } from '../context/FamilyContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import api, { errorMessage } from '../utils/api.js';
import { currentMonth, formatMoney } from '../utils/formatters.js';
import { shoppingEstimateJobStore } from '../utils/aiJobStore.js';

const emptyDraft = { name: '', quantity: '1', unit: '', plannedUnitPrice: '', categoryId: '', categoryName: '', notes: '' };

export default function Shopping() {
  const { family, activeSpaceId } = useAuth();
  const { categories, getCache, setCache, loadCache, touch, isPersonal } = useFamilyData();
  const { notify } = useToast();
  const [month, setMonth] = useState(currentMonth());
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applyingId, setApplyingId] = useState(null);
  const [refreshingId, setRefreshingId] = useState(null);
  const [editingItem, setEditingItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const estimateJob = useSyncExternalStore(
    shoppingEstimateJobStore.subscribe,
    shoppingEstimateJobStore.getSnapshot,
    shoppingEstimateJobStore.getSnapshot,
  );
  const appliedEstimateRef = useRef(null);
  const expenseCategories = categories.filter((category) => category.type === 'expense');
  const cacheKey = `shopping:${month}`;
  const estimate = estimateJob.payload?.spaceId === activeSpaceId && estimateJob.status === 'success'
    ? estimateJob.result
    : null;
  const estimateError = estimateJob.payload?.spaceId === activeSpaceId && estimateJob.status === 'error'
    ? errorMessage(estimateJob.error)
    : '';
  const estimating = estimateJob.payload?.spaceId === activeSpaceId && estimateJob.status === 'running';

  useEffect(() => {
    if (estimateJob.payload?.spaceId && estimateJob.payload.spaceId !== activeSpaceId) {
      shoppingEstimateJobStore.clear();
    }
  }, [activeSpaceId, estimateJob.payload?.spaceId]);

  useEffect(() => {
    if (estimateJob.status !== 'success' || estimateJob.payload?.spaceId !== activeSpaceId || !estimateJob.result) return;
    if (appliedEstimateRef.current === estimateJob.finishedAt) return;
    appliedEstimateRef.current = estimateJob.finishedAt;
    const data = estimateJob.result;
    const suggested = findCategory(expenseCategories, data.categoryName);
    setDraft((current) => {
      const query = estimateJob.payload?.query?.trim();
      if (current.name.trim() && current.name.trim() !== query) return current;
      return {
        ...current,
        name: data.normalizedName || current.name,
        quantity: String(data.quantity || current.quantity),
        unit: data.unit || current.unit,
        plannedUnitPrice: String(data.recommendedPrice),
        categoryId: suggested?.id || current.categoryId,
        categoryName: suggested?.name || data.categoryName || current.categoryName,
      };
    });
  }, [activeSpaceId, estimateJob, expenseCategories]);

  useEffect(() => {
    let active = true;
    const cached = getCache(cacheKey);
    if (cached) {
      setItems(cached.data.items || []);
      setLoading(false);
    } else setLoading(true);
    loadCache(cacheKey, async () => {
      const { data } = await api.get('/shopping', { params: { month } });
      return { data };
    }).then((entry) => {
      if (active) setItems(entry.data.items || []);
    }).catch((error) => active && notify(errorMessage(error), 'error'))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [cacheKey, getCache, loadCache, month, notify]);

  const updateDraft = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  const selectCategory = (categoryId, target = 'draft') => {
    const category = expenseCategories.find((item) => item.id === categoryId);
    if (target === 'edit') setEditingItem((current) => ({ ...current, category: category || null }));
    else setDraft((current) => ({ ...current, categoryId, categoryName: category?.name || '' }));
  };

  const estimatePrice = async () => {
    if (!draft.name.trim()) return notify('Hãy nhập món cần mua trước.', 'error');
    if (!Number(draft.quantity) || Number(draft.quantity) < 1) return notify('Số lượng không hợp lệ.', 'error');
    const payload = { query: draft.name.trim(), quantity: Number(draft.quantity), unit: draft.unit.trim() || null };
    shoppingEstimateJobStore.start({
      payload: { ...payload, spaceId: activeSpaceId },
      run: async () => {
        const { data } = await api.post('/shopping/estimate', payload, { timeout: 32000 });
        return data;
      },
    }).catch((error) => notify(errorMessage(error), 'error'));
  };

  const saveNewItem = async (event) => {
    event.preventDefault();
    const quantity = Number(draft.quantity);
    const plannedUnitPrice = Number(draft.plannedUnitPrice || 0);
    if (!draft.name.trim() || !Number.isInteger(quantity) || quantity < 1) return notify('Vui lòng nhập tên và số lượng hợp lệ.', 'error');
    if (!draft.categoryId) return notify('Vui lòng chọn danh mục trước khi lưu.', 'error');
    if (!Number.isInteger(plannedUnitPrice) || plannedUnitPrice < 0) return notify('Giá dự kiến không hợp lệ.', 'error');
    setSaving(true);
    try {
      await api.post('/shopping', {
        month, name: draft.name.trim(), quantity, unit: draft.unit.trim() || null,
        plannedUnitPrice, plannedTotal: plannedUnitPrice * quantity,
        categoryId: draft.categoryId || null, categoryName: draft.categoryName || null, notes: draft.notes.trim() || null,
      });
      await reloadItems();
      setDraft(emptyDraft);
      shoppingEstimateJobStore.clear();
      notify('Đã thêm món vào danh sách.');
    } catch (error) { notify(errorMessage(error), 'error'); }
    finally { setSaving(false); }
  };

  const reloadItems = async () => {
    touch('base');
    const { data } = await api.get('/shopping', { params: { month } });
    setItems(data.items || []);
    setCache(cacheKey, { data });
  };

  const applyBudget = async (item) => {
    if (!item.category?.id) return openEdit(item, true);
    setApplyingId(item.id);
    try {
      await api.post('/shopping/apply-budget', { itemId: item.id, categoryId: item.category.id });
      await reloadItems();
      notify('Đã đưa món vào ngân sách.');
    } catch (error) { notify(errorMessage(error), 'error'); }
    finally { setApplyingId(null); }
  };

  const refreshItem = async (item) => {
    setRefreshingId(item.id);
    try {
      await api.post(`/shopping/${item.id}/refresh`);
      await reloadItems();
      notify('Đã cập nhật giá mới.');
    } catch (error) { notify(errorMessage(error), 'error'); }
    finally { setRefreshingId(null); }
  };

  const openEdit = (item, focusCategory = false) => {
    setEditingItem({
      ...item,
      _focusCategory: focusCategory,
      category: item.category ? { ...item.category } : null,
      editName: item.name,
      editQuantity: String(item.quantity),
      editUnit: item.unit || '',
      editPrice: String(item.plannedUnitPrice),
      editNotes: item.notes || '',
    });
  };

  const saveEdit = async (event) => {
    event.preventDefault();
    if (!editingItem) return;
    const quantity = Number(editingItem.editQuantity);
    const price = Number(editingItem.editPrice || 0);
    if (!editingItem.editName.trim() || !Number.isInteger(quantity) || quantity < 1 || !Number.isInteger(price) || price < 0) return notify('Thông tin món chưa hợp lệ.', 'error');
    setSaving(true);
    try {
      await api.patch(`/shopping/${editingItem.id}`, {
        month, name: editingItem.editName.trim(), quantity, unit: editingItem.editUnit.trim() || null,
        plannedUnitPrice: price, plannedTotal: quantity * price,
        categoryId: editingItem.category?.id || null, categoryName: editingItem.category?.name || null, notes: editingItem.editNotes.trim() || null,
      });
      await reloadItems();
      setEditingItem(null);
      notify('Đã cập nhật món.');
    } catch (error) { notify(errorMessage(error), 'error'); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/shopping/${deleteTarget.id}`);
      await reloadItems();
      setDeleteTarget(null);
      notify('Đã xóa món khỏi danh sách.');
    } catch (error) { notify(errorMessage(error), 'error'); }
    finally { setDeleting(false); }
  };

  const expectedTotal = items.reduce((sum, item) => sum + Number(item.plannedTotal || 0), 0);

  return (
    <div className="mx-auto max-w-3xl space-y-3 sm:space-y-4">
      <header className="grid min-h-9 grid-cols-[36px_minmax(0,1fr)_36px] items-center gap-2">
        <span />
        <h1 className="truncate text-center font-editorial text-[21px] font-semibold tracking-[-0.025em] text-ink sm:text-2xl">Mua sắm</h1>
        <ShoppingBasket className="size-6 justify-self-center text-forest/65" strokeWidth={1.7} />
      </header>
      <PlanModeTabs showFund={!isPersonal} />
      <MonthPicker value={month} onChange={setMonth} dense fullWidth variant="budget" />

      <section className="rounded-[18px] border border-ink/[0.07] bg-paper/90 p-4 shadow-card sm:p-5">
        <div className="flex items-center gap-2"><Sparkles className="size-4 text-coral" /><h2 className="text-sm font-semibold text-ink">Thêm món cần mua</h2></div>
        <form onSubmit={saveNewItem} className="mt-4 space-y-3">
          <div className="flex gap-2">
            <input className="field min-w-0 flex-1" value={draft.name} onChange={(event) => updateDraft('name', event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void estimatePrice(); } }} placeholder="Ví dụ: máy lọc không khí" maxLength={120} />
            <button type="button" className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-[12px] bg-ink px-3 text-[11px] font-medium text-white shadow-sm transition active:scale-[0.98] disabled:opacity-50" onClick={estimatePrice} disabled={estimating}>{estimating ? <LoaderCircle className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Ước lượng</button>
          </div>
          <div className="grid grid-cols-[1fr_1fr_1.5fr] gap-2">
            <label><span className="label">Số lượng</span><input className="field" type="number" min="1" value={draft.quantity} onChange={(event) => updateDraft('quantity', event.target.value)} /></label>
            <label><span className="label">Đơn vị</span><input className="field" value={draft.unit} onChange={(event) => updateDraft('unit', event.target.value)} placeholder="cái" maxLength={30} /></label>
            <label><span className="label">Giá dự kiến / đơn vị</span><MoneyInput className="field money-input" inputMode="numeric" value={draft.plannedUnitPrice} onChange={(value) => updateDraft('plannedUnitPrice', value)} placeholder="Nhập thủ công" /></label>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label><span className="label">Danh mục</span><select className="field" value={draft.categoryId} onChange={(event) => selectCategory(event.target.value)} required><option value="">Chưa chọn danh mục</option>{expenseCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label><span className="label">Ghi chú</span><input className="field" value={draft.notes} onChange={(event) => updateDraft('notes', event.target.value)} placeholder="Màu, kích thước..." maxLength={500} /></label>
          </div>
          {estimating && <EstimateLoading />}
          {estimate && <EstimateCard estimate={estimate} onRetry={estimatePrice} loading={estimating} currency={family.currency} />}
          {estimateError && !estimate && <div className="flex items-start gap-2 rounded-[12px] bg-sun/15 px-3 py-2.5 text-[11px] leading-4 text-ink/65"><AlertCircle className="mt-0.5 size-4 shrink-0 text-coral" /><span className="min-w-0 flex-1">{estimateError} Bạn vẫn có thể nhập giá thủ công và lưu món.</span><button type="button" className="shrink-0 font-medium text-forest underline-offset-2 hover:underline" onClick={estimatePrice}>Thử lại</button></div>}
          <button type="submit" className="primary-button w-full" disabled={saving || estimating}>{saving ? <LoaderCircle className="size-5 animate-spin" /> : <Plus className="size-5" />} Lưu vào danh sách</button>
        </form>
      </section>

      <section className="space-y-2.5">
        <div className="flex items-center justify-between px-1"><div><h2 className="text-sm font-semibold text-ink">Danh sách tháng này</h2><p className="mt-0.5 text-[11px] text-ink/40">{items.length} món · {formatMoney(expectedTotal, family.currency)} dự kiến</p></div><WalletCards className="size-5 text-ink/28" /></div>
        {loading ? <div className="space-y-2.5"><Skeleton className="h-36 rounded-[16px]" /><Skeleton className="h-36 rounded-[16px]" /></div> : items.length ? items.map((item, index) => <ShoppingItemCard key={item.id} item={item} index={index} currency={family.currency} refreshing={refreshingId === item.id} applying={applyingId === item.id} onApply={applyBudget} onRefresh={refreshItem} onEdit={openEdit} onDelete={setDeleteTarget} />) : <EmptyShopping />}
      </section>

      <Modal open={Boolean(editingItem)} title="Sửa món mua sắm" onClose={() => { if (!saving) setEditingItem(null); }}>
        {editingItem && <form onSubmit={saveEdit} className="space-y-4">
          <label><span className="label">Tên món</span><input className="field" value={editingItem.editName} onChange={(event) => setEditingItem((current) => ({ ...current, editName: event.target.value }))} maxLength={120} /></label>
          <div className="grid grid-cols-3 gap-2"><label><span className="label">Số lượng</span><input className="field" type="number" min="1" value={editingItem.editQuantity} onChange={(event) => setEditingItem((current) => ({ ...current, editQuantity: event.target.value }))} /></label><label><span className="label">Đơn vị</span><input className="field" value={editingItem.editUnit} onChange={(event) => setEditingItem((current) => ({ ...current, editUnit: event.target.value }))} /></label><label><span className="label">Giá / đơn vị</span><MoneyInput className="field money-input" inputMode="numeric" value={editingItem.editPrice} onChange={(value) => setEditingItem((current) => ({ ...current, editPrice: value }))} /></label></div>
          <label><span className="label">Danh mục</span><select className="field" value={editingItem.category?.id || ''} onChange={(event) => selectCategory(event.target.value, 'edit')}><option value="">Chưa chọn danh mục</option>{expenseCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
          <label><span className="label">Ghi chú</span><textarea className="field min-h-20 resize-y" value={editingItem.editNotes} onChange={(event) => setEditingItem((current) => ({ ...current, editNotes: event.target.value }))} maxLength={500} /></label>
          {editingItem.budgetApplied && <div className="rounded-[12px] bg-mint px-3 py-2 text-[11px] leading-4 text-forest">Món này đã vào ngân sách. Lưu thay đổi sẽ tự cập nhật phần chênh lệch.</div>}
          <button type="submit" className="primary-button w-full" disabled={saving}>{saving ? <LoaderCircle className="size-5 animate-spin" /> : <Check className="size-5" />} Lưu thay đổi</button>
        </form>}
      </Modal>
      <ConfirmModal open={Boolean(deleteTarget)} title="Xóa món này?" description={deleteTarget?.budgetApplied ? 'Phần ngân sách đã áp dụng sẽ được hoàn lại trước khi xóa.' : 'Món sẽ bị xóa khỏi danh sách mua sắm của tháng này.'} confirmLabel="Xóa món" loading={deleting} onClose={() => setDeleteTarget(null)} onConfirm={remove} />
    </div>
  );
}

function EstimateCard({ estimate, onRetry, loading, currency }) {
  return <div className="rounded-[14px] border border-forest/15 bg-mint/45 p-3"><div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-[11px] font-medium text-forest"><Sparkles className="size-3.5" /> Ước lượng AI tại Việt Nam</div><button type="button" className="inline-flex items-center gap-1 text-[10px] font-medium text-forest/70" onClick={onRetry} disabled={loading}>{loading ? <LoaderCircle className="size-3 animate-spin" /> : <RefreshCw className="size-3" />} Thử lại</button></div><div className="mt-2 grid grid-cols-3 gap-2 text-[11px]"><div><span className="block text-ink/38">Khoảng giá</span><strong className="font-medium text-ink">{formatMoney(estimate.priceLow, currency)} - {formatMoney(estimate.priceHigh, currency)}</strong></div><div><span className="block text-ink/38">Đề xuất</span><strong className="font-medium text-forest">{formatMoney(estimate.recommendedPrice, currency)}</strong></div><div><span className="block text-ink/38">Tổng món</span><strong className="font-medium text-ink">{formatMoney(estimate.total, currency)}</strong></div></div><p className="mt-2 text-[10px] leading-4 text-ink/50">Độ tin cậy: {confidenceLabel(estimate.confidence)}{estimate.notes ? ` · ${estimate.notes}` : ''}</p>{estimate.sources?.length > 0 && <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">{estimate.sources.map((source) => <a key={source.uri} className="inline-flex max-w-full items-center gap-1 truncate text-[10px] text-forest underline-offset-2 hover:underline" href={source.uri} target="_blank" rel="noreferrer"><ExternalLink className="size-3 shrink-0" />{source.title}</a>)}</div>}</div>;
}

function EstimateLoading() {
  return <div className="flex items-center gap-2 rounded-[14px] border border-forest/15 bg-mint/35 px-3 py-3 text-[11px] text-forest"><LoaderCircle className="size-4 shrink-0 animate-spin" /><span>Đang để Gemini ước lượng giá… Bạn có thể chuyển trang, kết quả sẽ được giữ lại.</span></div>;
}

function ShoppingItemCard({ item, index, currency, refreshing, applying, onApply, onRefresh, onEdit, onDelete }) {
  const sourceCount = item.ai?.sources?.length || 0;
  return <article className="animate-rise-in rounded-[16px] border border-ink/[0.065] bg-paper/90 p-3.5 shadow-card" style={{ animationDelay: `${Math.min(index * 30, 180)}ms` }}><div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-[12px]" style={{ color: item.category?.color || '#3D7060', backgroundColor: `${item.category?.color || '#3D7060'}16` }}><CategoryIcon name={item.category?.icon || 'ShoppingBasket'} className="size-5" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate text-sm font-semibold text-ink">{item.name}</h3>{item.budgetApplied && <span className="rounded-full bg-mint px-2 py-0.5 text-[9px] font-medium text-forest">Đã vào ngân sách</span>}</div><p className="mt-1 text-[11px] text-ink/45">{item.quantity} {item.unit || 'món'} · {item.category?.name || 'Chưa chọn danh mục'}</p></div><div className="text-right"><strong className="block text-sm font-medium tabular-nums text-ink">{formatMoney(item.plannedTotal, currency)}</strong><span className="text-[10px] text-ink/38">{formatMoney(item.plannedUnitPrice, currency)} / đơn vị</span></div></div>{item.notes && <p className="mt-2 rounded-[10px] bg-ink/[0.035] px-2.5 py-2 text-[11px] leading-4 text-ink/52">{item.notes}</p>}{item.ai && <div className="mt-2 text-[10px] text-forest/75">AI ước lượng {item.ai.researchedAt ? formatResearchDate(item.ai.researchedAt) : ''} · {confidenceLabel(item.ai.confidence)}{sourceCount ? ` · ${sourceCount} nguồn` : ''}</div>}{sourceCount > 0 && <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">{item.ai.sources.map((source) => <a key={source.uri} className="inline-flex max-w-full items-center gap-1 truncate text-[10px] text-forest/75 underline-offset-2 hover:underline" href={source.uri} target="_blank" rel="noreferrer"><ExternalLink className="size-3 shrink-0" />{source.title}</a>)}</div>}<div className="mt-3 flex flex-wrap items-center justify-end gap-1.5 border-t border-ink/[0.06] pt-2.5"><button type="button" className="icon-button" onClick={() => onEdit(item)} aria-label="Sửa món"><Pencil className="size-4" /></button><button type="button" className="icon-button" onClick={() => onRefresh(item)} disabled={refreshing || applying} aria-label="Cập nhật giá">{refreshing ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}</button>{item.budgetApplied ? <span className="px-2 text-[10px] text-forest">Đã đồng bộ ngân sách</span> : <button type="button" className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] bg-forest px-3 text-[11px] font-medium text-white shadow-sm disabled:opacity-50" onClick={() => onApply(item)} disabled={applying}>{applying ? <LoaderCircle className="size-3.5 animate-spin" /> : <WalletCards className="size-3.5" />} {applying ? 'Đang đồng bộ' : 'Đưa vào ngân sách'}</button>}<button type="button" className="icon-button text-coral/70" onClick={() => onDelete(item)} aria-label="Xóa món"><Trash2 className="size-4" /></button></div></article>;
}

function EmptyShopping() { return <div className="rounded-[16px] border border-dashed border-ink/10 bg-white/45 px-5 py-9 text-center"><ShoppingBasket className="mx-auto size-8 text-forest/45" /><p className="mt-3 text-sm font-medium text-ink">Chưa có món nào</p><p className="mt-1 text-[11px] text-ink/42">Thêm món cho tháng này, rồi dùng AI để tham khảo giá thị trường.</p></div>; }

function findCategory(categories, name) { const target = stripDiacritics(name); if (!target) return undefined; return categories.find((category) => target.includes(stripDiacritics(category.name)) || stripDiacritics(category.name).includes(target)); }
function stripDiacritics(value) { return String(value || '').toLocaleLowerCase('vi').normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function confidenceLabel(value) { return value === 'high' ? 'cao' : value === 'medium' ? 'vừa' : 'thấp'; }
function formatResearchDate(value) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('vi-VN'); }
