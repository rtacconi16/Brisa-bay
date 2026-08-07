// Shared helpers for the store locator. Loaded by where-to-buy.html and by
// <store-map>, both of which previously carried their own copy of the distance
// maths and the directions-URL construction.
(() => {
  const R_MILES = 3958.8;

  function milesBetween(a, b) {
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * R_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function formatMiles(mi) {
    if (mi == null) return '';
    if (mi < 0.1) return '< 0.1 mi';
    if (mi < 10) return mi.toFixed(1) + ' mi';
    return Math.round(mi) + ' mi';
  }

  /** Google Maps by name+address rather than raw coordinates: it resolves to the
     business listing, which is what someone asking for directions wants. */
  function directionsUrl(store, origin) {
    const dest = encodeURIComponent(store.name + ', ' + store.address + ', ' + store.city);
    return origin
      ? 'https://www.google.com/maps/dir/?api=1&origin=' + origin.lat + ',' + origin.lng + '&destination=' + dest
      : 'https://www.google.com/maps/search/?api=1&query=' + dest;
  }

  function telHref(phone) {
    if (!phone) return '';
    const digits = String(phone).replace(/[^0-9+]/g, '');
    return digits ? 'tel:' + digits : '';
  }

  window.BBLocator = { milesBetween, formatMiles, directionsUrl, telHref };
})();
