import { ChevronLeft, ChevronRight } from 'lucide-react';
import { monthLabel, shiftMonth } from '../../utils/formatters.js';

export default function MonthPicker({ value, onChange, compact = false }) {
  return (
    <div className={`inline-flex items-center rounded-2xl border border-ink/10 bg-white/65 ${compact ? 'p-1' : 'p-1.5'} shadow-sm`}>
      <button className="grid size-10 place-items-center rounded-xl text-ink/55 transition hover:bg-white hover:text-ink" onClick={() => onChange(shiftMonth(value, -1))} aria-label="Tháng trước">
        <ChevronLeft className="size-5" />
      </button>
      <span className={`${compact ? 'min-w-28 text-sm' : 'min-w-36'} text-center font-extrabold capitalize text-ink`}>{monthLabel(value)}</span>
      <button className="grid size-10 place-items-center rounded-xl text-ink/55 transition hover:bg-white hover:text-ink" onClick={() => onChange(shiftMonth(value, 1))} aria-label="Tháng sau">
        <ChevronRight className="size-5" />
      </button>
    </div>
  );
}

