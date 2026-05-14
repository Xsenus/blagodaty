function normalize(value: string) {
  return value.replace(/\/$/, '');
}

const canonicalHosts: Record<string, string> = {
  'lk.blagodaty.online': 'lk.blagodaty.ru',
};

export function enforceCanonicalHost() {
  if (typeof window === 'undefined') {
    return;
  }

  const canonicalHost = canonicalHosts[window.location.hostname];
  if (!canonicalHost) {
    return;
  }

  const nextUrl = new URL(window.location.href);
  nextUrl.hostname = canonicalHost;
  window.location.replace(nextUrl.toString());
}

function getDefaultCampBaseUrl() {
  if (
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ) {
    return 'http://localhost:5173';
  }

  return 'https://camp.blagodaty.ru';
}

export const apiBaseUrl = normalize(
  import.meta.env.VITE_API_BASE_URL ??
    (typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://localhost:5094'
      : ''),
);

export const campBaseUrl = normalize(import.meta.env.VITE_CAMP_BASE_URL ?? getDefaultCampBaseUrl());
