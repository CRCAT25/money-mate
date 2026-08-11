import { ChevronLeft, ChevronRight } from 'lucide-react';
import { monthLabel, shiftMonth } from '../../utils/formatters.js';

export default function MonthPicker({ value, onChange, compact = false, dense = false, fullWidth = false }) {
  const buttonClass = dense ? 'size-8 rounded-lg' : 'size-9 rounded-lg';
  const labelClass = fullWidth ? 'flex-1 lg:min-w-24 lg:flex-none' : dense ? 'min-w-24' : compact ? 'min-w-28' : 'min-w-36';
  const widthClass = fullWidth
    ? 'flex w-full border-y lg:inline-flex lg:w-auto lg:rounded-xl lg:border'
    : 'inline-flex border';
  const spacingClass = dense
    ? fullWidth ? 'p-0.5' : 'rounded-xl p-0.5'
    : `rounded-xl ${compact ? 'p-1' : 'p-1'}`;

  return (
    <div className={`${widthClass} ${spacingClass} items-center border-ink/10 bg-white/75 shadow-sm`}>
      <button type="button" className={`grid place-items-center text-ink/55 transition active:scale-95 hover:bg-white hover:text-ink ${buttonClass}`} onClick={() => onChange(shiftMonth(value, -1))} aria-label="Tháng trước">
        <ChevronLeft className={dense ? 'size-4' : 'size-5'} />
      </button>
      <span className={`${labelClass} ${dense ? 'text-xs' : compact ? 'text-sm' : ''} text-center font-extrabold capitalize text-ink`}>{monthLabel(value)}</span>
      <button type="button" className={`grid place-items-center text-ink/55 transition active:scale-95 hover:bg-white hover:text-ink ${buttonClass}`} onClick={() => onChange(shiftMonth(value, 1))} aria-label="Tháng sau">
        <ChevronRight className={dense ? 'size-4' : 'size-5'} />
      </button>
    </div>
  );
}
