(function () {
  const motionOn = () => {
    // Same path as About: keep pin-scrub on mobile; only reduced-motion opts out.
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  };
  const narrowMq = window.matchMedia('(max-width: 900px)');

  let raf = 0;
  let cleanup = null;

  const els = () => ({
    scrollEl: document.querySelector('[data-bb-blend-scroll]'),
    pinEl: document.querySelector('[data-bb-blend-pin]'),
    photo: document.querySelector('[data-bb-blend-photo]'),
    heroCopy: document.querySelector('[data-bb-blend-hero-copy]'),
    heroTitle: document.querySelector('[data-bb-blend-hero-copy] h1'),
    scrollCue: document.querySelector('[data-bb-blend-scroll-cue]'),
    stage: document.querySelector('[data-bb-blend-stage]'),
    copy: document.querySelector('[data-bb-stage-copy]'),
    row: document.querySelector('[data-bb-stage-row]'),
    wineSwitch: document.querySelector('[data-bb-wine-switch]'),
    stageCta: document.querySelector('[data-bb-stage-cta]'),
    veil: document.querySelector('[data-bb-blend-bottom-veil]')
  });

  const bind = () => {
    if (cleanup) cleanup();
    const first = els();
    if (!first.scrollEl || !first.pinEl || !first.heroCopy || !first.stage) return false;

    // Where scroll-driven CSS animations exist, `bb-headline-exit` owns the headline outright.
    // Skip it here so we are not writing inline styles every frame that CSS would override anyway.
    const cssHeadline = typeof CSS !== 'undefined' && !!CSS.supports
      && CSS.supports('animation-timeline: view()');

    const clamp01 = (n) => Math.min(1, Math.max(0, n));
    const range = (p, a, b) => clamp01((p - a) / Math.max(0.0001, b - a));
    const ease = (t) => t * t * (3 - 2 * t); // smoothstep
    const easeOut = (t) => 1 - Math.pow(1 - t, 2.6);
    const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2.4) / 2;

    const resetMotion = (node) => {
      if (!node) return;
      node.style.opacity = '';
      node.style.transform = '';
      node.style.filter = '';
      node.style.pointerEvents = '';
      node.style.visibility = '';
    };

    if (!motionOn()) {
      const { photo, heroCopy, heroTitle, scrollCue, stage, copy, row, wineSwitch, stageCta, veil } = els();
      [photo, heroCopy, heroTitle, scrollCue, stage, copy, row, wineSwitch, stageCta, veil].forEach(resetMotion);
      if (stage) stage.classList.add('is-live');
      const onResize = () => { if (motionOn()) bind(); };
      window.addEventListener('resize', onResize);
      cleanup = () => window.removeEventListener('resize', onResize);
      return true;
    }

    let current = 0;
    let running = false;

    const progress = () => {
      const { scrollEl, pinEl } = els();
      if (!scrollEl || !pinEl) return current;
      const total = Math.max(1, scrollEl.offsetHeight - pinEl.offsetHeight);
      return clamp01(-scrollEl.getBoundingClientRect().top / total);
    };

    const apply = (p) => {
      const {
        photo, heroCopy, heroTitle, scrollCue, stage, copy, row, wineSwitch, stageCta, veil
      } = els();
      if (!heroCopy || !stage) return;

      // Headline rides straight up and off the top edge — fully gone before the wine stage starts.
      // No fade: it disappears purely by travelling out, clipped by the pin's overflow.
      const exit = easeInOut(range(p, 0.05, 0.34));
      const cueExit = easeOut(range(p, 0.0, 0.2));
      if (heroTitle && !cssHeadline) {
        const titleGone = exit >= 0.995;
        heroTitle.style.opacity = titleGone ? '0' : '1';
        heroTitle.style.transform = exit < 0.001
          ? 'none'
          : `translate3d(0, ${exit * -112}vh, 0)`;
        heroTitle.style.filter = 'none';
        heroTitle.style.visibility = titleGone ? 'hidden' : 'visible';
      }
      if (scrollCue) {
        const cueGone = cueExit >= 0.995;
        scrollCue.style.opacity = cueGone ? '0' : String(1 - cueExit);
        scrollCue.style.transform = cueExit < 0.001
          ? 'none'
          : `translate3d(0, ${cueExit * 40}px, 0)`;
        scrollCue.style.visibility = cueGone ? 'hidden' : 'visible';
      }
      heroCopy.style.pointerEvents = exit > 0.45 ? 'none' : 'auto';

      // Photo breathes: slow zoom + gentle ken-burns drift
      const photoP = easeInOut(range(p, 0, 0.92));
      if (photo) {
        const zoom = 1.02 + photoP * 0.12;
        const drift = photoP * -18;
        photo.style.transform = `translate3d(0, ${drift}px, 0) scale(${zoom})`;
        photo.style.filter = photoP > 0.01 ? `saturate(${1 - photoP * 0.12})` : 'none';
      }

      const deepen = ease(range(p, 0.2, 0.58));
      if (veil) veil.style.opacity = String(0.8 + deepen * 0.2);

      // Stage only begins once the headline has fully left the screen (exit completes at p = 0.34).
      // It is an opaque plate, so this reads as a cut from photograph to product.
      const stageFade = ease(range(p, 0.36, 0.58));
      stage.style.opacity = String(stageFade);
      if (stageFade > 0.58) stage.classList.add('is-live');
      else stage.classList.remove('is-live');

      // Wine title/copy arrives from the left, after the hero headline is gone
      const copyIn = easeOut(range(p, 0.4, 0.7));
      if (copy) {
        copy.style.opacity = String(copyIn);
        copy.style.transform = copyIn >= 0.999
          ? 'none'
          : `translate3d(${(1 - copyIn) * -56}px, ${(1 - copyIn) * 24}px, 0)`;
      }

      // Bottle rises just behind the wine copy (shorter travel on phones so it
      // does not overshoot the tighter plate).
      const bottleIn = easeOut(range(p, 0.44, 0.8));
      if (row) {
        const rise = narrowMq.matches ? 32 : 48;
        const y = (1 - bottleIn) * rise;
        const scale = 0.9 + bottleIn * 0.1;
        row.style.opacity = String(bottleIn);
        row.style.transform = bottleIn >= 0.999
          ? 'none'
          : `translate3d(0, ${y}vh, 0) scale(${scale})`;
      }

      // Switcher + buy path settle last on the baseline
      const navIn = easeOut(range(p, 0.66, 0.88));
      [wineSwitch, stageCta].forEach((el, i) => {
        if (!el) return;
        const t = clamp01(navIn - i * 0.05);
        el.style.opacity = String(t);
        el.style.transform = t >= 0.999 ? 'none' : `translateY(${(1 - t) * 6}px)`;
      });
    };

    const tick = () => {
      const target = progress();
      const delta = target - current;
      // Silkier tracking — ease toward the scrub position
      current += Math.abs(delta) > 0.25 ? delta * 0.55 : delta * 0.14;
      if (Math.abs(target - current) < 0.0008) current = target;
      apply(current);
      if (Math.abs(target - current) >= 0.0008) raf = requestAnimationFrame(tick);
      else { running = false; raf = 0; }
    };

    const onScroll = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(tick);
    };

    const onResize = () => {
      if (!motionOn()) { bind(); return; }
      onScroll();
    };

    current = progress();
    apply(current);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    cleanup = () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      running = false;
    };
    return true;
  };

  let tries = 0;
  let boundRoot = null;
  const start = () => {
    const root = document.querySelector('[data-bb-blend-scroll]');
    if (root && root !== boundRoot) {
      if (bind()) boundRoot = root;
      return;
    }
    if (root && boundRoot === root) return;
    if (++tries < 120) requestAnimationFrame(start);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
  const mo = new MutationObserver(() => start());
  mo.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => mo.disconnect(), 8000);
})();

/* Scroll entrance when the photo carousel arrives */
(function () {
  const motionOn = () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let raf = 0;
  let cleanup = null;
  let bound = false;

  const clamp01 = (n) => Math.min(1, Math.max(0, n));
  const range = (p, a, b) => clamp01((p - a) / Math.max(0.0001, b - a));
  const ease = (t) => t * t * (3 - 2 * t);
  const easeOut = (t) => 1 - Math.pow(1 - t, 2.4);

  const reset = (node) => {
    if (!node) return;
    node.style.opacity = '';
    node.style.transform = '';
  };

  const arrival = (el, startFrac, endFrac) => {
    if (!el) return 1;
    const h = window.innerHeight || 0;
    // No usable viewport (hidden tab, zero-height frame): reveal rather than hide.
    if (h < 2) return 1;
    const top = el.getBoundingClientRect().top;
    const start = h * startFrac;
    const end = h * endFrac;
    return clamp01((start - top) / Math.max(1, start - end));
  };

  const bind = () => {
    if (cleanup) cleanup();
    const section = document.querySelector('[data-bb-pour]');
    const rail = document.querySelector('[data-bb-pour-rail]');
    const foot = document.querySelector('[data-bb-pour-foot]');
    const lines = Array.from(document.querySelectorAll('[data-bb-pour-line]'));
    const cards = Array.from(document.querySelectorAll('[data-bb-pour-card]'));
    if (!section) return false;

    const showAll = () => {
      lines.forEach(reset);
      cards.forEach(reset);
      reset(rail);
      reset(foot);
      if (section) section.style.transform = '';
      section.setAttribute('data-pour-in', '1');
    };

    if (!motionOn()) {
      showAll();
      const onResize = () => { if (motionOn()) bind(); };
      window.addEventListener('resize', onResize);
      cleanup = () => window.removeEventListener('resize', onResize);
      return true;
    }

    let running = false;

    const apply = () => {
      const cover = arrival(section, 0.92, 0.18);
      const enter = ease(cover);

      // Whole viewport rises in as it replaces the wine stage
      section.style.transform = enter >= 0.999
        ? 'none'
        : `translate3d(0, ${(1 - enter) * 64}px, 0)`;

      lines.forEach((el, i) => {
        const t = easeOut(range(cover, 0.08 + i * 0.1, 0.42 + i * 0.1));
        el.style.opacity = String(t);
        el.style.transform = t >= 0.999
          ? 'none'
          : `translate3d(0, ${(1 - t) * 28}px, 0)`;
      });

      if (rail) {
        // The rail only rises; the cards below own the fade, so the two
        // don't stack into a muddy double dissolve.
        const t = easeOut(range(cover, 0.28, 0.78));
        rail.style.opacity = '';
        rail.style.transform = t >= 0.999
          ? 'none'
          : `translate3d(0, ${(1 - t) * 48}px, 0)`;
      }

      // Cards deal in left-to-right: a card's delay follows how far right it
      // sits in the viewport, so the strip assembles itself as you arrive.
      if (cards.length) {
        const vw = window.innerWidth || 1;
        for (let i = 0; i < cards.length; i++) {
          const card = cards[i];
          const x = card.getBoundingClientRect().left;
          if (x > vw * 1.15) continue; // still parked off-stage; it lands revealed
          const delay = clamp01(x / vw) * 0.3;
          const t = easeOut(range(cover, 0.3 + delay, 0.72 + delay));
          card.style.opacity = String(t);
          card.style.transform = t >= 0.999
            ? 'none'
            : `translate3d(0, ${(1 - t) * 34}px, 0) scale(${0.94 + t * 0.06})`;
        }
      }

      // Hold the marquee still until the strip is on stage, then let it glide.
      section.setAttribute('data-pour-in', cover > 0.32 ? '1' : '0');

      if (foot) {
        const t = easeOut(range(cover, 0.55, 0.95));
        foot.style.opacity = String(t);
        foot.style.transform = t >= 0.999
          ? 'none'
          : `translate3d(0, ${(1 - t) * 22}px, 0)`;
      }

    };

    const tick = () => {
      apply();
      running = false;
      raf = 0;
    };

    const onScroll = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(tick);
    };

    const onResize = () => {
      if (!motionOn()) { bind(); return; }
      onScroll();
    };

    // The reveal is driven by animation frames, which a restored background
    // tab can starve — that would strand the section as a blank cream screen.
    // IntersectionObserver fires without frames, so once the section all but
    // fills the viewport we guarantee it is shown. By then the scroll-linked
    // pass has normally finished anyway, which makes this a no-op.
    let io = null;
    let rescue = 0;
    if ('IntersectionObserver' in window) {
      const stalled = () => {
        const probe = lines[0] || rail;
        return probe ? Number(probe.style.opacity || 1) < 0.5 : false;
      };
      io = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.intersectionRatio < 0.85) continue;
          // Give the frame-driven pass a moment; only step in if it never ran.
          clearTimeout(rescue);
          rescue = setTimeout(() => { if (stalled()) showAll(); }, 400);
        }
      }, { threshold: [0.85] });
      io.observe(section);
    }

    apply();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    cleanup = () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      if (io) io.disconnect();
      io = null;
      clearTimeout(rescue);
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      running = false;
    };
    return true;
  };

  const start = () => {
    if (bound) return;
    if (bind()) {
      bound = true;
      return;
    }
    requestAnimationFrame(start);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
  const mo = new MutationObserver(() => {
    if (!document.querySelector('[data-bb-pour]')) return;
    bound = false;
    start();
  });
  mo.observe(document.body, { childList: true, subtree: true });
  setTimeout(() => mo.disconnect(), 8000);
})();
