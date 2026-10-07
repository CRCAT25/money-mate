import { useEffect, useState, useCallback } from 'react';
import { ChevronRight, Landmark, Sparkles } from 'lucide-react';
import PendingBankModal from './PendingBankModal.jsx';
import api from '../utils/api.js';
import { formatMoney } from '../utils/formatters.js';

export default function PendingBankBanner({ currency = 'VND', onResolved }) {
  const [pendingList, setPendingList] = useState([]);
  const [activeItem, setActiveItem] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchPending = useCallback(async () => {
    try {
      const { data } = await api.get('/bank/pending');
      const items = data.pending || [];
      setPendingList(items);

      // Check if URL has ?pending=<id>
      const url = new URL(window.location.href);
      const targetPendingId = url.searchParams.get('pending');
      if (targetPendingId) {
        url.searchParams.delete('pending');
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
        const found = items.find((item) => item.id === targetPendingId);
        if (found) {
          setActiveItem(found);
          setModalOpen(true);
        } else {
          // If not in the list, fetch individual item
          api.get(`/bank/pending/${targetPendingId}`)
            .then((res) => {
              if (res.data) {
                setActiveItem(res.data);
                setModalOpen(true);
              }
            })
            .catch(() => {});
        }
      }
    } catch {
      // Ignore network errors on background poll
    }
  }, []);

  useEffect(() => {
    fetchPending();

    const handleBankEvent = () => {
      fetchPending();
    };

    window.addEventListener('moneymate:bank-pending', handleBankEvent);
    return () => {
      window.removeEventListener('moneymate:bank-pending', handleBankEvent);
    };
  }, [fetchPending]);

  if (!pendingList.length && !modalOpen) return null;

  const topItem = pendingList[0];

  const handleOpen = (item) => {
    setActiveItem(item);
    setModalOpen(true);
  };

  const handleResolved = () => {
    fetchPending();
    onResolved?.();
  };

  return (
    <>
      {pendingList.length > 0 && (
        <section className="animate-fade-only overflow-hidden rounded-[18px] border border-forest/20 bg-[linear-gradient(135deg,rgba(230,242,237,0.95),rgba(255,250,240,0.92))] p-3.5 shadow-card sm:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-forest text-white shadow-sm">
                <Landmark className="size-5" />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-sm font-bold text-ink">
                    {pendingList.length} giao dịch chờ phân loại
                  </h3>
                  <span className="inline-flex items-center rounded-full bg-forest/15 px-2 py-0.5 text-[10px] font-semibold text-forest">
                    SePay
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-ink/65">
                  Vừa chi <strong className="text-coral">-{formatMoney(topItem.amount, currency)}</strong>
                  {topItem.content ? ` · ${topItem.content}` : ''}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                type="button"
                onClick={() => handleOpen(topItem)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-forest px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-forest/90 active:scale-95"
              >
                <span>Phân loại ngay</span>
                <ChevronRight className="size-3.5" />
              </button>
            </div>
          </div>
        </section>
      )}

      <PendingBankModal
        item={activeItem}
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onResolved={handleResolved}
      />
    </>
  );
}
