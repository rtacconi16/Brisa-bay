import { defineMiddleware } from 'astro:middleware';

const ALIASES: Record<string, string> = {
  '/wines': '/ourWines',
  '/where-to-buy': '/findBrisaBay'
};

const SECURITY_HEADERS: [string, string][] = [
  ['Content-Security-Policy', "frame-ancestors 'none'"],
  ['X-Frame-Options', 'DENY'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)']
];

function httpsRewrite(value: string) {
  return value
    .replace(/http:\/\/www\.brisabay\.com/g, 'https://www.brisabay.com')
    .replace(/http%3A%2F%2Fwww\.brisabay\.com/gi, 'https%3A%2F%2Fwww.brisabay.com');
}

function isHashedOrStaticAsset(pathname: string) {
  return (
    pathname.startsWith('/_astro/') ||
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/js/') ||
    pathname === '/favicon.ico' ||
    pathname === '/apple-touch-icon.png' ||
    pathname === '/favicon.png'
  );
}

function applyResponseHeaders(response: Response, pathname: string) {
  const headers = new Headers();
  response.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (pathname.startsWith('/api/auth') && (lower === 'location' || lower === 'set-cookie')) {
      headers.append(key, httpsRewrite(value));
      return;
    }
    headers.append(key, value);
  });

  for (const [name, value] of SECURITY_HEADERS) {
    if (!headers.has(name)) headers.set(name, value);
  }

  const skipCache = pathname.startsWith('/api/') || pathname === '/admin';
  if (!skipCache && !headers.has('Cache-Control')) {
    if (isHashedOrStaticAsset(pathname)) {
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      const type = headers.get('content-type') || '';
      if (!type || type.includes('text/html') || type.includes('application/xml') || type.includes('text/plain')) {
        headers.set('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400');
      }
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export const onRequest = defineMiddleware(async (context, next) => {
  const url = context.url;
  let pathname = url.pathname;

  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
    const dest = (ALIASES[pathname] || pathname) + url.search;
    return context.redirect(dest, 301);
  }

  const hadHtml = pathname.endsWith('.html');
  if (hadHtml) pathname = pathname.replace(/\.html$/, '') || '/';

  const alias = ALIASES[pathname];
  if (alias) return context.redirect(alias + url.search, 301);
  if (hadHtml) return context.redirect(pathname + url.search, 301);

  const response = await next();
  return applyResponseHeaders(response, pathname);
});
