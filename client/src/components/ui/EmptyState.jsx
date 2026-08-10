import { ReceiptText } from 'lucide-react';

export default function EmptyState({ title = 'Chưa có dữ liệu', description, action }) {
  return (
    <div className="rounded-[28px] border border-dashed border-ink/15 bg-white/45 px-6 py-10 text-center">
      <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-mint text-forest">
        <ReceiptText className="size-6" />
      </div>
      <h3 className="font-bold text-ink">{title}</h3>
      {description && <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-ink/55">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

