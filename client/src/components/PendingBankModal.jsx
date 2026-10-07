import { useEffect, useState } from 'react';
import { Check, Clock, Landmark, LoaderCircle, Sparkles, Tag, Trash2, X } from 'lucide-react';
import CategoryIcon from './ui/CategoryIcon.jsx';
import Modal from './ui/Modal.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useFamilyData } from '../context/FamilyContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import api, { errorMessage } from '../utils/api.js';
import { formatMoney } from '../utils/formatters.js';

export default function PendingBankModal({ item, open, onClose, onResolved }) {
  const { spaces, family: currentSpace } = useAuth();
  const { categories, reloadBaseData } = useFamilyData();
  const { notify } = useToast();

  const [selectedSpaceId, setSelectedSpaceId] = useState('');
  const [spaceCategories, setSpaceCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState('');

  useEffect(() => {
    if (!item || !open) return;
    const targetSpaceId = item.space?.id || currentSpace?.id || spaces[0]?.id;
    setSelectedSpaceId(targetSpaceId);
    setSelectedCategoryId(item.suggestedCategory?.id || '');
    setNote(item.content || '');
  }, [item, open, currentSpace?.id, spaces]);

  useEffect(() => {
    if (!selectedSpaceId) return;
    if (selectedSpaceId === currentSpace?.id) {
      setSpaceCategories(categories.filter((c) => c.type === 'expense'));
      return;
    }

    let active = true;
    setCategoriesLoading(true);
    api.get('/categories', { headers: { 'X-MoneyMate-Space-Id': selectedSpaceId } })
      .then(({ data }) => {
        if (!active) return;
        setSpaceCategories(data.filter((c) => c.type === 'expense'));
      })
      .catch(() => {
        if (!active) return;
        setSpaceCategories([]);
      })
      .finally(() => {
        if (active) setCategoriesLoading(false);
      });
    return () => { active = false; };
  }, [selectedSpaceId, currentSpace?.id, categories]);

  if (!item) return null;

  const handleCategorize = async (event) => {
    event.preventDefault();
    if (!selectedCategoryId) return notify('Vui lòng chọn danh mục chi tiêu.', 'error');
    setSaving('categorize');
    try {
      await api.post(`/bank/pending/${item.id}/categorize`, {
        categoryId: selectedCategoryId,
        spaceId: selectedSpaceId,
        note: note.trim() || undefined,
      });
      notify('Đã ghi nhận khoản chi thành công!');
      onResolved?.();
      onClose();
    } catch (error) {
      notify(errorMessage(error), 'error');
    } finally {
      setSaving('');
    }
  };

  const handleIgnore = async () => {
    setSaving('ignore');
    try {
      await api.post(`/bank/pending/${item.id}/ignore`);
      notify('Đã bỏ qua giao dịch.');
      onResolved?.();
      onClose();
    } catch (error) {
      notify(errorMessage(error), 'error');
    } finally {
      setSaving('');
    }
  };

  const currency = currentSpace?.currency || 'VND';

  return (
    <Modal open={open} title="Phân loại chi tiêu" onClose={onClose}>
      <form onSubmit={handleCategorize} className="space-y-4">
        {/* Transaction Highlight Card */}
        <div className="rounded-[18px] border border-ink/[0.07] bg-coral/[0.04] p-4 text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-ink/65 shadow-xs">
            <Landmark className="size-3.5 text-forest" />
            <span>{item.bank?.name} · {item.bank?.accountMasked}</span>
          </div>

          <div className="mt-2 font-editorial text-3xl font-bold tracking-tight text-coral sm:text-4xl">
            -{formatMoney(item.amount, currency)}
          </div>

          {item.content && (
            <div className="mt-2 rounded-xl bg-white/70 p-2.5 text-left text-xs leading-relaxed text-ink/70">
              <span className="font-semibold text-ink">Nội dung: </span>
              {item.content}
            </div>
          )}

          <div className="mt-2 flex items-center justify-center gap-1.5 text-[11px] text-ink/45">
            <Clock className="size-3" />
            <span>{formatDateLabel(item.transactionAt)}</span>
          </div>
        </div>

        {/* Space Selector (if user has multiple spaces) */}
        {spaces.length > 1 && (
          <div>
            <label className="label">Ghi vào không gian</label>
            <select
              className="field mt-1"
              value={selectedSpaceId}
              onChange={(e) => {
                setSelectedSpaceId(e.target.value);
                setSelectedCategoryId('');
              }}
            >
              {spaces.map((space) => (
                <option key={space.id} value={space.id}>
                  {space.type === 'personal' ? 'Cá nhân' : space.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Category Picker */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="label">Chọn danh mục</span>
            {item.suggestedCategory && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-forest">
                <Sparkles className="size-3" /> Gợi ý: {item.suggestedCategory.name}
              </span>
            )}
          </div>

          {categoriesLoading ? (
            <div className="py-6 text-center text-xs text-ink/40">Đang tải danh mục...</div>
          ) : (
            <div className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
              {spaceCategories.map((cat) => {
                const isSelected = selectedCategoryId === cat.id;
                const isSuggested = item.suggestedCategory?.id === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`flex items-center gap-2 rounded-xl border p-2 text-left text-xs font-medium transition active:scale-[0.98] ${
                      isSelected
                        ? 'border-forest bg-forest text-white shadow-sm'
                        : isSuggested
                        ? 'border-forest/40 bg-mint/40 text-ink hover:bg-mint/60'
                        : 'border-ink/[0.08] bg-white/70 text-ink/80 hover:bg-white'
                    }`}
                  >
                    <span
                      className={`grid size-7 shrink-0 place-items-center rounded-lg ${
                        isSelected ? 'bg-white/20 text-white' : 'text-white'
                      }`}
                      style={{ backgroundColor: isSelected ? undefined : cat.color }}
                    >
                      <CategoryIcon name={cat.icon} className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1 truncate">{cat.name}</span>
                    {isSelected && <Check className="size-3.5 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Note input */}
        <div>
          <label className="label">Ghi chú (tùy chọn)</label>
          <input
            className="field mt-1"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ghi chú thêm về khoản chi..."
            maxLength={240}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-2.5 pt-2">
          <button
            type="button"
            onClick={handleIgnore}
            disabled={Boolean(saving)}
            className="secondary-button flex-1 text-ink/60 hover:text-coral"
          >
            {saving === 'ignore' ? <LoaderCircle className="size-4 animate-spin" /> : 'Bỏ qua khoản này'}
          </button>
          <button
            type="submit"
            disabled={Boolean(saving) || !selectedCategoryId}
            className="primary-button flex-[2]"
          >
            {saving === 'categorize' ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              'Xác nhận ghi chép'
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function formatDateLabel(isoString) {
  if (!isoString) return '';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  const time = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const day = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `${time} · ${day}`;
}
