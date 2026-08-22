export const ORIGIN = 'https://www.brisabay.com';
export const CONTACT_EMAIL = 'info@brisabay.com';
export const INSTAGRAM = 'https://www.instagram.com/brisabaywines';
export const WIX_CLIENT_ID = 'e67c40ee-b5bc-459a-9e2b-267b8cf96c85';

export function copyright() {
  return `© Brisa Bay ${new Date().getFullYear()}`;
}

export type FaqItem = { id: string; q: string; a: string };

const FAQ: FaqItem[] = [
  {
    id: 'where-to-buy',
    q: 'Where can I buy Brisa Bay?',
    a: 'Use the store locator on our Where to Buy page to find the shops, bars and restaurants closest to you. If your favourite spot does not carry us yet, ask them to order it.'
  },
  {
    id: 'what',
    q: 'What do you make?',
    a: 'Two Napa Valley whites: a Chardonnay and a Sauvignon Blanc. Both are bright, low-oak and built for warm afternoons rather than the cellar.'
  },
  {
    id: 'shipping',
    q: 'Do you ship directly?',
    a: 'Not yet. We are focused on getting bottles onto local shelves first, so the fastest way to a glass is your nearest stockist.'
  },
  {
    id: 'visit',
    q: 'Can I visit the winery?',
    a: 'We do not have a tasting room open to the public yet. Follow along on Instagram for pop-ups, tastings and events where you can meet us.'
  },
  {
    id: 'contact',
    q: 'How do I get in touch?',
    a: `Email ${CONTACT_EMAIL} for trade, press or anything else. We read everything.`
  }
];

export function faq(overrides?: Record<string, string>): FaqItem[] {
  return FAQ.map((item) => {
    const next = overrides && Object.prototype.hasOwnProperty.call(overrides, item.id)
      ? overrides[item.id]
      : null;
    return next ? { ...item, a: next } : item;
  });
}

export function orgJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${ORIGIN}/#organization`,
    name: 'Brisa Bay',
    url: `${ORIGIN}/`,
    email: CONTACT_EMAIL,
    brand: { '@type': 'Brand', name: 'Brisa Bay', url: `${ORIGIN}/` },
    sameAs: [INSTAGRAM],
    contactPoint: {
      '@type': 'ContactPoint',
      email: CONTACT_EMAIL,
      contactType: 'customer service'
    }
  };
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Brisa Bay',
    url: `${ORIGIN}/`,
    inLanguage: 'en',
    publisher: { '@id': `${ORIGIN}/#organization` }
  };
}

export function breadcrumbJsonLd(name: string, path: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name, item: `${ORIGIN}${path}` }
    ]
  };
}

export function faqJsonLd(items: FaqItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: item.a }
    }))
  };
}

export function wineJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Product',
        additionalType: 'https://schema.org/Wine',
        name: 'Brisa Bay Napa Valley Chardonnay',
        brand: { '@type': 'Brand', name: 'Brisa Bay' },
        category: 'Wine',
        description: 'A brighter side of Napa Valley made for warm afternoons. Waves of ripe white peach and fresh citrus meet a tender texture and a mouthwatering acidity that quietly invites another sip.',
        image: `${ORIGIN}/assets/web2/bottle.webp`,
        url: `${ORIGIN}/ourWines#chardonnay`,
        additionalProperty: [
          { '@type': 'PropertyValue', name: 'vintage', value: '2024' },
          { '@type': 'PropertyValue', name: 'alcoholByVolume', value: '13.5%' },
          { '@type': 'PropertyValue', name: 'appellation', value: 'Napa Valley' }
        ]
      },
      {
        '@type': 'Product',
        additionalType: 'https://schema.org/Wine',
        name: 'Brisa Bay Napa Valley Sauvignon Blanc',
        brand: { '@type': 'Brand', name: 'Brisa Bay' },
        category: 'Wine',
        description: 'Our very first release: bright, energetic, and easygoing. Guava, passionfruit, and tropical flowers lead into juicy pineapple, lime, and a cool vein of stony minerality that lingers.',
        image: `${ORIGIN}/assets/web2/bottle-sauvblanc.webp`,
        url: `${ORIGIN}/ourWines#sauvignon-blanc`,
        additionalProperty: [
          { '@type': 'PropertyValue', name: 'vintage', value: '2024' },
          { '@type': 'PropertyValue', name: 'alcoholByVolume', value: '13.0%' },
          { '@type': 'PropertyValue', name: 'appellation', value: 'Napa Valley' }
        ]
      }
    ]
  };
}

export const CSP = {
  base: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; upgrade-insecure-requests",
  locator: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://tile.openstreetmap.org; connect-src 'self' https://photon.komoot.io https://www.wixapis.com https://edge.wixapis.com; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; upgrade-insecure-requests"
};
