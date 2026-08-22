import { defineMiddleware } from 'astro:middleware';

const ALIASES: Record<string, string> = {
  '/wines': '/ourWines',
  '/where-to-buy': '/findBrisaBay'
};

export const onRequest = defineMiddleware((context, next) => {
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

  return next();
});
