/**
 * Helper to dynamically extract the base URL and domain from the current window location/headers.
 * Ensures QR codes, join links, and host display instructions automatically match whatever
 * domain or host the app is deployed or accessed on.
 */

export const getBaseUrl = (): string => {
  if (typeof window !== 'undefined' && window.location) {
    return window.location.origin;
  }
  return '';
};

export const getDisplayDomain = (): string => {
  if (typeof window !== 'undefined' && window.location) {
    return window.location.host;
  }
  return '';
};

export const getRoomJoinUrl = (roomCode: string): string => {
  const base = getBaseUrl();
  return `${base}?room=${encodeURIComponent(roomCode)}`;
};
