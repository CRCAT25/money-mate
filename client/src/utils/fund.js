export function isVisibleFundPocket(pocket) {
  if (!pocket?.isDefault) return true;
  return Number(pocket.monthlyTarget || 0) > 0
    || Number(pocket.totalContributed || 0) > 0
    || Number(pocket.totalSpent || 0) > 0
    || Number(pocket.balance || 0) !== 0;
}

export function visibleFundPockets(pockets = []) {
  return pockets.filter(isVisibleFundPocket);
}
