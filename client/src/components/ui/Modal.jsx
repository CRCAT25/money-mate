import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export default function Modal({ open, title, children, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => event.key === 'Escape' && onClose();
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', close);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', close);
    };
  }, [open, onClose]);

  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-sm sm:items-center sm:p-5" onMouseDown={onClose}>
      <section className="max-h-[92vh] w-full max-w-lg animate-rise-in overflow-y-auto rounded-t-[30px] bg-paper p-5 shadow-soft sm:rounded-[30px] sm:p-7" onMouseDown={(event) => event.stopPropagation()}>
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 className="font-editorial text-3xl font-semibold text-ink">{title}</h2>
          <button className="grid size-11 place-items-center rounded-full bg-ink/5 text-ink/60" onClick={onClose} aria-label="Đóng">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </section>
    </div>,
    document.body,
  );
}
