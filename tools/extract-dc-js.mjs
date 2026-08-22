#!/usr/bin/env node
// Pull the scroll/video methods out of the DC class so the Astro pages can
// run the same motion without React.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'js');
mkdirSync(OUT, { recursive: true });

function extractMethod(src, name) {
  const needle = `  ${name}(`;
  const start = src.indexOf(needle);
  if (start < 0) throw new Error('missing ' + name);
  const brace = src.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('unclosed ' + name);
}

function extractClass(html) {
  const m = html.match(/class Component extends DCLogic \{([\s\S]*?)\n\}\s*<\/script>/);
  if (!m) throw new Error('no class');
  return m[1];
}

const index = extractClass(readFileSync(join(ROOT, 'index.html'), 'utf8'));
const homeMethods = [
  '_motionEnabled',
  '_kickHeroVideo',
  '_bindHeroScroll',
  '_bindWinesScroll',
  '_bindSkipScroll',
  '_bindMomentsScroll'
].map((n) => extractMethod(index, n)).join(',\n\n');

const homeJs = `/* Home-page motion + wine/moments controls. Ported from the DC class. */
(function () {
  'use strict';

  const host = {
    _heroRaf: 0,
    _heroCleanup: null,
    _heroVisKick: null,
    _winesRaf: 0,
    _winesCleanup: null,
    _skipRaf: 0,
    _skipCleanup: null,
    _momentsRaf: 0,
    _momentsCleanup: null,
    props: { motion: true },
${homeMethods.split('\n').map((l) => '    ' + l.slice(2)).join('\n')}
  };

  function setWine(n) {
    const root = document.querySelector('[data-bb-wines]');
    if (!root) return;
    const next = ((n % 2) + 2) % 2;
    root.setAttribute('data-wine', String(next));
    const prev = root.querySelector('[data-bb-wine="prev"]');
    const nxt = root.querySelector('[data-bb-wine="next"]');
    if (prev) {
      prev.setAttribute('aria-label', next === 0 ? 'Show the Sauvignon Blanc' : 'Show the Chardonnay');
      prev.setAttribute('title', next === 0 ? 'Previous wine — Sauvignon Blanc' : 'Previous wine — Chardonnay');
    }
    if (nxt) {
      nxt.setAttribute('aria-label', next === 0 ? 'Show the Sauvignon Blanc' : 'Show the Chardonnay');
      nxt.setAttribute('title', next === 0 ? 'Next wine — Sauvignon Blanc' : 'Next wine — Chardonnay');
    }
  }

  function wineIndex() {
    const root = document.querySelector('[data-bb-wines]');
    return root ? (Number(root.getAttribute('data-wine')) || 0) : 0;
  }

  function visibleCount() {
    return window.matchMedia('(max-width: 900px)').matches ? 2 : 3;
  }

  let moment = 0;
  function wrapMoment(n, max) {
    const span = max + 1;
    return ((n % span) + span) % span;
  }
  function closestEl(e, sel) {
    const t = e.target;
    return t && typeof t.closest === 'function' ? t.closest(sel) : null;
  }
  function usedGap(track) {
    const raw = getComputedStyle(track).columnGap || getComputedStyle(track).gap;
    const n = parseFloat(raw);
    return Number.isFinite(n) ? n : 8;
  }
  function momentSlides(track) {
    return track.querySelectorAll('[data-bb-moment]');
  }
  function applyMoments() {
    const track = document.querySelector('[data-bb-moment-track]');
    const viewport = document.querySelector('[data-bb-moment-viewport]');
    const dots = document.querySelector('[data-bb-moment-dots]');
    if (!track || !viewport) return;
    const slides = momentSlides(track);
    const count = slides.length;
    const visible = Math.min(visibleCount(), Math.max(1, count));
    const max = Math.max(0, count - visible);
    moment = wrapMoment(moment, max);
    const gap = usedGap(track);
    const width = Math.max(0, (viewport.clientWidth - gap * (visible - 1)) / visible);
    for (let i = 0; i < slides.length; i++) {
      slides[i].style.flex = '0 0 ' + width + 'px';
      slides[i].style.width = width + 'px';
      slides[i].style.maxWidth = width + 'px';
    }
    track.style.transform = 'translate3d(' + (-moment * (width + gap)) + 'px, 0, 0)';
    if (!dots) return;
    dots.innerHTML = '';
    for (let i = 0; i <= max; i++) {
      const el = document.createElement('button');
      el.type = 'button';
      el.setAttribute('data-bb-moment-dot', String(i));
      el.setAttribute('aria-label', visible === 1
        ? 'Show moment ' + (i + 1)
        : 'Show moments ' + (i + 1) + ' to ' + Math.min(i + visible, count));
      el.style.cssText = 'width:clamp(9px,0.7vw,14px);height:clamp(9px,0.7vw,14px);border:0;padding:0;border-radius:50%;cursor:pointer;background:'
        + (i === moment ? 'var(--bb-red)' : 'rgba(87,84,74,0.28)');
      dots.appendChild(el);
    }
  }

  function bindMomentSwipe() {
    const viewport = document.querySelector('[data-bb-moment-viewport]');
    if (!viewport || viewport.dataset.bbSwipe === '1') return;
    viewport.dataset.bbSwipe = '1';
    let x0 = 0;
    let y0 = 0;
    let t0 = 0;
    let pid = null;

    viewport.addEventListener('pointerdown', function (e) {
      if (pid != null) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (closestEl(e, '[data-bb-moment-nav], [data-bb-moment-dot]')) return;
      pid = e.pointerId;
      x0 = e.clientX;
      y0 = e.clientY;
      t0 = Date.now();
      if (viewport.setPointerCapture) {
        try { viewport.setPointerCapture(e.pointerId); } catch (err) { /* Safari may reject this. */ }
      }
    });

    function endPointer(e) {
      if (pid == null || e.pointerId !== pid) return;
      pid = null;
      const dx = e.clientX - x0;
      const dy = e.clientY - y0;
      const dt = Date.now() - t0;
      if (Math.abs(dx) < 36 || Math.abs(dx) < Math.abs(dy) * 1.15) return;
      if (dt > 900 && Math.abs(dx) < 72) return;
      viewport.dataset.bbSuppressClick = '1';
      moment += dx < 0 ? 1 : -1;
      applyMoments();
    }

    viewport.addEventListener('pointerup', endPointer);
    viewport.addEventListener('pointercancel', function (e) {
      if (e.pointerId === pid) pid = null;
    });
    viewport.addEventListener('click', function (e) {
      if (viewport.dataset.bbSuppressClick !== '1') return;
      e.preventDefault();
      e.stopPropagation();
      delete viewport.dataset.bbSuppressClick;
    }, true);
  }

  function boot() {
    host._kickHeroVideo();
    requestAnimationFrame(function () {
      host._bindHeroScroll();
      host._bindWinesScroll();
      host._bindSkipScroll();
      host._bindMomentsScroll();
      applyMoments();
    });
    applyMoments();
    bindMomentSwipe();

    document.addEventListener('click', function (e) {
      const wine = closestEl(e, '[data-bb-wine]');
      if (wine && wine.closest('[data-bb-wines]')) {
        const v = wine.getAttribute('data-bb-wine');
        if (v === 'prev') setWine(wineIndex() - 1);
        else if (v === 'next') setWine(wineIndex() + 1);
        else setWine(Number(v));
        return;
      }
      const nav = closestEl(e, '[data-bb-moment-nav]');
      if (nav) {
        e.preventDefault();
        moment += nav.getAttribute('data-bb-moment-nav') === 'next' ? 1 : -1;
        applyMoments();
        return;
      }
      const dot = closestEl(e, '[data-bb-moment-dot]');
      if (dot) {
        moment = Number(dot.getAttribute('data-bb-moment-dot')) || 0;
        applyMoments();
      }
    });

    const mq = window.matchMedia('(max-width: 900px)');
    const onMq = function () {
      moment = 0;
      applyMoments();
      host._kickHeroVideo();
    };
    if (mq.addEventListener) mq.addEventListener('change', onMq);
    else if (mq.addListener) mq.addListener(onMq);

    window.addEventListener('load', applyMoments);
    let resizeRaf = 0;
    window.addEventListener('resize', function () {
      if (resizeRaf) return;
      resizeRaf = requestAnimationFrame(function () {
        resizeRaf = 0;
        applyMoments();
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
`;

writeFileSync(join(OUT, 'home.js'), homeJs.replace(
  'assets/web2/hero-mobile-poster.jpg',
  '/assets/web2/hero-mobile-poster.jpg'
));

const about = extractClass(readFileSync(join(ROOT, 'about.html'), 'utf8'));
const aboutMethods = ['_kickBandVideo', '_bindWayScroll'].map((n) => extractMethod(about, n)).join(',\n\n');
const aboutJs = `/* About-page band video + Brisa Way scroll. Ported from the DC class. */
(function () {
  'use strict';
  const host = {
    _wayRaf: 0,
    _wayCleanup: null,
    _bandVisKick: null,
    props: { motion: true },
${aboutMethods.split('\n').map((l) => '    ' + l.slice(2)).join('\n')}
  };
  function boot() {
    host._kickBandVideo();
    requestAnimationFrame(function () { host._bindWayScroll(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
`;
writeFileSync(join(OUT, 'about.js'), aboutJs);

console.log('public/js/home.js and about.js written');
