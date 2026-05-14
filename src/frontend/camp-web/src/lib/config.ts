function normalize(value: string) {
  return value.replace(/\/$/, '');
}

const canonicalHosts: Record<string, string> = {
  'camp.blagodaty.online': 'camp.blagodaty.ru',
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

function getDefaultLkBaseUrl() {
  if (
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ) {
    return 'http://localhost:5174';
  }

  return 'https://lk.blagodaty.ru';
}

export const apiBaseUrl = normalize(
  import.meta.env.VITE_API_BASE_URL ??
    (typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://localhost:5094'
      : ''),
);

export const lkBaseUrl = normalize(import.meta.env.VITE_LK_BASE_URL ?? getDefaultLkBaseUrl());
