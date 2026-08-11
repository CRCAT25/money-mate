export default function AuthLayout({ eyebrow, title, description, children }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-4 py-8 sm:px-8">
      <section className="w-full max-w-md animate-rise-in">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <div className="grid size-10 place-items-center rounded-xl bg-ink font-editorial text-xl font-bold text-white shadow-card">M</div>
          <span className="text-lg font-extrabold tracking-[-0.03em] text-ink">MoneyMate</span>
        </div>
        {eyebrow && <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.18em] text-coral">{eyebrow}</p>}
        <h1 className={`${eyebrow ? 'text-left text-[30px] sm:text-4xl' : 'text-center text-2xl sm:text-3xl'} font-editorial font-semibold leading-[1.05] tracking-[-0.03em] text-ink`}>{title}</h1>
        {description && <p className="mt-4 leading-7 text-ink/55">{description}</p>}
        <div className="mt-6">{children}</div>
      </section>
    </main>
  );
}
