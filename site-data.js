// Content that appears on more than one page.
//
// Before this file the FAQ list lived in four separate pages as four copies of
// the same array, and the contact address was written out by hand in every
// footer. Both had already drifted: the FAQs footer link exists on four pages
// and not the other three, and some pages templated the address through a
// `contactEmail` prop while others hardcoded it.
//
// The prop was not actually centralising anything — each page declared its own
// default, so changing the address still meant editing seven files. It does now:
// change CONTACT_EMAIL here and every page follows, including the FAQ answer
// that quotes it.
//
// Loaded by every page after support.js, alongside age-gate.js. The runtime
// compiles each page's logic block after these scripts have run, so `BBSite` is
// available by the time renderVals() is called.
//
// Bump the ?v= on the <script> in all seven pages when this file changes.
(function (global) {
  'use strict';

  var CONTACT_EMAIL = 'info@brisabay.com';

  /* Ordered as shown. `id` is not rendered — it exists so a page can override a
     single answer without restating the list. */
  var FAQ = [
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
      a: 'Email ' + CONTACT_EMAIL + ' for trade, press or anything else. We read everything.'
    }
  ];

  /**
   * The FAQ list for a page.
   *
   * `overrides` maps an item id to a replacement answer, for the one case where
   * a page can answer better than the generic copy: on where-to-buy.html the
   * locator is on screen, so "where can I buy" describes the controls in front
   * of the reader rather than pointing at the page they are already on.
   *
   *   BBSite.faq({ 'where-to-buy': 'Search a store, city…' })
   *
   * An unknown id is ignored rather than silently dropped from the list — a
   * typo costs the override, not the question.
   */
  function faq(overrides) {
    return FAQ.map(function (item) {
      var next = overrides && Object.prototype.hasOwnProperty.call(overrides, item.id)
        ? overrides[item.id]
        : null;
      return next ? { id: item.id, q: item.q, a: next } : item;
    });
  }

  /**
   * The footer copyright line.
   *
   * The year was hardcoded as "2026" in all seven footers, which would have
   * quietly become wrong in every one of them on 1 January — the kind of thing
   * nobody notices until a customer does. Derived from the clock instead.
   *
   * Uses the visitor's local year deliberately: this is a "still trading in"
   * notice, not a legal filing date, and someone in Auckland seeing next year a
   * few hours early is better than everyone seeing last year for a fortnight.
   */
  function copyright() {
    return '© Brisa Bay ' + new Date().getFullYear();
  }

  global.BBSite = {
    contactEmail: CONTACT_EMAIL,
    faq: faq,
    copyright: copyright
  };
})(typeof window !== 'undefined' ? window : globalThis);
