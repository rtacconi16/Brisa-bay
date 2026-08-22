/* About-page band video + Brisa Way scroll. Ported from the DC class. */
(function () {
  'use strict';
  const host = {
    _wayRaf: 0,
    _wayCleanup: null,
    _bandVisKick: null,
    props: { motion: true },
    _kickBandVideo() {
      const v = document.getElementById('bb-band-video');
      if (!v) return;
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
      v.loop = true;
      v.playsInline = true;
      const tryPlay = () => { if (v.paused) v.play().catch(() => {}); };
      tryPlay();
      ['loadeddata', 'canplay', 'canplaythrough'].forEach((evt) => {
        v.addEventListener(evt, tryPlay, { once: true });
      });
      this._bandVisKick = () => { if (!document.hidden) tryPlay(); };
      document.addEventListener('visibilitychange', this._bandVisKick);
    },
    
    _bindWayScroll() {
      if (this._wayCleanup) this._wayCleanup();
      const scrollEl = document.querySelector('[data-bb-way-scroll]');
      const pinEl = document.querySelector('[data-bb-way-pin]');
      const track = document.querySelector('[data-bb-way-track]');
      const stamp = pinEl && pinEl.querySelector('[data-bb-stamp]');
      const progNum = document.querySelector('[data-bb-way-progress-num]');
      const progLabel = document.querySelector('[data-bb-way-progress-label]');
      const progRule = document.querySelector('[data-bb-way-progress-rule]');
      if (!scrollEl || !pinEl || !track) return;
    
      const panels = Array.from(track.children);
      const labels = panels.map((p) => p.getAttribute('data-label') || '');
      const n = panels.length;
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const motionOn = this.props.motion ?? true;
    
      const splitWords = (el) => {
        if (!el || el.dataset.wordsReady === '1') return Array.from(el.querySelectorAll('[data-bb-way-word]'));
        const text = el.textContent || '';
        el.textContent = '';
        text.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) {
            el.appendChild(document.createTextNode(part));
            return;
          }
          const span = document.createElement('span');
          span.setAttribute('data-bb-way-word', '');
          span.textContent = part;
          el.appendChild(span);
        });
        el.dataset.wordsReady = '1';
        return Array.from(el.querySelectorAll('[data-bb-way-word]'));
      };
    
      const panelMeta = panels.map((panel) => ({
        panel,
        copy: panel.querySelector('[data-bb-way-copy]'),
        title: panel.querySelector('[data-bb-way-title]'),
        words: splitWords(panel.querySelector('[data-bb-way-body]')),
        photo: panel.querySelector('[data-bb-way-photo]')
      }));
    
      const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
    
      const setTitle = (meta, amount) => {
        if (!meta.title) return;
        const t = Math.min(1, Math.max(0, amount));
        meta.title.style.opacity = String(t);
        meta.title.style.transform = `translate3d(0, ${(1 - t) * 26}px, 0)`;
      };
    
      const setBodyReveal = (meta, amount) => {
        const a = Math.min(1, Math.max(0, amount));
        const words = meta.words || [];
        const count = Math.max(1, words.length);
        words.forEach((word, i) => {
          const start = (i / count) * 0.82;
          const end = start + 0.18;
          const wt = Math.min(1, Math.max(0, (a - start) / (end - start)));
          word.style.opacity = String(wt);
          word.style.transform = `translate3d(0, ${(1 - wt) * 0.4}em, 0)`;
        });
      };
    
      const narrowMq = window.matchMedia('(max-width: 900px)');
    
      const stackPose = (depthFromFront) => {
        const d = Math.max(0, depthFromFront);
        if (narrowMq.matches) {
          // Phones stack the copy under the photo, so fan sideways only — a
          // downward fan would drop the back cards on top of the title.
          return {
            x: 10 - d * 18,
            y: -d * 4,
            rot: -7 - d * 2.2,
            scale: Math.max(0.88, 1 - d * 0.045)
          };
        }
        // Fan behind the front card while keeping the group optically centered
        return {
          x: 12 - d * 26,
          y: d * 14,
          rot: -7 - d * 3.2,
          scale: Math.max(0.86, 1 - d * 0.035)
        };
      };
    
      if (reduceMotion || !motionOn) {
        panelMeta.forEach((meta, i) => {
          setTitle(meta, 1);
          setBodyReveal(meta, 1);
          if (meta.copy) meta.copy.style.opacity = '1';
          if (meta.photo) meta.photo.style.transform = '';
          meta.panel.style.zIndex = String(10 + i);
        });
        if (stamp) stamp.style.transform = '';
        return;
      }
    
      // Timeline: first card reveals, then each next card rises from bottom onto the stack.
      const REVEAL_W = 1.35;
      const ARRIVE_W = 0.9;
      const segments = [];
      for (let i = 0; i < n; i++) {
        if (i > 0) segments.push({ type: 'arrive', panel: i, weight: ARRIVE_W });
        segments.push({ type: 'reveal', panel: i, weight: REVEAL_W });
      }
      const totalWeight = segments.reduce((sum, s) => sum + s.weight, 0);
    
      const mapProgress = (p) => {
        let u = Math.min(1, Math.max(0, p)) * totalWeight;
        for (let i = 0; i < segments.length; i++) {
          const seg = segments[i];
          if (u <= seg.weight || i === segments.length - 1) {
            return { seg, local: Math.min(1, Math.max(0, u / seg.weight)) };
          }
          u -= seg.weight;
        }
        const last = segments[segments.length - 1];
        return { seg: last, local: 1 };
      };
    
      let target = 0;
      let current = 0;
      let active = -1;
    
      const readTarget = () => {
        const total = Math.max(1, scrollEl.offsetHeight - pinEl.offsetHeight);
        const top = scrollEl.getBoundingClientRect().top;
        target = Math.min(1, Math.max(0, -top / total));
      };
    
      const apply = (p) => {
        const { seg, local } = mapProgress(p);
        const pinH = pinEl.clientHeight || window.innerHeight;
        const front = seg.panel;
        const arriveT = seg.type === 'arrive' ? easeOutCubic(local) : 1;
    
        panelMeta.forEach((meta, i) => {
          let titleAmt = 0;
          let bodyAmt = 0;
          let copyOpacity = 0;
          let tx = 0;
          let ty = 0;
          let rot = -7;
          let scale = 1;
          let z = 10 + i;
    
          if (i > front) {
            // Waiting below the viewport
            ty = pinH * 1.12;
            rot = 10;
            scale = 0.96;
            z = 5 + i;
          } else if (seg.type === 'arrive' && i === front) {
            // Rising from bottom onto the stack
            const pose = stackPose(0);
            const fromY = pinH * 1.12;
            tx = pose.x;
            ty = fromY + (pose.y - fromY) * arriveT;
            rot = 12 + (pose.rot - 12) * arriveT;
            scale = 0.94 + (pose.scale - 0.94) * arriveT;
            z = 40 + i;
            // On phones the copy sits *under* the photo, so the rising card sweeps
            // right over the title — hold the reveal until the card has landed.
            // Late in eased space is still a gradual fade in scroll terms.
            const titleFrom = narrowMq.matches ? 0.93 : 0.2;
            const titleSpan = narrowMq.matches ? 0.07 : 0.55;
            titleAmt = Math.min(1, Math.max(0, (arriveT - titleFrom) / titleSpan));
            copyOpacity = titleAmt;
          } else if (i === front) {
            const pose = stackPose(0);
            tx = pose.x;
            ty = pose.y;
            rot = pose.rot;
            scale = pose.scale;
            z = 40 + i;
            titleAmt = 1;
            bodyAmt = seg.type === 'reveal' ? local : 1;
            copyOpacity = 1;
          } else {
            // Already stacked underneath — fan left like the3key cards
            let depth = front - i;
            if (seg.type === 'arrive') {
              // Blend from previous depth to new depth as the new card arrives
              const prevDepth = Math.max(0, (front - 1) - i);
              depth = prevDepth + (depth - prevDepth) * arriveT;
            }
            const pose = stackPose(depth);
            tx = pose.x;
            ty = pose.y;
            rot = pose.rot;
            scale = pose.scale;
            z = 10 + i;
            copyOpacity = 0;
          }
    
          meta.panel.style.zIndex = String(z);
          if (meta.photo) {
            meta.photo.style.transform = `translate3d(${tx}px, ${ty}px, 0) rotate(${rot}deg) scale(${scale})`;
          }
          if (meta.copy) meta.copy.style.opacity = String(copyOpacity);
          setTitle(meta, titleAmt);
          setBodyReveal(meta, bodyAmt);
        });
    
        if (front !== active) {
          active = front;
          if (progNum) progNum.textContent = String(active + 1).padStart(2, '0');
          if (progLabel) progLabel.textContent = labels[active] || '';
        }
        if (progRule) {
          const rule = seg.type === 'reveal' ? 0.35 + local * 0.65 : Math.max(0.2, arriveT);
          progRule.style.transform = `scaleX(${rule})`;
        }
    
        if (stamp) {
          const stx = Math.sin(p * Math.PI) * 10;
          const sty = p * -8;
          const srot = p * 12;
          stamp.style.transform = `translate3d(${stx}px, ${sty}px, 0) rotate(${srot}deg)`;
        }
      };
    
      const tick = () => {
        readTarget();
        current += (target - current) * 0.1;
        if (Math.abs(target - current) < 0.0004) current = target;
        apply(current);
    
        const rect = scrollEl.getBoundingClientRect();
        const near = rect.bottom > -200 && rect.top < window.innerHeight + 200;
        const moving = Math.abs(target - current) > 0.0004;
        if (near || moving) {
          this._wayRaf = requestAnimationFrame(tick);
        } else {
          this._wayRaf = 0;
        }
      };
    
      const kick = () => {
        if (!this._wayRaf) this._wayRaf = requestAnimationFrame(tick);
      };
    
      const onResize = () => kick();
    
      readTarget();
      current = target;
      apply(current);
      kick();
    
      window.addEventListener('scroll', kick, { passive: true });
      window.addEventListener('resize', onResize);
      this._wayCleanup = () => {
        window.removeEventListener('scroll', kick);
        window.removeEventListener('resize', onResize);
        if (this._wayRaf) cancelAnimationFrame(this._wayRaf);
        this._wayRaf = 0;
        this._wayCleanup = null;
      };
    }
  };
  function boot() {
    host._kickBandVideo();
    requestAnimationFrame(function () { host._bindWayScroll(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
