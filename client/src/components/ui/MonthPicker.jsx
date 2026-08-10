import { ChevronLeft, ChevronRight } from 'lucide-react';
import { monthLabel, shiftMonth } from '../../utils/formatters.js';

export default function MonthPicker({ value, onChange, compact = false, dense = false }) {
  return (
    <div className={`inline-flex items-center border border-ink/10 bg-white/75 shadow-sm ${dense ? 'rounded-xl p-0.5' : `rounded-2xl ${compact ? 'p-1' : 'p-1.5'}`}`}>
      <button className={`grid place-items-center text-ink/55 transition hover:bg-white hover:text-ink ${dense ? 'size-8 rounded-lg' : 'size-10 rounded-xl'}`} onClick={() => onChange(shiftMonth(value, -1))} aria-label="Tháng trước">
        <ChevronLeft className={dense ? 'size-4' : 'size-5'} />
      </button>
      <span className={`${dense ? 'min-w-24 text-xs' : compact ? 'min-w-28 text-sm' : 'min-w-36'} text-center font-extrabold capitalize text-ink`}>{monthLabel(value)}</span>
      <button className={`grid place-items-center text-ink/55 transition hover:bg-white hover:text-ink ${dense ? 'size-8 rounded-lg' : 'size-10 rounded-xl'}`} onClick={() => onChange(shiftMonth(value, 1))} aria-label="Tháng sau">
        <ChevronRight className={dense ? 'size-4' : 'size-5'} />
      </button>
    </div>
  );
}
