// Shared schema.org markup for Brisa Bay pages.
//
// Titles and Open Graph tags are static in <head> so crawlers that do not run
// JavaScript still see them. JSON-LD is injected here, after site-data.js, so
// Organization / FAQPage stay in lockstep with BBSite instead of being copied
// into seven HTML files.
//
// Bump the ?v= on every page that loads this file when it changes.
(function () {
  'use strict';

  var ORIGIN = 'https://brisabay.com/';
  var EMAIL = (window.BBSite && window.BBSite.contactEmail) || 'info@brisabay.com';

  function emit(obj) {
    var el = document.createElement('script');
    el.type = 'application/ld+json';
    el.setAttribute('data-bb-seo', '');
    el.textContent = JSON.stringify(obj);
    document.head.appendChild(el);
  }

  function pageName() {
    try {
      var path = (window.location && window.location.pathname) || '';
      var name = path.split('/').pop();
      return name || 'index.html';
    } catch (e) {
      return 'index.html';
    }
  }

  emit({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORIGIN + '#organization',
    name: 'Brisa Bay',
    url: ORIGIN,
    email: EMAIL,
    brand: { '@type': 'Brand', name: 'Brisa Bay', url: ORIGIN },
    sameAs: ['https://www.instagram.com/brisabaywines'],
    contactPoint: {
      '@type': 'ContactPoint',
      email: EMAIL,
      contactType: 'customer service'
    }
  });

  emit({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Brisa Bay',
    url: ORIGIN,
    inLanguage: 'en',
    publisher: { '@id': ORIGIN + '#organization' }
  });

  var page = pageName();
  var crumbs = {
    'about.html': ['About'],
    'wines.html': ['Our Wines'],
    'happenings.html': ['Happenings'],
    'where-to-buy.html': ['Where to Buy'],
    'privacy.html': ['Privacy Policy'],
    'terms.html': ['Terms of Service'],
    'accessibility.html': ['Accessibility']
  };
  if (crumbs[page]) {
    emit({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: ORIGIN },
        { '@type': 'ListItem', position: 2, name: crumbs[page][0], item: ORIGIN + page }
      ]
    });
  }

  var faqPages = {
    '': true,
    'index.html': true,
    'about.html': true,
    'wines.html': true,
    'where-to-buy.html': true
  };

  if (faqPages[page] && window.BBSite && typeof window.BBSite.faq === 'function') {
    var items = window.BBSite.faq();
    emit({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: items.map(function (item) {
        return {
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a }
        };
      })
    });
  }

  if (page === 'wines.html') {
    emit({
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'Product',
          additionalType: 'https://schema.org/Wine',
          name: 'Brisa Bay Napa Valley Chardonnay',
          brand: { '@type': 'Brand', name: 'Brisa Bay' },
          category: 'Wine',
          description: 'A brighter side of Napa Valley made for warm afternoons. Waves of ripe white peach and fresh citrus meet a tender texture and a mouthwatering acidity that quietly invites another sip.',
          image: ORIGIN + 'assets/web2/bottle.webp',
          url: ORIGIN + 'wines.html#chardonnay',
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
          image: ORIGIN + 'assets/web2/bottle-sauvblanc.webp',
          url: ORIGIN + 'wines.html#sauvignon-blanc',
          additionalProperty: [
            { '@type': 'PropertyValue', name: 'vintage', value: '2024' },
            { '@type': 'PropertyValue', name: 'alcoholByVolume', value: '13.0%' },
            { '@type': 'PropertyValue', name: 'appellation', value: 'Napa Valley' }
          ]
        }
      ]
    });
  }
})();
