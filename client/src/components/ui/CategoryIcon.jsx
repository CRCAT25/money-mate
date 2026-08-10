import {
  Baby,
  Car,
  Coffee,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  PawPrint,
  PiggyBank,
  Plane,
  ReceiptText,
  Shapes,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Utensils,
  WalletCards,
} from 'lucide-react';

const icons = {
  Baby,
  Car,
  Coffee,
  Gamepad2,
  Gift,
  GraduationCap,
  HeartPulse,
  House,
  PawPrint,
  PiggyBank,
  Plane,
  ReceiptText,
  Shapes,
  ShoppingBag,
  Sparkles,
  TrendingUp,
  Utensils,
  WalletCards,
};

export default function CategoryIcon({ name, className = 'size-5', strokeWidth = 2 }) {
  const Icon = icons[name] || Shapes;
  return <Icon className={className} strokeWidth={strokeWidth} />;
}
