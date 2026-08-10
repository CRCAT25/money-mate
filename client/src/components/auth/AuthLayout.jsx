export default function AuthLayout({ eyebrow, title, description, children }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-5 py-10 sm:px-8">
      <section className="w-full max-w-md animate-rise-in">
        <div className="mb-10 flex items-center justify-center gap-3">
          <div className="grid size-12 place-items-center rounded-2xl bg-ink font-editorial text-2xl font-bold text-white shadow-card">M</div>
          <span className="text-xl font-extrabold tracking-[-0.03em] text-ink">MoneyMate</span>
        </div>
        {eyebrow && <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.18em] text-coral">{eyebrow}</p>}
        <h1 className={`${eyebrow ? 'text-left text-[42px] sm:text-5xl' : 'text-center text-3xl sm:text-4xl'} font-editorial font-semibold leading-[1.02] tracking-[-0.03em] text-ink`}>{title}</h1>
        {description && <p className="mt-4 leading-7 text-ink/55">{description}</p>}
        <div className="mt-8">{children}</div>
      </section>
    </main>
  );
}
