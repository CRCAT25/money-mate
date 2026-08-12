const ACCESS_KEY = 'moneymate.accessToken';
const REFRESH_KEY = 'moneymate.refreshToken';
const SPACE_KEY_PREFIX = 'moneymate.space.';

export const sessionStorage = {
  getAccess: () => localStorage.getItem(ACCESS_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_KEY),
  set({ accessToken, refreshToken }) {
    if (accessToken) localStorage.setItem(ACCESS_KEY, accessToken);
    if (refreshToken) localStorage.setItem(REFRESH_KEY, refreshToken);
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  },
};

export const spaceStorage = {
  get: (userId) => userId ? localStorage.getItem(`${SPACE_KEY_PREFIX}${userId}`) : null,
  set(userId, spaceId) {
    if (userId && spaceId) localStorage.setItem(`${SPACE_KEY_PREFIX}${userId}`, spaceId);
  },
};
