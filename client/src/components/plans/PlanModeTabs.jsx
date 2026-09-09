import { NavLink } from 'react-router-dom';
import { Landmark, ShoppingBasket, TrendingUp, WalletCards } from 'lucide-react';
import { useFamilyData } from '../../context/FamilyContext.jsx';

export default function PlanModeTabs({ showFund = true }) {
  const { familyDetails, isPersonal } = useFamilyData();
  const showSpendingPlan = isPersonal || familyDetails?.showSpendingPlan !== false;
  const showIncomePlan = isPersonal || familyDetails?.showIncomePlan !== false;
  const showFundPlan = showFund && (isPersonal || familyDetails?.showFundPlan !== false);
  const showShoppingPlan = isPersonal || familyDetails?.showShoppingPlan !== false;
  const tabCount = [showSpendingPlan, showIncomePlan, showFundPlan, showShoppingPlan].filter(Boolean).length;
  const gridClass = tabCount === 4 ? 'grid-cols-4' : tabCount === 3 ? 'grid-cols-3' : tabCount === 2 ? 'grid-cols-2' : 'grid-cols-1';
  return (
    <div className={`grid rounded-[12px] bg-ink/[0.055] p-0.5 ${gridClass}`}>
      {showSpendingPlan && <PlanTab to="/plans" label="Chi tiêu" icon={WalletCards} />}
      {showIncomePlan && <PlanTab to="/income-plans" label="Thu nhập" icon={TrendingUp} />}
      {showFundPlan && <PlanTab to="/fund-plans" label="Nạp quỹ" icon={Landmark} />}
      {showShoppingPlan && <PlanTab to="/shopping" label="Mua sắm" icon={ShoppingBasket} />}
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
