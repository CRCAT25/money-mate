import { AlertTriangle, LoaderCircle } from 'lucide-react';
import Modal from './Modal.jsx';

export default function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  loading = false,
  tone = 'danger',
  onConfirm,
  onClose,
}) {
  const close = () => {
    if (!loading) onClose();
  };

  return (
    <Modal open={open} title={title} onClose={close} compact>
      <div className="-mt-1">
        <div className={`mb-4 grid size-11 place-items-center rounded-[14px] ${tone === 'danger' ? 'bg-coral/10 text-coral' : 'bg-sun/20 text-[#9A752E]'}`}>
          <AlertTriangle className="size-5" strokeWidth={2} />
        </div>
        <p className="text-[13px] font-normal leading-5 text-ink/58 sm:text-sm">{description}</p>
        <div className="mt-6 grid grid-cols-2 gap-2.5">
          <button type="button" className="secondary-button min-h-11" onClick={close} disabled={loading}>{cancelLabel}</button>
          <button
            type="button"
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-55 ${tone === 'danger' ? 'bg-coral hover:bg-[#d9634b]' : 'bg-ink hover:bg-forest'}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading && <LoaderCircle className="size-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}
