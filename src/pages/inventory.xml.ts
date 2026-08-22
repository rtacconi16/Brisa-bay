import type { APIRoute } from 'astro';
import { ORIGIN } from '../data/site';
import { allStockistPages } from '../data/stockists';

const MARKETING = [
  ORIGIN,
  `${ORIGIN}/about`,
  `${ORIGIN}/ourWines`,
  `${ORIGIN}/findBrisaBay`,
  `${ORIGIN}/privacy`,
  `${ORIGIN}/terms`,
  `${ORIGIN}/accessibility`
];

export const GET: APIRoute = () => {
  const lastmod = new Date().toISOString().slice(0, 10);
  const locs = [
    ...MARKETING,
    ...allStockistPages().map((p) => `${ORIGIN}/stockists/${p.slug}`)
  ];
  const body = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...locs.map((loc) => `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`),
    '</urlset>',
    ''
  ].join('\n');
  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600'
    }
  });
};
