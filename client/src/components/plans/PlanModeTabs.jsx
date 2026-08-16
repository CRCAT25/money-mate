import { NavLink } from 'react-router-dom';
import { Landmark, WalletCards } from 'lucide-react';

export default function PlanModeTabs({ showFund = true }) {
  if (!showFund) return null;

  return (
    <div className="grid grid-cols-2 rounded-[12px] bg-ink/[0.055] p-0.5">
      <PlanTab to="/plans" label="Chi tiêu" icon={WalletCards} />
      <PlanTab to="/fund-plans" label="Nạp quỹ" icon={Landmark} />
    </div>
  );
}

function PlanTab({ to, label, icon: Icon }) {
  return (
    <NavLink
      to={to}
      end
      className={({ isActive }) => `flex min-h-9 items-center justify-center gap-1.5 rounded-[10px] text-[11px] font-medium transition active:scale-[0.985] ${isActive ? 'bg-white text-ink shadow-sm' : 'text-ink/38'}`}
    >
      <Icon className="size-3.5" strokeWidth={2.1} />
      {label}
    </NavLink>
  );
}
