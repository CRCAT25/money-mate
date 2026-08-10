import { Link } from 'react-router-dom';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { formatMoney } from '../utils/formatters.js';
import CategoryIcon from './ui/CategoryIcon.jsx';
import EmptyState from './ui/EmptyState.jsx';

export default function TransactionList({ transactions, currency, onDelete, compact = false }) {
  const [openMenu, setOpenMenu] = useState(null);
  if (!transactions.length) return <EmptyState title="Tháng này còn rất yên tĩnh" description="Thêm giao dịch đầu tiên để bắt đầu theo dõi dòng tiền của nhà mình." />;

  return (
    <div className="divide-y divide-ink/[0.06]">
      {transactions.map((transaction) => (
        <article key={transaction.id} className={`group relative flex items-center gap-3 ${compact ? 'py-3' : 'py-4'}`}>
          <span className="grid size-12 shrink-0 place-items-center rounded-[17px]" style={{ backgroundColor: `${transaction.category.color}1F`, color: transaction.category.color }}>
            <CategoryIcon name={transaction.category.icon} className="size-[22px]" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="truncate text-sm font-extrabold text-ink">{transaction.category.name}</h3>
              {transaction.note && <span className="hidden truncate text-xs text-ink/38 sm:inline">· {transaction.note}</span>}
            </div>
            <p className="mt-1 truncate text-xs font-semibold text-ink/40">
              {new Date(`${transaction.transactionDate}T12:00:00`).toLocaleDateString('vi-VN', { day: '2-digit', month: 'short' })} · {transaction.assignedTo.displayName}
            </p>
          </div>
          <div className="text-right">
            <div className={`whitespace-nowrap text-sm font-extrabold ${transaction.type === 'income' ? 'text-[#258C68]' : 'text-ink'}`}>
              {transaction.type === 'income' ? '+' : '−'}{formatMoney(transaction.amount, currency)}
            </div>
          </div>
          <div className="relative">
              <button onClick={() => setOpenMenu(openMenu === transaction.id ? null : transaction.id)} className="grid size-10 place-items-center rounded-xl text-ink/35 hover:bg-ink/5 hover:text-ink" aria-label="Tùy chọn giao dịch">
                <MoreHorizontal className="size-5" />
              </button>
              {openMenu === transaction.id && (
                <div className="absolute right-0 top-10 z-20 w-36 overflow-hidden rounded-2xl border border-ink/10 bg-white p-1.5 text-sm font-bold shadow-soft">
                  <Link to={`/transactions/${transaction.id}/edit`} className="flex min-h-10 items-center gap-2 rounded-xl px-3 text-ink hover:bg-cream" onClick={() => setOpenMenu(null)}>
                    <Pencil className="size-4" /> Sửa
                  </Link>
                  {onDelete && <button className="flex min-h-10 w-full items-center gap-2 rounded-xl px-3 text-coral hover:bg-coral/5" onClick={() => { setOpenMenu(null); onDelete(transaction); }}><Trash2 className="size-4" /> Xóa</button>}
                </div>
              )}
          </div>
        </article>
      ))}
    </div>
  );
}
