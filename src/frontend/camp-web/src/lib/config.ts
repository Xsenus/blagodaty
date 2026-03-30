function normalize(value: string) {
  return value.replace(/\/$/, '');
}

function deriveSiblingSubdomain(fromPrefix: string, toPrefix: string) {
  if (typeof window === 'undefined') {
    return '';
  }

  const { protocol, host, hostname } = window.location;
  if (hostname.startsWith(`${fromPrefix}.`)) {
    return `${protocol}//${host.replace(`${fromPrefix}.`, `${toPrefix}.`)}`;
  }

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'http://localhost:5174';
  }

  return `${protocol}//${toPrefix}.${hostname}`;
}

export const apiBaseUrl = normalize(
  import.meta.env.VITE_API_BASE_URL ??
    (typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
      ? 'http://localhost:5094'
      : ''),
);

export const lkBaseUrl = normalize(import.meta.env.VITE_LK_BASE_URL ?? deriveSiblingSubdomain('camp', 'lk'));
