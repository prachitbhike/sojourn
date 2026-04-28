const BANNER_KEY_PREFIX = 'sojourn:editBannerSeen:';

export function getBannerSeen(slug: string): boolean {
  try {
    return window.localStorage.getItem(BANNER_KEY_PREFIX + slug) === '1';
  } catch {
    return false;
  }
}

export function setBannerSeen(slug: string): void {
  try {
    window.localStorage.setItem(BANNER_KEY_PREFIX + slug, '1');
  } catch {
    // localStorage unavailable (incognito quota, etc.) — banner reappears next visit
  }
}
