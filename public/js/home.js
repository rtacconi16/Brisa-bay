/* Home-page motion + wine/moments controls. Ported from the DC class. */
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
    _motionEnabled() {
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      return !reduceMotion && (this.props.motion ?? true);
    },
    
    _kickHeroVideo() {
      const v = document.getElementById('bb-hero-video');
      if (!v) return;
      const poster = document.getElementById('bb-hero-mobile-poster');
      const narrow = window.matchMedia('(max-width: 900px)').matches;
      if (narrow) {
        v.pause();
        v.style.display = 'none';
        if (poster) poster.style.display = 'block';
        return;
      }
      if (poster) poster.style.display = 'none';
      v.style.display = 'block';
      if (!v.dataset.wired) {
        v.querySelectorAll('source').forEach((s) => {
          const src = s.getAttribute('data-bb-src');
          if (src) s.setAttribute('src', src);
        });
        v.load();
        v.dataset.wired = '1';
      }
      v.muted = true;
      v.defaultMuted = true;
      v.setAttribute('muted', '');
      v.playsInline = true;
      const tryPlay = () => {
        if (v.paused) v.play().catch(() => {});
      };
      tryPlay();
      ['loadeddata', 'canplay', 'canplaythrough'].forEach((evt) => {
        v.addEventListener(evt, tryPlay, { once: true });
      });
      if (!this._heroVisKick) {
        this._heroVisKick = () => { if (!document.hidden) tryPlay(); };
        document.addEventListener('visibilitychange', this._heroVisKick);
      }
    },
    
    _bindHeroScroll() {
      if (this._heroCleanup) this._heroCleanup();
      const scrollEl = document.querySelector('[data-bb-hero-scroll]');
      const pinEl = document.querySelector('[data-bb-hero-pin]');
      const video = document.querySelector('[data-bb-hero-video]');
      const veil = document.querySelector('[data-bb-hero-veil]');
      const ticker = document.querySelector('[data-bb-ticker]');
      const story = document.querySelector('[data-bb-story]');
      const storyCopy = document.querySelector('[data-bb-story-copy]');
      const media = document.querySelector('[data-bb-story-media]');
      const winesEl = document.querySelector('[data-bb-wines-scroll]');
      const lines = Array.from(document.querySelectorAll('[data-bb-story-line]'));
      if (!scrollEl || !pinEl) return;
    
      const clamp01 = (n) => Math.min(1, Math.max(0, n));
      const range = (p, a, b) => clamp01((p - a) / (b - a));
      const ease = (t) => t * t * (3 - 2 * t);
    
      const showAll = () => {
        if (video) video.style.transform = 'none';
        if (veil) veil.style.opacity = '0.15';
        if (ticker) ticker.style.opacity = '1';
        if (media) { media.style.transform = 'none'; media.style.filter = 'none'; }
        if (storyCopy) { storyCopy.style.opacity = '1'; storyCopy.style.transform = 'none'; }
        lines.forEach((el) => {
          el.style.opacity = '1';
          el.style.transform = 'none';
        });
      };
      if (!this._motionEnabled()) {
        showAll();
        return;
      }
    
      let current = 0;
      let running = false;
    
      const progress = () => {
        const total = Math.max(1, scrollEl.offsetHeight - pinEl.offsetHeight);
        return clamp01(-scrollEl.getBoundingClientRect().top / total);
      };
    
      const storyProgress = () => {
        if (!story) return 0;
        const top = story.getBoundingClientRect().top;
        const h = window.innerHeight || 1;
        return clamp01(1 - top / (h * 0.85));
      };
    
      // Story dissolves as Our Wines covers it
      const winesCover = () => {
        if (!winesEl) return 0;
        const top = winesEl.getBoundingClientRect().top;
        const h = window.innerHeight || 1;
        const start = h * 0.92;
        const end = h * 0.22;
        return clamp01((start - top) / Math.max(1, start - end));
      };
    
      const apply = (p, storyP, cover) => {
        const zoom = 1.04 + ease(p) * 0.18;
        const dark = 0.08 + ease(p) * 0.55;
        if (video) video.style.transform = `scale(${zoom})`;
        if (veil) veil.style.opacity = String(dark);
        if (ticker) ticker.style.opacity = String(1 - ease(p) * 0.35);
    
        const exit = ease(cover);
        const stay = 1 - exit;
    
        if (media) {
          const ken = 1.08 - ease(storyP) * 0.08 + exit * 0.06;
          const drift = (1 - ease(storyP)) * 36 - exit * 28;
          media.style.transform = `translate3d(0, ${drift}px, 0) scale(${ken})`;
          media.style.filter = exit > 0.001 ? `brightness(${1 - exit * 0.45})` : 'none';
        }
    
        if (storyCopy) {
          storyCopy.style.opacity = String(stay);
          storyCopy.style.transform = exit > 0.001
            ? `translate3d(0, ${exit * -48}px, 0)`
            : 'none';
        }
    
        lines.forEach((el, i) => {
          const t = ease(range(storyP, 0.12 + i * 0.14, 0.42 + i * 0.14));
          el.style.opacity = String(t);
          el.style.transform = t >= 0.999 ? 'none' : `translate3d(0, ${(1 - t) * 28}px, 0)`;
        });
      };
    
      const tick = () => {
        const target = progress();
        const storyP = storyProgress();
        const cover = winesCover();
        current += (target - current) * 0.14;
        if (Math.abs(target - current) < 0.001) current = target;
        apply(current, storyP, cover);
        if (Math.abs(target - current) >= 0.001) {
          this._heroRaf = requestAnimationFrame(tick);
        } else {
          running = false;
          this._heroRaf = 0;
        }
      };
    
      const onScroll = () => {
        if (running) return;
        running = true;
        this._heroRaf = requestAnimationFrame(tick);
      };
    
      current = progress();
      apply(current, storyProgress(), winesCover());
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll);
      this._heroCleanup = () => {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
        if (this._heroRaf) cancelAnimationFrame(this._heroRaf);
        this._heroRaf = 0;
        running = false;
        this._heroCleanup = null;
      };
    },
    
    _bindWinesScroll() {
      if (this._winesCleanup) this._winesCleanup();
      const scrollEl = document.querySelector('[data-bb-wines-scroll]');
      const pinEl = document.querySelector('[data-bb-wines-pin]');
      const copy = document.querySelector('[data-bb-wines-copy]');
      const stage = document.querySelector('[data-bb-bottle-stage]');
      const controls = document.querySelector('[data-bb-wines-controls]');
      const deco = document.querySelector('[data-bb-wines-deco]');
      if (!scrollEl || !pinEl) return;
    
      const clamp01 = (n) => Math.min(1, Math.max(0, n));
      const range = (p, a, b) => clamp01((p - a) / (b - a));
      const ease = (t) => t * t * (3 - 2 * t);
    
      const winesGrid = document.querySelector('[data-bb-wines]');
      const showAll = () => {
        if (copy) { copy.style.opacity = '1'; copy.style.transform = 'none'; }
        if (stage) stage.style.transform = 'none';
        if (controls) { controls.style.opacity = '1'; controls.style.transform = 'none'; }
        if (deco) deco.style.transform = 'none';
        if (winesGrid) winesGrid.style.transform = 'none';
      };
      if (!this._motionEnabled()) {
        showAll();
        return;
      }
    
      let current = 0;
      let running = false;
    
      const scrubRoom = () => Math.max(0, scrollEl.offsetHeight - pinEl.offsetHeight);
    
      // Blend cover-handoff + a short pin settle into one crisp entrance.
      const driveProgress = () => {
        const top = scrollEl.getBoundingClientRect().top;
        const h = window.innerHeight || 1;
        const arrive = clamp01((h * 0.92 - top) / Math.max(1, h * 0.72));
        const total = scrubRoom();
        const scrub = total < 24 ? 0 : clamp01(-top / total);
        // Arrival does most of the work; scrub only finishes the last beat.
        return clamp01(Math.max(arrive, scrub * 0.55 + 0.45 * arrive));
      };
    
      const apply = (p) => {
        const enter = ease(range(p, 0, 0.38));
        const settle = ease(range(p, 0.12, 0.62));
        const controlsIn = ease(range(p, 0.22, 0.58));
    
        if (winesGrid) {
          winesGrid.style.transform = enter < 0.999
            ? `translate3d(0, ${(1 - enter) * 28}px, 0)`
            : 'none';
        }
    
        if (copy) {
          copy.style.opacity = String(enter);
          copy.style.transform = enter >= 0.999
            ? 'none'
            : `translate3d(0, ${(1 - enter) * 28}px, 0)`;
        }
    
        if (stage) {
          if (settle >= 0.999) {
            stage.style.transform = 'none';
          } else {
            const y = (1 - ease(range(p, 0.04, 0.5))) * 56;
            const rot = (1 - settle) * -3.5;
            const scale = 0.94 + settle * 0.06;
            stage.style.transform = `translate3d(0, ${y}px, 0) rotate(${rot}deg) scale(${scale})`;
          }
        }
    
        if (controls) {
          controls.style.opacity = String(controlsIn);
          controls.style.transform = controlsIn >= 0.999
            ? 'none'
            : `translate3d(0, ${(1 - controlsIn) * 12}px, 0)`;
        }
    
        if (deco) {
          deco.style.transform = settle >= 0.999
            ? 'none'
            : `translate3d(${(1 - settle) * 24}px, ${(1 - enter) * 36}px, 0) rotate(${(1 - settle) * -4}deg)`;
        }
      };
    
      const tick = () => {
        const target = driveProgress();
        current += (target - current) * 0.28;
        if (Math.abs(target - current) < 0.0008) current = target;
        apply(current);
        if (Math.abs(target - current) >= 0.0008) {
          this._winesRaf = requestAnimationFrame(tick);
        } else {
          running = false;
          this._winesRaf = 0;
        }
      };
    
      const onScroll = () => {
        if (running) return;
        running = true;
        this._winesRaf = requestAnimationFrame(tick);
      };
    
      current = driveProgress();
      apply(current);
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll);
      this._winesCleanup = () => {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
        if (this._winesRaf) cancelAnimationFrame(this._winesRaf);
        this._winesRaf = 0;
        running = false;
        this._winesCleanup = null;
      };
    },
    
    _bindSkipScroll() {
      if (this._skipCleanup) this._skipCleanup();
      const scrollEl = document.querySelector('[data-bb-skip-scroll]');
      const pinEl = document.querySelector('[data-bb-skip-pin]');
      const inner = document.querySelector('[data-bb-skip-inner]');
      const title = document.querySelector('[data-bb-skip-title]');
      const rule = document.querySelector('[data-bb-skip-rule]');
      const lead = document.querySelector('[data-bb-skip-lead]');
      const body = document.querySelector('[data-bb-skip-body]');
      const cta = document.querySelector('[data-bb-skip-cta]');
      const momentsSection = document.querySelector('[data-screen-label="Bottled Moments"]');
      if (!scrollEl || !pinEl || !title) return;
    
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const motionOn = this.props.motion ?? true;
      const setReveal = (el, t, rise = 18) => {
        if (!el) return;
        const v = Math.min(1, Math.max(0, t));
        el.style.opacity = String(v);
        el.style.transform = v >= 0.999 ? 'none' : `translate3d(0, ${(1 - v) * rise}px, 0)`;
      };
      // Title stays put; only the supporting copy animates in.
      title.style.opacity = '1';
      title.style.transform = 'none';
    
      const showAll = () => {
        if (inner) { inner.style.opacity = '1'; inner.style.transform = 'none'; }
        if (rule) { rule.style.opacity = '1'; rule.style.transform = 'scaleX(1)'; }
        setReveal(lead, 1);
        setReveal(body, 1);
        setReveal(cta, 1);
      };
      if (reduceMotion || !motionOn) {
        showAll();
        return;
      }
    
      const clamp01 = (n) => Math.min(1, Math.max(0, n));
      const range = (p, a, b) => clamp01((p - a) / (b - a));
      const ease = (t) => t * t * (3 - 2 * t);
    
      let current = 0;
      let running = false;
    
      const progress = () => {
        const total = Math.max(1, scrollEl.offsetHeight - pinEl.offsetHeight);
        return clamp01(-scrollEl.getBoundingClientRect().top / total);
      };
    
      // Fade starts as Bottled Moments approaches; finishes before it fully covers the type
      const coverProgress = () => {
        if (!momentsSection) return 0;
        const top = momentsSection.getBoundingClientRect().top;
        const h = window.innerHeight || 1;
        const start = h * 0.92;
        const end = h * 0.28;
        return clamp01((start - top) / Math.max(1, start - end));
      };
    
      const apply = (p, cover) => {
        const leadT = ease(range(p, 0.05, 0.36));
        const bodyT = ease(range(p, 0.18, 0.5));
        const ctaT = ease(range(p, 0.34, 0.66));
        const ruleT = ease(range(p, 0.02, 0.3));
    
        if (rule) {
          rule.style.opacity = String(ruleT);
          rule.style.transform = `scaleX(${ruleT})`;
        }
        setReveal(lead, leadT, 18);
        setReveal(body, bodyT, 18);
        setReveal(cta, ctaT, 14);
    
        // Soft dissolve at end of pin, then finish as Moments covers — never blank cream
        const exit = Math.min(1, ease(range(p, 0.8, 1)) * 0.4 + ease(cover));
        if (inner) {
          inner.style.opacity = String(1 - exit);
          inner.style.transform = exit > 0.001
            ? `translate3d(0, ${exit * -72}px, 0)`
            : 'none';
        }
      };
    
      const tick = () => {
        const target = progress();
        // Cover tracks scroll directly so the fade does not lag under the next section
        const cover = coverProgress();
        current += (target - current) * 0.16;
        if (Math.abs(target - current) < 0.001) current = target;
        apply(current, cover);
        if (Math.abs(target - current) >= 0.001) {
          this._skipRaf = requestAnimationFrame(tick);
        } else {
          running = false;
          this._skipRaf = 0;
        }
      };
    
      const onScroll = () => {
        if (running) return;
        running = true;
        this._skipRaf = requestAnimationFrame(tick);
      };
    
      current = progress();
      apply(current, coverProgress());
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll);
      this._skipCleanup = () => {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
        if (this._skipRaf) cancelAnimationFrame(this._skipRaf);
        this._skipRaf = 0;
        running = false;
        this._skipCleanup = null;
      };
    },
    
    _bindMomentsScroll() {
      if (this._momentsCleanup) this._momentsCleanup();
      const section = document.querySelector('[data-bb-moments]');
      const intro = document.querySelector('[data-bb-moments-intro]');
      const bar = document.querySelector('[data-bb-moments-bar]');
      const gallery = document.querySelector('[data-bb-moments-gallery]');
      const lines = Array.from(document.querySelectorAll('[data-bb-moments-line]'));
      if (!section || !intro) return;
    
      const clamp01 = (n) => Math.min(1, Math.max(0, n));
      const range = (p, a, b) => clamp01((p - a) / (b - a));
      const ease = (t) => t * t * (3 - 2 * t);
    
      const showAll = () => {
        intro.style.transform = 'none';
        if (bar) bar.style.transform = 'none';
        if (gallery) { gallery.style.opacity = '1'; gallery.style.transform = 'none'; }
        lines.forEach((el) => {
          el.style.opacity = '1';
          el.style.transform = 'none';
        });
      };
      if (!this._motionEnabled()) {
        showAll();
        return;
      }
    
      let running = false;
    
      // 0 = still below Skip; 1 = Moments fully covers the viewport
      const arrival = () => {
        const top = section.getBoundingClientRect().top;
        const h = window.innerHeight || 1;
        const start = h * 0.95;
        const end = h * 0.12;
        return clamp01((start - top) / Math.max(1, start - end));
      };
    
      const galleryProgress = () => {
        if (!gallery) return 0;
        const top = gallery.getBoundingClientRect().top;
        const h = window.innerHeight || 1;
        return clamp01(1 - top / (h * 0.92));
      };
    
      const apply = (cover, gal) => {
        const enter = ease(cover);
    
        intro.style.transform = enter >= 0.999
          ? 'none'
          : `translate3d(0, ${(1 - enter) * 56}px, 0)`;
    
        if (bar) {
          bar.style.transform = `translate3d(0, ${(1 - enter) * 36}px, 0) scaleX(${0.92 + enter * 0.08})`;
        }
    
        lines.forEach((el, i) => {
          const t = ease(range(cover, 0.12 + i * 0.12, 0.42 + i * 0.12));
          el.style.opacity = String(t);
          el.style.transform = t >= 0.999 ? 'none' : `translate3d(0, ${(1 - t) * 26}px, 0)`;
        });
    
        if (gallery) {
          const g = ease(Math.max(gal, range(cover, 0.55, 1)));
          gallery.style.opacity = String(g);
          const mobile = window.matchMedia('(max-width: 900px)').matches;
          gallery.style.transform = (mobile || g >= 0.999)
            ? 'none'
            : `translate3d(0, ${(1 - g) * 52}px, 0)`;
        }
      };
    
      const tick = () => {
        apply(arrival(), galleryProgress());
        running = false;
        this._momentsRaf = 0;
      };
    
      const onScroll = () => {
        if (running) return;
        running = true;
        this._momentsRaf = requestAnimationFrame(tick);
      };
    
      apply(arrival(), galleryProgress());
      window.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', onScroll);
      this._momentsCleanup = () => {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
        if (this._momentsRaf) cancelAnimationFrame(this._momentsRaf);
        this._momentsRaf = 0;
        running = false;
        this._momentsCleanup = null;
      };
    }
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
