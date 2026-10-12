export default function Skeleton({ className = '', ...props }) {
  return <span aria-hidden="true" className={`skeleton block rounded-xl ${className}`} {...props} />;
}

export function TransactionListSkeleton({ rows = 4, compact = false }) {
  return (
    <div aria-label="Đang tải giao dịch" className="divide-y divide-ink/[0.06]" role="status">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={`flex items-center gap-3 ${compact ? 'py-3' : 'py-4'}`}>
          <Skeleton className="size-12 shrink-0 rounded-[17px]" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-2.5 w-36 max-w-[70%]" />
          </div>
          <Skeleton className="h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

export function CategoryGridSkeleton({ count = 8 }) {
  return (
    <div aria-label="Đang tải danh mục" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" role="status">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="flex items-center gap-4 rounded-[24px] border border-ink/[0.06] bg-paper/80 p-4">
          <Skeleton className="size-14 shrink-0 rounded-[18px]" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-32 max-w-[80%]" />
            <Skeleton className="h-2.5 w-24" />
          </div>
          <Skeleton className="size-9 rounded-xl" />
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ type = 'bar' }) {
  if (type === 'pie') {
    return (
      <div aria-label="Đang tải biểu đồ" className="grid h-64 place-items-center" role="status">
        <Skeleton className="size-44 rounded-full" />
      </div>
    );
  }

  return (
    <div aria-label="Đang tải biểu đồ" className="flex h-72 items-end justify-around gap-3 px-4 pb-2" role="status">
      {[42, 64, 51, 78, 58, 70, 47, 61, 74, 55, 67, 45].map((height, index) => (
        <Skeleton key={index} className="w-full max-w-5 rounded-t-lg rounded-b-none" style={{ height: `${height}%` }} />
      ))}
    </div>
  );
}

export function ShoppingListSkeleton({ count = 3 }) {
  return (
    <div aria-label="Đang tải danh sách mua sắm" className="space-y-2.5" role="status">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="rounded-[16px] border border-ink/[0.065] bg-paper/90 p-3.5 shadow-card">
          <div className="flex items-start gap-3">
            <Skeleton className="size-10 shrink-0 rounded-[12px]" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-32 max-w-[80%]" />
              <Skeleton className="h-3 w-24" />
            </div>
            <div className="flex flex-col items-end space-y-1.5">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-2.5 w-14" />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-end gap-1.5 border-t border-ink/[0.06] pt-2.5">
            <Skeleton className="size-8 rounded-lg" />
            <Skeleton className="size-8 rounded-lg" />
            <Skeleton className="h-8 w-28 rounded-[10px]" />
            <Skeleton className="size-8 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
