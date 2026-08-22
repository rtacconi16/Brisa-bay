import storesDoc from '../../stores.json';
import { ORIGIN } from './site';

export type Store = {
  id: string;
  name: string;
  type: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  phone?: string;
  url?: string;
};

export function loadStores(): Store[] {
  return (storesDoc as { stores: Store[] }).stores;
}

const TYPE_MAP: Record<string, string> = {
  'Liquor Store': 'LiquorStore',
  Grocery: 'GroceryStore',
  Restaurant: 'Restaurant',
  Café: 'CafeOrCoffeeShop',
  'Wine Bar': 'BarOrPub',
  'Golf Course': 'GolfCourse',
  'Country Club': 'SportsActivityLocation',
  'Yacht Club': 'SportsActivityLocation'
};

const STATE_NAME: Record<string, string> = {
  FL: 'Florida', GA: 'Georgia', NJ: 'New Jersey', PR: 'Puerto Rico', OH: 'Ohio',
  NY: 'New York', AZ: 'Arizona'
};

export const CITY_COPY: Record<string, string> = {
  'Atlanta, GA': 'Atlanta is Brisa Bay’s deepest pocket in the South — nine shops, restaurants and clubs from Midtown to the perimeter, where a Napa bottle sits next to Georgia produce rather than behind a velvet rope. Look for us at independent grocers and rooms that pour by the glass when the weather finally breaks.',
  'San Juan, PR': 'San Juan was an early home for the brand outside the mainland. Six accounts around the capital pour Brisa Bay the way the island drinks wine: cold, with food, and without a lecture. Ask at the grocer or the restaurant that already has a white on the list.',
  'Boca Raton, FL': 'Boca Raton’s five stockists run from a yacht club to neighborhood markets along the Federal Highway strip. This is Florida lunch-into-dinner wine — Chardonnay for a long table, Sauvignon Blanc for the first hot afternoon that feels like summer in January.',
  'Decatur, GA': 'Decatur sits just east of Atlanta and drinks like a small town that happens to have serious grocery. Four independent shops here carry both bottles; it is one of the easiest places in Georgia to walk out with Brisa Bay the same day you decide you want it.',
  'Miami, FL': 'Miami’s three stockists are groceries first — the kind of stores where you grab citrus, a baguette and a cold white without making an evening of it. That is the point of the wine. If you are already in town, start here before you drive north.',
  'Cumming, GA': 'Cumming, north of Atlanta, has three accounts that treat Napa wine as a weeknight grocery item. No tasting room appointment. If you are in Forsyth County, these are the shelves to check.',
  'Long Branch, NJ': 'Long Branch sits on the Jersey Shore, and the three shops here make sense of a coastal white: cold Sauvignon Blanc after the beach, Chardonnay when dinner runs late. The same bottle you would open in Napa, sold like any other good grocery find.',
  'Red Bank, NJ': 'Red Bank’s three stockists serve a river town that already knows how to eat. Independent shops and restaurants here are why Brisa Bay shows up on the Shore without a distributor song-and-dance at the table.',
  'Columbus, OH': 'Columbus is the Midwest foothold — three accounts in a city that buys wine at the grocery store and drinks it the same night. If you are looking between the coasts, start here rather than assuming Napa never left California.',
  'Caguas, PR': 'Caguas, inland from San Juan, has three shops that carry the wines for people who are not on vacation. Same bottles, less tourist traffic, still cold from the fridge.',
  'Palm Beach Gardens, FL': 'Palm Beach Gardens has two stockists for the north-county crowd that would rather pick up a bottle on the way home than book a tasting. Check both before you drive down to West Palm.',
  'West Palm Beach, FL': 'West Palm Beach’s two accounts sit in the county’s everyday shopping pattern — groceries and a specialty shop, not a destination winery. Useful if you are staying in town and want Napa without the ceremony.',
  'Delray Beach, FL': 'Delray Beach drinks outside. Two shops here cover the Atlantic Avenue orbit: one for the picnic, one for the restaurant that already has whites by the glass.',
  'Avondale Estates, GA': 'Avondale Estates is a two-shop town just east of Decatur. If Atlanta’s bigger list feels like a project, this is the smaller, walkable version of the same idea.',
  'Asbury Park, NJ': 'Asbury Park’s two stockists match a boardwalk town that stays up late. Cold white wine, not cellar talk — the Shore version of skip-the-cellar.',
  'Naranjito, PR': 'Naranjito is a small inland town with two shops carrying Brisa Bay. It is not on a visitor itinerary, which is exactly why the wine belongs on those shelves.'
};

export const STATE_COPY: Record<string, string> = {
  FL: 'Florida is Brisa Bay’s largest state by account count, stretched from the Panhandle to the Keys. The city pages below cover the denser pockets; everywhere else is a single shop — still worth a call if you are nearby, and still on the map at Where to Buy.',
  GA: 'Georgia is the Atlanta metro, mostly: the city itself, Decatur, Cumming and Avondale Estates have their own pages. The one-off shops in the rest of the metro are listed here so a trip to Johns Creek or Marietta is not a dead end.',
  NJ: 'New Jersey is a Shore and a North Jersey story. Long Branch, Red Bank and Asbury Park have enough accounts for their own pages; the rest of the state is a single shop in each town, collected below.',
  PR: 'Puerto Rico is the largest island footprint — San Juan, Caguas and Naranjito first, then a scatter of north-coast and mountain-town shops. If you are not in those three cities, start with the list on this page.',
  OH: 'Ohio is Columbus plus one neighboring shop in Westerville. The city page covers the three Columbus accounts; Westerville is here so the state is not a dead end if you live one suburb over.'
};

export function splitCity(city: string) {
  const parts = String(city || '').split(',').map((s) => s.trim());
  return { locality: parts[0] || '', region: parts[1] || '' };
}

export function slugCity(city: string) {
  const { locality, region } = splitCity(city);
  return `${locality}-${region}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function slugState(st: string) {
  const name = STATE_NAME[st];
  if (!name) throw new Error(`unknown state ${st}`);
  return name.toLowerCase().replace(/\s+/g, '-');
}

export type StockistPage = {
  slug: string;
  kind: 'city' | 'state';
  title: string;
  description: string;
  h1: string;
  lead: string;
  label: string;
  list: Store[];
  jsonName: string;
  jsonDesc: string;
  cityLinks?: { slug: string; locality: string; n: number }[];
  stateName?: string;
};

export function allStockistPages(): StockistPage[] {
  const stores = loadStores();
  const byCity = new Map<string, Store[]>();
  for (const s of stores) {
    if (!byCity.has(s.city)) byCity.set(s.city, []);
    byCity.get(s.city)!.push(s);
  }
  const cityPages = [...byCity.entries()]
    .filter(([, list]) => list.length >= 2)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

  const pages: StockistPage[] = [];
  for (const [city, list] of cityPages) {
    const { locality, region } = splitCity(city);
    const lead = CITY_COPY[city];
    if (!lead) throw new Error(`missing unique copy for ${city}`);
    pages.push({
      slug: slugCity(city),
      kind: 'city',
      title: `Where to Buy Brisa Bay in ${locality}, ${region}`,
      description: `Find Brisa Bay Napa Valley Chardonnay and Sauvignon Blanc in ${locality}, ${region}. ${list.length} stockists with addresses.`,
      h1: `Brisa Bay in ${locality}`,
      lead,
      label: `${locality}, ${region}`,
      list,
      jsonName: `Brisa Bay stockists in ${locality}, ${region}`,
      jsonDesc: `Shops, bars and restaurants carrying Brisa Bay in ${locality}.`
    });
  }

  const citySet = new Set(cityPages.map(([c]) => c));
  const byState = new Map<string, Store[]>();
  for (const s of stores) {
    const st = splitCity(s.city).region;
    if (!STATE_COPY[st]) continue;
    if (!byState.has(st)) byState.set(st, []);
    byState.get(st)!.push(s);
  }
  for (const [st, list] of [...byState.entries()].sort()) {
    const stateName = STATE_NAME[st];
    const lead = STATE_COPY[st];
    if (!stateName || !lead) throw new Error(`missing state copy for ${st}`);
    const singles = list.filter((s) => !citySet.has(s.city));
    const cityLinks = cityPages
      .filter(([c]) => splitCity(c).region === st)
      .map(([c, clist]) => ({ slug: slugCity(c), locality: splitCity(c).locality, n: clist.length }));
    pages.push({
      slug: slugState(st),
      kind: 'state',
      title: `Where to Buy Brisa Bay in ${stateName}`,
      description: `Brisa Bay Napa Valley wine stockists across ${stateName}. City pages for the denser markets, plus every other shop in the state.`,
      h1: `Brisa Bay in ${stateName}`,
      lead,
      label: stateName,
      list: singles.length ? singles : list,
      jsonName: `Brisa Bay stockists in ${stateName}`,
      jsonDesc: `Shops carrying Brisa Bay Napa Valley wine in ${stateName}.`,
      cityLinks,
      stateName
    });
  }
  return pages;
}

export function storeNode(s: Store) {
  const { locality, region } = splitCity(s.city);
  const node: Record<string, unknown> = {
    '@type': TYPE_MAP[s.type] || 'Store',
    name: s.name,
    address: {
      '@type': 'PostalAddress',
      streetAddress: s.address,
      addressLocality: locality,
      addressRegion: region,
      addressCountry: region === 'PR' ? 'PR' : 'US'
    },
    geo: { '@type': 'GeoCoordinates', latitude: s.lat, longitude: s.lng }
  };
  if (s.phone) node.telephone = s.phone;
  if (s.url) node.url = s.url;
  return node;
}

export function stockistJsonLd(page: StockistPage) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: page.jsonName,
    description: page.jsonDesc,
    numberOfItems: page.list.length,
    itemListElement: page.list.map((s, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: storeNode(s)
    }))
  };
}

export function stockistBreadcrumb(page: StockistPage) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name: 'Where to Buy', item: `${ORIGIN}/findBrisaBay` },
      { '@type': 'ListItem', position: 3, name: page.h1, item: `${ORIGIN}/stockists/${page.slug}` }
    ]
  };
}
