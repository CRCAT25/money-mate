const ACCESS_KEY = 'moneymate.accessToken';
const REFRESH_KEY = 'moneymate.refreshToken';
const SPACE_KEY_PREFIX = 'moneymate.space.';
const USER_KEY = 'moneymate.user';
const SPACES_KEY = 'moneymate.spaces';

export const userStorage = {
  get: () => {
    try {
      const data = localStorage.getItem(USER_KEY);
      return data ? JSON.parse(data) : null;
    } catch {
      return null;
    }
  },
  set(user) {
    try {
      if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
      else localStorage.removeItem(USER_KEY);
    } catch {}
  },
  getSpaces: () => {
    try {
      const data = localStorage.getItem(SPACES_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  },
  setSpaces(spaces) {
    try {
      if (spaces) localStorage.setItem(SPACES_KEY, JSON.stringify(spaces));
      else localStorage.removeItem(SPACES_KEY);
    } catch {}
  },
  clear() {
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(SPACES_KEY);
  },
};

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
    userStorage.clear();
  },
};

export const spaceStorage = {
  get: (userId) => userId ? localStorage.getItem(`${SPACE_KEY_PREFIX}${userId}`) : null,
  set(userId, spaceId) {
    if (userId && spaceId) localStorage.setItem(`${SPACE_KEY_PREFIX}${userId}`, spaceId);
  },
};

