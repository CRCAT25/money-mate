import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUpDown, Check, Landmark, LoaderCircle } from 'lucide-react';
import Modal from '../ui/Modal.jsx';
import MoneyInput from '../ui/MoneyInput.jsx';
import CategoryIcon from '../ui/CategoryIcon.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import api, { errorMessage } from '../../utils/api.js';
import { formatMoney, localToday } from '../../utils/formatters.js';

const QUICK_AMOUNTS = [50000, 100000, 200000, 500000];

export default function TransferFundModal({
  open,
  onClose,
  pockets = [],
  currency = 'VND',
  defaultFromPocketId = null,
  defaultToPocketId = null,
  onSuccess,
}) {
  const { notify } = useToast();
  const [fromPocketId, setFromPocketId] = useState('');
  const [toPocketId, setToPocketId] = useState('');
  const [amount, setAmount] = useState('');
  const [transferDate, setTransferDate] = useState(localToday());
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Initialize selected pockets when modal opens
  useEffect(() => {
    if (!open) return;
    setTransferDate(localToday());
    setNote('');
    setAmount('');

    const activePockets = pockets.filter((p) => !p.isArchived);
    if (!activePockets.length) return;

    // Default from pocket: specified prop, or pocket with highest positive balance, or first pocket
    let initialFrom = activePockets.find((p) => p.id === defaultFromPocketId);
    if (!initialFrom) {
      const withBalance = activePockets.filter((p) => Number(p.balance || 0) > 0);
      initialFrom = withBalance.length ? withBalance[0] : activePockets[0];
    }
    setFromPocketId(initialFrom?.id || '');

    // Default to pocket: specified prop (if different), or first pocket different from initialFrom
    let initialTo = activePockets.find((p) => p.id === defaultToPocketId && p.id !== initialFrom?.id);
    if (!initialTo) {
      initialTo = activePockets.find((p) => p.id !== initialFrom?.id) || activePockets[0];
    }
    setToPocketId(initialTo?.id || '');
  }, [open, pockets, defaultFromPocketId, defaultToPocketId]);

  const sourcePocket = useMemo(() => pockets.find((p) => p.id === fromPocketId), [pockets, fromPocketId]);
  const targetPocket = useMemo(() => pockets.find((p) => p.id === toPocketId), [pockets, toPocketId]);

  const sourceBalance = Number(sourcePocket?.balance || 0);
  const numAmount = Number(amount || 0);
  const exceedsBalance = numAmount > sourceBalance;
  const isInvalid = !fromPocketId || !toPocketId || fromPocketId === toPocketId || numAmount <= 0 || exceedsBalance;

  const handleSwap = () => {
    const prevFrom = fromPocketId;
    const prevTo = toPocketId;
    setFromPocketId(prevTo);
    setToPocketId(prevFrom);
  };

  const handleQuickAdd = (value) => {
    const current = Number(amount || 0);
    const next = current + value;
    if (next <= sourceBalance) {
      setAmount(String(next));
    } else {
      setAmount(String(sourceBalance));
    }
  };

  const handleMaxAmount = () => {
    if (sourceBalance > 0) {
      setAmount(String(sourceBalance));
    }
  };

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (isInvalid || submitting) return;

    setSubmitting(true);
    try {
      const { data } = await api.post('/fund/transfers', {
        fromPocketId,
        toPocketId,
        amount: numAmount,
        transferDate,
        note: note.trim() || undefined,
      });

      notify(data.message);
      onSuccess?.(data);
      onClose();
    } catch (err) {
      notify(errorMessage(err), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <Modal open={open} title="Chuyển tiền giữa các quỹ" onClose={onClose} compact>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Source Pocket */}
        <div>
          <label className="block text-[11px] font-medium text-ink/65 mb-1.5">
            Từ quỹ nguồn
          </label>
          <div className="relative">
            <select
              value={fromPocketId}
              onChange={(e) => {
                const newFromId = e.target.value;
                setFromPocketId(newFromId);
                if (newFromId === toPocketId) {
                  const fallbackTo = pockets.find((p) => p.id !== newFromId);
                  if (fallbackTo) setToPocketId(fallbackTo.id);
                }
              }}
              className="w-full h-11 rounded-[12px] border border-ink/[0.08] bg-white/70 px-3.5 pr-8 text-sm font-medium text-ink outline-none focus:border-forest/40 focus:ring-0"
            >
              {pockets.map((pocket) => (
                <option key={pocket.id} value={pocket.id}>
                  {pocket.name} (Khả dụng: {formatMoney(pocket.balance, currency)})
                </option>
              ))}
            </select>
          </div>
          {sourcePocket && (
            <div className="mt-1 flex items-center justify-between text-[11px] px-1">
              <span className="text-ink/45">Số dư khả dụng:</span>
              <span className={`font-medium ${sourceBalance > 0 ? 'text-forest' : 'text-coral'}`}>
                {formatMoney(sourceBalance, currency)}
              </span>
            </div>
          )}
        </div>

        {/* Swap Button */}
        <div className="flex justify-center -my-1">
          <button
            type="button"
            onClick={handleSwap}
            className="flex size-8 items-center justify-center rounded-full border border-ink/[0.08] bg-white text-ink/60 shadow-sm transition hover:bg-mint/30 hover:text-forest active:scale-95"
            title="Đổi chiều chuyển quỹ"
          >
            <ArrowUpDown className="size-4" />
          </button>
        </div>

        {/* Destination Pocket */}
        <div>
          <label className="block text-[11px] font-medium text-ink/65 mb-1.5">
            Sang quỹ nhận
          </label>
          <div className="relative">
            <select
              value={toPocketId}
              onChange={(e) => setToPocketId(e.target.value)}
              className="w-full h-11 rounded-[12px] border border-ink/[0.08] bg-white/70 px-3.5 pr-8 text-sm font-medium text-ink outline-none focus:border-forest/40 focus:ring-0"
            >
              {pockets
                .filter((pocket) => pocket.id !== fromPocketId)
                .map((pocket) => (
                  <option key={pocket.id} value={pocket.id}>
                    {pocket.name} (Hiện có: {formatMoney(pocket.balance, currency)})
                  </option>
                ))}
            </select>
          </div>
          {targetPocket && (
            <div className="mt-1 flex items-center justify-between text-[11px] px-1">
              <span className="text-ink/45">Số dư hiện tại:</span>
              <span className="font-medium text-ink/70">
                {formatMoney(targetPocket.balance, currency)}
              </span>
            </div>
          )}
        </div>

        {/* Amount Input */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[11px] font-medium text-ink/65">
              Số tiền chuyển
            </label>
            {sourceBalance > 0 && (
              <button
                type="button"
                onClick={handleMaxAmount}
                className="text-[10px] font-semibold text-forest hover:underline"
              >
                Chuyển tất cả
              </button>
            )}
          </div>
          <div className="relative">
            <MoneyInput
              value={amount}
              onChange={setAmount}
              placeholder="0"
              autoFocus
              className="w-full h-12 rounded-[12px] border border-ink/[0.08] bg-white/70 px-3.5 pr-10 text-base font-semibold text-ink outline-none focus:border-forest/40 focus:ring-0 placeholder:text-ink/25"
            />
            <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-medium text-ink/35 pointer-events-none">
              {currency === 'VND' ? '₫' : currency}
            </span>
          </div>

          {/* Quick chips */}
          {sourceBalance > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {QUICK_AMOUNTS.filter((v) => v <= sourceBalance).map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => handleQuickAdd(val)}
                  className="rounded-[8px] border border-ink/[0.06] bg-white/60 px-2 py-1 text-[10px] font-medium text-ink/65 transition hover:bg-mint/40 hover:text-forest active:scale-95"
                >
                  +{formatMoney(val, currency)}
                </button>
              ))}
            </div>
          )}

          {exceedsBalance && (
            <p className="mt-1.5 text-[11px] font-normal text-coral">
              Số tiền chuyển vượt quá số dư của {sourcePocket?.name} (còn {formatMoney(sourceBalance, currency)}).
            </p>
          )}
        </div>

        {/* Date and Note */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-[11px] font-medium text-ink/65 mb-1.5">
              Ngày chuyển
            </label>
            <input
              type="date"
              value={transferDate}
              onChange={(e) => setTransferDate(e.target.value)}
              className="w-full h-10 rounded-[11px] border border-ink/[0.08] bg-white/70 px-3 text-xs font-normal text-ink outline-none focus:border-forest/40"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-ink/65 mb-1.5">
              Ghi chú (tùy chọn)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ví dụ: Bù quỹ chi tiêu"
              maxLength={240}
              className="w-full h-10 rounded-[11px] border border-ink/[0.08] bg-white/70 px-3 text-xs font-normal text-ink outline-none focus:border-forest/40 placeholder:text-ink/30"
            />
          </div>
        </div>

        {/* Submit */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isInvalid || submitting}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-forest px-4 text-xs font-medium text-white shadow-sm transition active:scale-[0.99] disabled:opacity-45"
          >
            {submitting ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <Check className="size-4" strokeWidth={2.5} />
            )}
            Xác nhận chuyển quỹ
          </button>
        </div>
      </form>
    </Modal>
  );
}
