import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { formatMoney } from '../utils/formatters.js';
import CategoryIcon from './ui/CategoryIcon.jsx';
import EmptyState from './ui/EmptyState.jsx';

export default function TransactionList({ transactions, currency, onDelete, compact = false, groupByDate = false, showTime = false }) {
  const [openMenu, setOpenMenu] = useState(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!openMenu) return undefined;
    const closeOutside = (event) => {
      if (!menuRef.current?.contains(event.target)) setOpenMenu(null);
    };
    const closeOnEscape = (event) => event.key === 'Escape' && setOpenMenu(null);
    document.addEventListener('pointerdown', closeOutside);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [openMenu]);

  if (!transactions.length) return <EmptyState title="Tháng này còn rất yên tĩnh" description="Thêm giao dịch đầu tiên để bắt đầu theo dõi dòng tiền của nhà mình." />;

  const groups = groupByDate
    ? groupTransactionsByDate(transactions)
    : [{ date: null, transactions }];

  return (
    <div>
      {groups.map((group) => (
        <section key={group.date || 'all'}>
          {group.date && <TransactionDayHeader date={group.date} transactions={group.transactions} currency={currency} />}
          <div className="divide-y divide-ink/[0.06]">
            {group.transactions.map((transaction) => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                currency={currency}
                compact={compact}
                showTime={showTime}
                onDelete={onDelete}
                open={openMenu === transaction.id}
                menuRef={openMenu === transaction.id ? menuRef : null}
                onToggleMenu={() => setOpenMenu(openMenu === transaction.id ? null : transaction.id)}
                onCloseMenu={() => setOpenMenu(null)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TransactionRow({ transaction, currency, compact, showTime, onDelete, open, menuRef, onToggleMenu, onCloseMenu }) {
  return (
    <article className={`group relative flex items-start gap-3 ${compact ? 'py-3.5' : 'py-4'}`}>
      <span className="grid size-12 shrink-0 place-items-center rounded-[17px]" style={{ backgroundColor: `${transaction.category.color}1F`, color: transaction.category.color }}>
        <CategoryIcon name={transaction.category.icon} className="size-[22px]" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-extrabold text-ink">{transaction.category.name}</h3>
        {transaction.note && <p className="mt-0.5 truncate text-xs font-semibold text-ink/38">{transaction.note}</p>}
        {showTime ? (
          <div className="mt-1.5 space-y-0.5 text-[11px] font-semibold leading-4 text-ink/40">
            <p>{formatTransactionTime(transaction.createdAt)}</p>
            <p className="break-words">{transaction.assignedTo.displayName}</p>
          </div>
        ) : (
          <p className="mt-1 truncate text-xs font-semibold text-ink/40">
            {formatShortDate(transaction.transactionDate)} · {transaction.assignedTo.displayName}
          </p>
        )}
      </div>
      <div className="pt-0.5 text-right">
        <div className={`whitespace-nowrap text-sm font-extrabold ${transaction.type === 'income' ? 'text-[#258C68]' : 'text-ink'}`}>
          {transaction.type === 'income' ? '+' : '−'}{formatMoney(transaction.amount, currency)}
        </div>
      </div>
      <div className="relative" ref={menuRef}>
        <button type="button" onClick={onToggleMenu} className="grid size-10 place-items-center rounded-xl text-ink/35 hover:bg-ink/5 hover:text-ink" aria-label="Tùy chọn giao dịch" aria-expanded={open}>
          <MoreHorizontal className="size-5" />
        </button>
        {open && (
          <div className="absolute right-0 top-10 z-20 w-36 overflow-hidden rounded-2xl border border-ink/10 bg-white p-1.5 text-sm font-bold shadow-soft">
            <Link to={`/transactions/${transaction.id}/edit`} className="flex min-h-10 items-center gap-2 rounded-xl px-3 text-ink hover:bg-cream" onClick={onCloseMenu}>
              <Pencil className="size-4" /> Sửa
            </Link>
            {onDelete && (
              <button type="button" className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-coral hover:bg-coral/5" onClick={() => { onCloseMenu(); onDelete(transaction); }}>
                <Trash2 className="size-4" /> Xóa
              </button>
            )}
          </div>
        )}
      </div>
    </article>
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
    <div className="-mx-4 flex items-center justify-between gap-4 border-y border-ink/[0.06] bg-ink/[0.035] px-4 py-2 text-xs font-extrabold text-ink/58 sm:-mx-6 sm:px-6">
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
  const text = String(value).replace(' ', 'T');
  const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/.test(text) ? text : `${text}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(date);
}
