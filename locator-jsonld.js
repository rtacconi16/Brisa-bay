// Structured data for the store locator.
//
// The stockist list is rendered client-side, so a crawler that does not execute
// JavaScript sees an empty page. This emits schema.org markup once stores.json
// has loaded: an ItemList of Store entries with real postal addresses and
// coordinates, which is what search engines use to answer "where can I buy
// Brisa Bay near me".
//
// Injected as a JSON-LD <script> rather than written into the HTML because the
// data lives in stores.json now — one source of truth, no hand-maintained copy
// that silently drifts.
(() => {
  const BRAND = {
    '@type': 'Brand',
    name: 'Brisa Bay',
    url: 'https://brisabay.com/'
  };

  // schema.org has no "wine shop" type; map each stockist kind to the closest
  // standard one so the markup is honest rather than decorative.
  const TYPE_MAP = {
    'Liquor Store': 'LiquorStore',
    'Grocery': 'GroceryStore',
    'Restaurant': 'Restaurant',
    'Café': 'CafeOrCoffeeShop',
    'Wine Bar': 'BarOrPub',
    'Golf Course': 'GolfCourse',
    'Country Club': 'SportsActivityLocation',
    'Yacht Club': 'SportsActivityLocation'
  };

  function splitCity(city) {
    const parts = String(city || '').split(',').map((s) => s.trim());
    return { locality: parts[0] || '', region: parts[1] || '' };
  }

  function storeNode(s) {
    const { locality, region } = splitCity(s.city);
    const node = {
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

  function emit(stores) {
    if (!Array.isArray(stores) || !stores.length) return;
    const graph = {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Organization',
          name: 'Brisa Bay',
          url: 'https://brisabay.com/',
          brand: BRAND,
          sameAs: ['https://www.instagram.com/brisabaywines'],
          contactPoint: {
            '@type': 'ContactPoint',
            // site-data.js is loaded before this file on where-to-buy.html; the
            // fallback only matters if that ever stops being true.
            email: (window.BBSite && window.BBSite.contactEmail) || 'info@brisabay.com',
            contactType: 'customer service'
          }
        },
        {
          '@type': 'ItemList',
          name: 'Brisa Bay stockists',
          description: 'Shops, bars and restaurants carrying Brisa Bay Napa Valley wine.',
          numberOfItems: stores.length,
          itemListElement: stores.map((s, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            item: storeNode(s)
          }))
        }
      ]
    };
    const el = document.createElement('script');
    el.type = 'application/ld+json';
    el.setAttribute('data-bb-jsonld', '');
    el.textContent = JSON.stringify(graph);
    document.head.appendChild(el);
  }

  window.BBStructuredData = { emit };
})();
