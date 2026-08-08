// Search ranking and geocode filtering for the store locator.
//
// These functions used to live inside where-to-buy.html's logic block, which is
// a <script type="text/x-dc"> the runtime compiles with new Function. Nothing
// can import that: not a linter, not a bundler, and not a test. So
// tools/test-locator.mjs pulled the implementations back out with eight regexes
// like /function searchScore[\s\S]*?\n  return score;\n}/ and eval'd them.
//
// That coupling ran the wrong way. Reformatting the page, or ending searchScore
// with anything other than `return score;`, broke the test suite — so the tests
// discouraged touching the very code they protect. They now load this file the
// same way they already load locator-util.js.
//
// Everything here is pure: same inputs, same outputs, no DOM, no network, no
// module state. The parts that are none of those — loadStores, geocodePlace,
// and storeBias, which reads the loaded store list — stay in the page.
//
// Loaded after locator-util.js, whose milesBetween this depends on.
//
// Bump the ?v= on the <script> in where-to-buy.html when this file changes.
(function (global) {
  'use strict';

  /** Fold case, accents and punctuation so "ruths chris" finds "Ruth's Chris"
     and "cafe" finds "Café". The dataset is full of both. */
  function normalizeText(s) {
    let out = String(s == null ? '' : s).toLowerCase();
    if (out.normalize) out = out.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return out.replace(/[\u2019'`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function queryTokens(q) {
    return normalizeText(q).split(' ').filter(Boolean);
  }

  /** Every token must appear somewhere, and where it appears decides the rank.
     A single contiguous match would fail on ordinary two-word queries like
     "carmela boca" or "wine bar key west". */
  function searchScore(s, tokens) {
    if (!tokens.length) return 1;
    if (!s._norm) {
      s._norm = {
        name: normalizeText(s.name),
        city: normalizeText(s.city),
        type: normalizeText(s.type),
        addr: normalizeText(s.address)
      };
    }
    const { name, city, type } = s._norm;
    const hay = name + ' ' + city + ' ' + type + ' ' + s._norm.addr;
    let score = 0;
    for (const t of tokens) {
      if (!hay.includes(t)) return 0;
      if (name.startsWith(t)) score += 5;
      else if (name.includes(t)) score += 4;
      else if (city.startsWith(t)) score += 3;
      else if (city.includes(t)) score += 2;
      else if (type.includes(t)) score += 2;
      else score += 1;
    }
    return score;
  }

  function textMatchesQuery(s, q) {
    return searchScore(s, queryTokens(q)) > 0;
  }

  function featureLabel(p, fallback) {
    const street = p.street ? ((p.housenumber ? p.housenumber + ' ' : '') + p.street) : '';
    const name = p.name && !/^\d+$/.test(String(p.name)) ? p.name : '';
    return [name, street, p.city || p.county, p.state, p.postcode]
      .filter(Boolean)
      .filter((part, i, arr) => arr.indexOf(part) === i)
      .join(', ') || fallback;
  }

  // How prominent a place is, independent of where our stores happen to be. A
  // city outranks a hamlet of the same name no matter how far away it is.
  const PLACE_PROMINENCE = {
    city: 100, postcode: 92, town: 78, county: 62, municipality: 62,
    suburb: 55, village: 48, borough: 48, neighbourhood: 40, quarter: 38,
    hamlet: 28, locality: 24, isolated_dwelling: 12,
    house: 70, building: 66, commercial: 62, retail: 62,
    residential: 20, tertiary: 20, secondary: 20, primary: 20, unclassified: 15
  };

  // Photon already returns candidates in relevance order, and that ordering
  // encodes real-world prominence better than anything we can reconstruct from
  // the fields it exposes: "columbus" comes back Ohio-first, "portland"
  // Oregon-first, "springfield" Massachusetts-first. Treat that rank as the
  // primary signal rather than throwing it away by re-sorting.
  const RANK_WEIGHT = 12;

  // The distance term is a tiebreaker between adjacent, equally-prominent
  // candidates — never a filter. Capped well below one rank step so it can settle
  // a tie but never overturn Photon's ordering or promote a hamlet over a city.
  // Getting this wrong previously made every place more than ~1,080 miles away
  // report as "could not find that place".
  const MAX_DISTANCE_PENALTY = 8;

  function scoreGeocodeFeature(f, bias, rank = 0) {
    const milesBetween = global.BBLocator.milesBetween;
    const p = f.properties || {};
    const [lng, lat] = f.geometry.coordinates;
    let score = 0;

    const country = String(p.country || '');
    const cc = String(p.countrycode || '').toUpperCase();
    // The stockist footprint is entirely US/PR, so a non-US hit is almost always
    // the wrong Springfield. Still a ranking signal, not a veto.
    if (cc === 'US' || cc === 'PR' || /united states|puerto rico/i.test(country)) score += 120;
    else score -= 60;

    const kind = String(p.osm_value || p.type || '').toLowerCase();
    score += PLACE_PROMINENCE[kind] != null ? PLACE_PROMINENCE[kind] : 30;

    score += Math.max(0, 8 - rank) * RANK_WEIGHT;

    const mi = milesBetween(bias, { lat, lng });
    score -= Math.min(mi / 250, MAX_DISTANCE_PENALTY);
    return score;
  }

  /** Did we get a real place, as opposed to nothing usable? Deliberately not a
     judgement about whether we have stores near it — that is a separate question
     the page answers separately. */
  function isPlausiblePlace(f, bias, rank = 0) {
    const p = f.properties || {};
    const cc = String(p.countrycode || '').toUpperCase();
    const isUs = cc === 'US' || cc === 'PR' || /united states|puerto rico/i.test(String(p.country || ''));
    return isUs && scoreGeocodeFeature(f, bias, rank) > 0;
  }

  global.BBSearch = {
    normalizeText: normalizeText,
    queryTokens: queryTokens,
    searchScore: searchScore,
    textMatchesQuery: textMatchesQuery,
    featureLabel: featureLabel,
    scoreGeocodeFeature: scoreGeocodeFeature,
    isPlausiblePlace: isPlausiblePlace,
    PLACE_PROMINENCE: PLACE_PROMINENCE,
    RANK_WEIGHT: RANK_WEIGHT,
    MAX_DISTANCE_PENALTY: MAX_DISTANCE_PENALTY
  };
})(typeof window !== 'undefined' ? window : globalThis);
