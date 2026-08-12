import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { formatMoney } from '../utils/formatters.js';
import Avatar from './ui/Avatar.jsx';
import CategoryIcon from './ui/CategoryIcon.jsx';
import EmptyState from './ui/EmptyState.jsx';

export default function TransactionList({ transactions, currency, onDelete, compact = false, groupByDate = false, showTime = false, showMember = true }) {
  const [openRow, setOpenRow] = useState(null);

  useEffect(() => {
    if (!openRow) return undefined;
    const closeOnEscape = (event) => event.key === 'Escape' && setOpenRow(null);
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [openRow]);

  if (!transactions.length) return <EmptyState title="Tháng này còn rất yên tĩnh" description="Thêm giao dịch đầu tiên để bắt đầu theo dõi dòng tiền." />;

  const groups = groupByDate
    ? groupTransactionsByDate(transactions)
    : [{ date: null, transactions }];

  return (
    <div>
      {groups.map((group) => (
        <section key={group.date || 'all'}>
          {group.date && <TransactionDayHeader date={group.date} transactions={group.transactions} currency={currency} />}
          <div>
            {group.transactions.map((transaction) => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                currency={currency}
                compact={compact}
                showTime={showTime}
                showMember={showMember}
                onDelete={onDelete}
                open={openRow === transaction.id}
                onOpen={() => setOpenRow(transaction.id)}
                onClose={() => setOpenRow((current) => current === transaction.id ? null : current)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TransactionRow({ transaction, currency, compact, showTime, showMember, onDelete, open, onOpen, onClose }) {
  const actionWidth = onDelete ? 128 : 64;
  const gesture = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [offset, setOffset] = useState(open ? -actionWidth : 0);

  useEffect(() => {
    if (!dragging) setOffset(open ? -actionWidth : 0);
  }, [open, actionWidth, dragging]);

  const finishGesture = () => {
    const current = gesture.current;
    gesture.current = null;
    setDragging(false);
    if (!current) return;
    if (!current.horizontal) {
      if (open) onClose();
      return;
    }
    if (current.currentOffset <= -actionWidth * 0.35) onOpen();
    else onClose();
  };

  const handlePointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffset: open ? -actionWidth : 0,
      currentOffset: open ? -actionWidth : 0,
      horizontal: false,
    };
    setDragging(true);
  };

  const handlePointerMove = (event) => {
    const current = gesture.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - current.startX;
    const deltaY = event.clientY - current.startY;

    if (!current.horizontal) {
      if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 6) {
        gesture.current = null;
        setDragging(false);
        return;
      }
      if (Math.abs(deltaX) <= 6 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
      current.horizontal = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    event.preventDefault();
    current.currentOffset = Math.round(Math.max(-actionWidth, Math.min(0, current.startOffset + deltaX)));
    setOffset(current.currentOffset);
  };

  return (
    <div className="relative overflow-hidden border-b border-ink/[0.06] bg-paper last:border-b-0" data-swipe-row>
      <div
        className={`absolute bottom-px right-[-2px] top-px flex overflow-hidden ${dragging ? '' : 'transition-[clip-path] duration-300 ease-out'}`}
        style={{
          width: `${actionWidth + 2}px`,
          clipPath: `inset(0 0 0 ${Math.max(0, actionWidth + offset)}px)`,
        }}
        aria-hidden={!open && !dragging}
      >
        <Link
          to={`/transactions/${transaction.id}/edit`}
          className="flex w-16 flex-col items-center justify-center gap-1 bg-forest text-[10px] font-medium text-white transition hover:bg-[#255c50]"
          onClick={onClose}
          tabIndex={open ? 0 : -1}
          aria-label={`Sửa giao dịch ${transaction.category.name}`}
        >
          <Pencil className="size-[18px]" />
          Sửa
        </Link>
        {onDelete && (
          <button
            type="button"
            className="flex w-16 flex-col items-center justify-center gap-1 bg-coral text-[10px] font-medium text-white transition hover:bg-[#d9634b]"
            onClick={() => { onClose(); onDelete(transaction); }}
            tabIndex={open ? 0 : -1}
            aria-label={`Xóa giao dịch ${transaction.category.name}`}
          >
            <Trash2 className="size-[18px]" />
            Xóa
          </button>
        )}
      </div>

      <article
        className={`relative z-10 flex w-[calc(100%+2px)] touch-pan-y select-none items-center gap-2.5 bg-paper outline-none focus:outline-none focus-visible:outline-none ${dragging ? '' : 'transition-transform duration-300 ease-out'} ${compact ? 'py-3' : 'py-3.5'}`}
        style={{
          transform: `translateX(${offset}px)`,
          willChange: 'transform',
          backfaceVisibility: 'hidden',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishGesture}
        onPointerCancel={finishGesture}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') { event.preventDefault(); onOpen(); }
          if (event.key === 'ArrowRight' || event.key === 'Escape') { event.preventDefault(); onClose(); }
        }}
        tabIndex={0}
        aria-label={`Giao dịch ${transaction.category.name}. Vuốt sang trái để sửa hoặc xóa.`}
      >
        <span className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ backgroundColor: `${transaction.category.color}1F`, color: transaction.category.color }}>
          <CategoryIcon name={transaction.category.icon} className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-bold text-ink">{transaction.category.name}</h3>
          {transaction.note && <p className="mt-0.5 truncate text-xs font-semibold text-ink/38">{transaction.note}</p>}
          {showTime ? (
            <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[11px] font-normal leading-4 text-ink/42" title={transaction.assignedTo.displayName}>
              <span className="shrink-0">{formatTransactionTime(transaction.createdAt)}</span>
              {showMember && <><span className="size-0.5 shrink-0 rounded-full bg-ink/25" /><Avatar user={transaction.assignedTo} size="xs" /><span className="truncate">{shortDisplayName(transaction.assignedTo.displayName)}</span></>}
            </div>
          ) : (
            <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs font-semibold text-ink/40" title={transaction.assignedTo.displayName}>
              <span className="shrink-0">{formatShortDate(transaction.transactionDate)}</span>
              {showMember && <><span className="size-0.5 shrink-0 rounded-full bg-ink/25" /><Avatar user={transaction.assignedTo} size="xs" /><span className="truncate">{transaction.assignedTo.displayName}</span></>}
            </div>
          )}
        </div>
        <div className="shrink-0 pr-3 text-right sm:pr-4">
          <div className={`whitespace-nowrap text-sm font-normal ${transaction.type === 'income' ? 'text-[#2D8A72]' : 'text-ink'}`}>
            {transaction.type === 'income' ? '+' : '−'}{formatMoney(transaction.amount, currency)}
          </div>
        </div>
      </article>
    </div>
  );
}

function TransactionDayHeader({ date, transactions, currency }) {
  const dailyTotal = transactions.reduce((total, transaction) => (
    total + (transaction.type === 'income' ? Number(transaction.amount) : -Number(transaction.amount))
  ), 0);
  const day = new Date(`${date}T12:00:00`);
  const weekDays = ['CN', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  const dateLabel = day.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div className="-mx-3.5 flex items-center justify-between gap-4 border-y border-ink/[0.06] bg-ink/[0.035] px-3.5 py-2 text-xs font-medium text-ink/58 sm:-mx-5 sm:px-5">
      <span>{dateLabel} ({weekDays[day.getDay()]})</span>
      <span className={dailyTotal >= 0 ? 'text-[#258C68]' : 'text-coral'}>{dailyTotal > 0 ? '+' : dailyTotal < 0 ? '−' : ''}{formatMoney(Math.abs(dailyTotal), currency)}</span>
    </div>
  );
}

function groupTransactionsByDate(transactions) {
  const groups = [];
  transactions.forEach((transaction) => {
    const current = groups[groups.length - 1];
    if (current?.date === transaction.transactionDate) current.transactions.push(transaction);
    else groups.push({ date: transaction.transactionDate, transactions: [transaction] });
  });
  return groups;
}

function formatShortDate(value) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('vi-VN', { day: '2-digit', month: 'short' });
}

function formatTransactionTime(value) {
  if (!value) return '--:--';
  let normalized = String(value).trim().replace(' ', 'T');
  normalized = normalized.replace(/(\.\d{3})\d+/, '$1');
  if (/([+-]\d{4})$/.test(normalized)) {
    normalized = `${normalized.slice(0, -2)}:${normalized.slice(-2)}`;
  } else if (/([+-]\d{2})$/.test(normalized)) {
    normalized = `${normalized}:00`;
  } else if (!/(Z|[+-]\d{2}:\d{2})$/.test(normalized)) {
    normalized += 'Z';
  }
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(date);
}

function shortDisplayName(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  return parts.at(-1) || '';
}
