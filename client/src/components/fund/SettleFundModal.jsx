import { useState } from 'react';
import { Coins, LoaderCircle, Users } from 'lucide-react';
import Avatar from '../ui/Avatar.jsx';
import Modal from '../ui/Modal.jsx';
import api, { errorMessage } from '../../utils/api.js';
import { formatMoney } from '../../utils/formatters.js';
import { useToast } from '../../context/ToastContext.jsx';

export default function SettleFundModal({ open, onClose, balance, members = [], currency = 'VND', month, onSuccess }) {
  const { notify } = useToast();
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  const memberCount = members.length || 1;
  const baseRefund = Math.floor(balance / memberCount);
  const remainder = balance % memberCount;

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (balance <= 0) return notify('Số dư quỹ hiện tại không có thặng dư để tất toán.', 'error');
    setLoading(true);
    try {
      const response = await api.post('/fund/settle', {
        month,
        note: note.trim() || `Tất toán thặng dư quỹ tháng ${month}`,
      });
      notify(response.data.message);
      onSuccess?.();
      onClose();
    } catch (error) {
      notify(errorMessage(error), 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} title="Tất toán & Hoàn quỹ" onClose={loading ? undefined : onClose} compact>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="-mt-1 text-[11.5px] leading-5 text-ink/55">
          Tiền dư quỹ sẽ được chia đều và tự động ghi nhận vào sổ cá nhân của từng thành viên trong gia đình. Số dư quỹ sẽ đưa về 0đ.
        </p>

        {/* Total to settle card */}
        <div className="rounded-[14px] border border-ink/[0.08] bg-forest/5 p-3.5">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-medium text-ink/65">Tổng tiền thặng dư tất toán</span>
            <span className="text-base font-semibold tracking-[-0.015em] text-forest">
              {formatMoney(balance, currency)}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-forest/10 pt-2 text-xs">
            <span className="flex items-center gap-1.5 text-ink/55">
              <Users className="size-3.5 text-forest" /> Chia đều cho {members.length} người:
            </span>
            <span className="font-medium text-ink">
              ~ {formatMoney(baseRefund, currency)} / người
            </span>
          </div>
        </div>

        {/* Member breakdown */}
        <div>
          <div className="mb-2 text-[11px] font-medium text-ink/55">Chi tiết số tiền hoàn về ví cá nhân</div>
          <div className="max-h-48 space-y-1.5 overflow-y-auto pr-0.5">
            {members.map((member, index) => {
              const amount = baseRefund + (index < remainder ? 1 : 0);
              return (
                <div
                  key={member.id}
                  className="flex items-center justify-between gap-3 rounded-[11px] border border-ink/[0.06] bg-white/70 px-3 py-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Avatar user={member} size="sm" />
                    <span className="truncate text-xs font-medium text-ink">
                      {member.displayName}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-forest">
                    +{formatMoney(amount, currency)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Note input */}
        <label className="block">
          <span className="text-[11px] font-medium text-ink/55">Ghi chú</span>
          <input
            className="mt-1 h-10 w-full rounded-[11px] border border-ink/[0.08] bg-white/65 px-3 text-xs text-ink outline-none focus:border-forest/40"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={`Tất toán thặng dư quỹ tháng ${month}`}
            maxLength={200}
          />
        </label>

        {/* Actions */}
        <div className="mt-5 flex gap-2.5 pt-1">
          <button
            type="button"
            className="flex-1 rounded-[11px] border border-ink/[0.09] bg-white py-2.5 text-xs font-medium text-ink/70 transition hover:bg-ink/[0.02]"
            onClick={onClose}
            disabled={loading}
          >
            Hủy
          </button>
          <button
            type="submit"
            className="flex flex-[2] items-center justify-center gap-2 rounded-[11px] bg-forest py-2.5 text-xs font-medium text-white shadow-sm transition hover:bg-forest/95 disabled:opacity-50"
            disabled={loading || balance <= 0}
          >
            {loading ? <LoaderCircle className="size-4 animate-spin" /> : <Coins className="size-4" />}
            Xác nhận tất toán & Hoàn quỹ
          </button>
        </div>
      </form>
    </Modal>
  );
}
