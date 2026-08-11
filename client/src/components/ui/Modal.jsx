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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 backdrop-blur-sm sm:items-center sm:p-5" onPointerDown={onClose}>
      <section role="dialog" aria-modal="true" aria-labelledby="modal-title" className="max-h-[92vh] w-full max-w-lg animate-rise-in overflow-y-auto rounded-t-[20px] bg-paper p-4 shadow-soft sm:rounded-[20px] sm:p-6" onPointerDown={(event) => event.stopPropagation()}>
        <div className="mb-6 flex items-center justify-between gap-4">
          <h2 id="modal-title" className="font-editorial text-2xl font-semibold text-ink">{title}</h2>
          <button type="button" className="grid size-10 place-items-center rounded-xl bg-ink/5 text-ink/60" onClick={onClose} aria-label="Đóng">
            <X className="size-5" />
          </button>
        </div>
        {children}
      </section>
    </div>,
    document.body,
  );
}
