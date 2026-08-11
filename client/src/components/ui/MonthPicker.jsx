import { ChevronLeft, ChevronRight } from 'lucide-react';
import { monthLabel, shiftMonth } from '../../utils/formatters.js';

export default function MonthPicker({ value, onChange, compact = false, dense = false, fullWidth = false, variant = 'default' }) {
  const isBudget = variant === 'budget';
  const buttonClass = dense ? 'size-8 rounded-lg' : 'size-9 rounded-lg';
  const labelClass = isBudget
    ? 'flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[10px] bg-sun/15 px-2 py-1.5'
    : fullWidth ? 'flex-1 lg:min-w-24 lg:flex-none' : dense ? 'min-w-24' : compact ? 'min-w-28' : 'min-w-36';
  const widthClass = isBudget
    ? 'flex w-full border'
    : fullWidth
    ? 'flex w-full border-y lg:inline-flex lg:w-auto lg:rounded-xl lg:border'
    : 'inline-flex border';
  const spacingClass = isBudget
    ? 'rounded-[15px] p-1'
    : dense
    ? fullWidth ? 'p-0.5' : 'rounded-xl p-0.5'
    : `rounded-xl ${compact ? 'p-1' : 'p-1'}`;
  const display = isBudget ? budgetMonthLabel(value) : monthLabel(value);

  return (
    <div className={`${widthClass} ${spacingClass} items-center border-ink/10 bg-white/75 shadow-sm`}>
      <button type="button" className={`grid place-items-center text-ink/55 transition active:scale-95 hover:bg-white hover:text-ink ${buttonClass}`} onClick={() => onChange(shiftMonth(value, -1))} aria-label="Tháng trước">
        <ChevronLeft className={dense ? 'size-4' : 'size-5'} />
      </button>
      <span className={`${labelClass} ${dense ? 'text-xs' : compact ? 'text-sm' : ''} text-center font-extrabold capitalize text-ink`}>
        {isBudget ? (
          <>
            <strong className="text-[13px] font-medium tracking-[-0.01em] sm:text-sm">{display.month}</strong>
            <span className="whitespace-nowrap text-[10px] font-semibold text-ink/42 sm:text-[11px]">({display.range})</span>
          </>
        ) : display}
      </span>
      <button type="button" className={`grid place-items-center text-ink/55 transition active:scale-95 hover:bg-white hover:text-ink ${buttonClass}`} onClick={() => onChange(shiftMonth(value, 1))} aria-label="Tháng sau">
        <ChevronRight className={dense ? 'size-4' : 'size-5'} />
      </button>
    </div>
  );
}

function budgetMonthLabel(value) {
  const [year, month] = value.split('-').map(Number);
  const monthText = String(month).padStart(2, '0');
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    month: `${monthText}/${year}`,
    range: `01/${monthText} - ${String(lastDay).padStart(2, '0')}/${monthText}`,
  };
}
