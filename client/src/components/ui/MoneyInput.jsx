import { forwardRef, useImperativeHandle, useRef } from 'react';
import { formatInputAmount, normalizeAmountDigits } from '../../utils/formatters.js';

const MoneyInput = forwardRef(function MoneyInput({ value = '', onChange, maxDigits = 12, onFocus, onBlur, ...props }, forwardedRef) {
  const inputRef = useRef(null);

  useImperativeHandle(forwardedRef, () => inputRef.current);

  return (
    <input
      {...props}
      ref={inputRef}
      value={formatInputAmount(value)}
      onFocus={(event) => {
        window.requestAnimationFrame(() => {
          const input = inputRef.current;
          if (!input) return;
          const cursor = input.value.length;
          input.setSelectionRange(cursor, cursor);
        });
        onFocus?.(event);
      }}
      onChange={(event) => {
        const inputValue = event.currentTarget.value;
        const cursor = event.currentTarget.selectionStart ?? inputValue.length;
        const digitsBeforeCursor = (inputValue.slice(0, cursor).match(/\d/g) || []).length;
        const nextValue = normalizeAmountDigits(inputValue, maxDigits);
        onChange(nextValue);

        // Keep the caret beside the same digit after separators are inserted.
        window.requestAnimationFrame(() => {
          const input = inputRef.current;
          if (!input) return;
          const formatted = formatInputAmount(nextValue);
          let digitCount = 0;
          let nextCursor = formatted.length;
          for (let index = 0; index < formatted.length; index += 1) {
            if (/\d/.test(formatted[index])) digitCount += 1;
            if (digitCount === digitsBeforeCursor) {
              nextCursor = index + 1;
              break;
            }
          }
          input.setSelectionRange(nextCursor, nextCursor);
        });
      }}
      onBlur={(event) => {
        onBlur?.(event);
      }}
    />
  );
});

export default MoneyInput;
