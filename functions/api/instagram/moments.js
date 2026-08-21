const FALLBACK = [
  { id: 'local-1', src: 'assets/web2/vibe-chardonnay.webp', alt: 'Brisa Bay Chardonnay chilling by the pool', permalink: 'https://www.instagram.com/brisabaywines' },
  { id: 'local-2', src: 'assets/web2/collage-a.webp', alt: 'Friends clinking glasses of Brisa Bay over a picnic blanket', permalink: 'https://www.instagram.com/brisabaywines' },
  { id: 'local-3', src: 'assets/web2/collage-b.webp', alt: 'A table set with Brisa Bay bottles, white wine and small plates', permalink: 'https://www.instagram.com/brisabaywines' },
  { id: 'local-4', src: 'assets/web2/collage-c.webp', alt: 'A pool float afternoon with a bottle of Brisa Bay Sauvignon Blanc', permalink: 'https://www.instagram.com/brisabaywines' },
  { id: 'local-5', src: 'assets/web2/better-together.webp', alt: 'Sharing Brisa Bay together outdoors', permalink: 'https://www.instagram.com/brisabaywines' },
  { id: 'local-6', src: 'assets/web2/every-occasion.webp', alt: 'Brisa Bay for an easy, unplanned occasion', permalink: 'https://www.instagram.com/brisabaywines' },
  { id: 'local-7', src: 'assets/web2/freshness-first.webp', alt: 'Chilled bottles of Brisa Bay held up against a blue sky', permalink: 'https://www.instagram.com/brisabaywines' },
  { id: 'local-8', src: 'assets/web2/intro-photo.webp', alt: 'An afternoon pour of Brisa Bay in the sun', permalink: 'https://www.instagram.com/brisabaywines' },
  { id: 'local-9', src: 'assets/web2/keeping-simple.webp', alt: 'Keeping it simple with Brisa Bay', permalink: 'https://www.instagram.com/brisabaywines' },
  { id: 'local-10', src: 'assets/web2/pour/16-img-6287.webp', alt: 'Pouring Brisa Bay at the table', permalink: 'https://www.instagram.com/brisabaywines' }
];

const DEFAULT_LIMIT = 10;
const CACHE_TTL_MS = 15 * 60 * 1000;
let cache = { at: 0, limit: null, payload: null };

function clampLimit(raw) {
  const n = Number.parseInt(raw, 10);
  if (!n) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(n, 25));
}

function captionAlt(caption) {
  if (!caption) return 'A Bottled Moment from @brisabaywines on Instagram';
  const one = String(caption).split(/\s+/).join(' ');
  return one.length > 140 ? `${one.slice(0, 140)}…` : one;
}

const MEDIA_FIELDS = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,children{media_type,media_url,thumbnail_url}';

function normalizeMedia(item) {
  const mediaType = String(item.media_type || '').toUpperCase();
  let src = item.media_url || item.thumbnail_url;
  if (mediaType === 'VIDEO') src = item.thumbnail_url || item.media_url;
  if (mediaType === 'CAROUSEL_ALBUM') {
    src = item.media_url || item.thumbnail_url;
    const children = (item.children && item.children.data) || [];
    if (!src && children[0]) src = children[0].media_url || children[0].thumbnail_url;
  }
  if (!src) return null;
  return {
    id: item.id || src,
    src,
    alt: captionAlt(item.caption),
    permalink: item.permalink || 'https://www.instagram.com/brisabaywines',
    mediaType: mediaType || 'IMAGE',
    timestamp: item.timestamp
  };
}

function isUgcCaption(caption, env) {
  if (!caption) return false;
  const hashtag = String((env && env.INSTAGRAM_HASHTAG) || 'BrisaBay').trim().replace(/^#/, '') || 'BrisaBay';
  const escaped = hashtag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(#${escaped}\\b|@brisabaywines\\b)`, 'i').test(caption);
}

function mergeMoments(tagged, own, limit, env) {
  const byTime = (a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || ''));
  tagged = [...tagged].sort(byTime);
  own = [...own].sort(byTime);
  const seen = new Set();
  const out = [];

  const add = (items, requireUgc) => {
    for (const item of items) {
      if (requireUgc && !isUgcCaption(item.caption, env)) continue;
      const n = normalizeMedia(item);
      if (!n) continue;
      const key = String(n.id);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(n);
      if (out.length >= limit) return true;
    }
    return false;
  };

  if (add(tagged, false)) return out;
  if (add(own, true)) return out;
  add(own, false);
  return out;
}

async function fetchEdge(env, edge, limit) {
  const userId = env.INSTAGRAM_USER_ID;
  const token = env.INSTAGRAM_ACCESS_TOKEN;
  const host = env.INSTAGRAM_GRAPH_HOST || 'graph.instagram.com';
  const version = env.INSTAGRAM_API_VERSION || 'v21.0';
  const url = `https://${host}/${version}/${userId}/${edge}?fields=${encodeURIComponent(MEDIA_FIELDS)}&limit=${Math.max(limit * 2, 25)}&access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Instagram ${edge} HTTP ${res.status}`);
  const payload = await res.json();
  return payload.data || [];
}

async function fetchInstagram(env, limit) {
  const own = await fetchEdge(env, 'media', limit);
  let tagged = [];
  try {
    tagged = await fetchEdge(env, 'tags', limit);
  } catch {
    tagged = [];
  }
  const moments = mergeMoments(tagged, own, limit, env);
  if (!moments.length) throw new Error('Instagram returned no displayable media');
  return moments;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const limit = clampLimit(url.searchParams.get('limit'));
  const now = Date.now();
  if (cache.payload && now - cache.at < CACHE_TTL_MS && cache.limit === limit) {
    const rest = { ...cache.payload };
    delete rest.limit;
    return json(rest);
  }

  const configured = Boolean(env.INSTAGRAM_USER_ID && env.INSTAGRAM_ACCESS_TOKEN);
  let payload;
  if (!configured) {
    payload = {
      moments: FALLBACK.slice(0, limit),
      source: 'fallback',
      configured: false,
      message: 'Set INSTAGRAM_USER_ID and INSTAGRAM_ACCESS_TOKEN as Pages secrets to load live Instagram media.'
    };
  } else {
    try {
      payload = {
        moments: await fetchInstagram(env, limit),
        source: 'instagram',
        configured: true
      };
    } catch (err) {
      payload = {
        moments: FALLBACK.slice(0, limit),
        source: 'fallback',
        configured: true,
        error: String(err && err.message ? err.message : err)
      };
    }
  }

  cache = { at: now, limit, payload: { ...payload, limit } };
  return json(payload);
}
