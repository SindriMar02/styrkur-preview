/* focus-guard (_tools/focus-guard): no focus ring after a tap or click; the README says why */
(function () {
  var root = document.documentElement;
  function set(v) { if (root.getAttribute('data-input') !== v) root.setAttribute('data-input', v); }
  addEventListener('pointerdown', function () { set('pointer'); }, true);
  addEventListener('keydown', function (e) {
    if (e.key === 'Shift' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Meta') return;
    set('key');
  }, true);
})();

/* Clean-room behaviour layer. Parameters from ../TEARDOWN.md; implementation is our own. */
(() => {
  const html = document.documentElement;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = motionPreference.matches;
  if (!window.gsap || !window.SplitText || !window.ScrollToPlugin || !window.CustomEase) { html.classList.add('motion-fallback'); return; }
  html.classList.add('motion-ready');
  gsap.registerPlugin(SplitText, ScrollToPlugin, CustomEase);
  CustomEase.create('dive', '0.85,0,0.15,1');

  /* ---------- scroll engine: Lenis on fine pointers only (studio deviation; reference syncs only nested scrollers) */
  let lenis = null;
  if (fine && !reduced && window.Lenis) {
    lenis = new Lenis({ duration: 1.2, easing: t => Math.min(1, 1.001 - Math.pow(2, -10 * t)), autoResize: true,
      virtualScroll: ({ event }) => !('metaKey' in event && event.metaKey) });
    gsap.ticker.add(t => lenis?.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  const lockScroll = on => { html.classList.toggle('no-scroll', on); if (lenis) on ? lenis.stop() : lenis.start(); };
  const onScroll = fn => addEventListener('scroll', fn, { passive: true }); // Lenis drives the real window scroll, so this fires either way

  /* ---------- split text */
  const splits = [];
  function split(el) {
    const mode = el.dataset.split;
    if (mode === 'chars') {
      const s = new SplitText(el, { type: 'chars', charsClass: 'c' });
      s.chars.forEach((c, i) => c.style.setProperty('--i', i));
      return s;
    }
    if (mode === 'words') {
      const s = new SplitText(el, { type: 'words', wordsClass: 'w' });
      s.words.forEach((w, i) => { w.innerHTML = `<span class="wi">${w.innerHTML}</span>`; w.style.setProperty('--i', i); });
      return s;
    }
    const s = new SplitText(el, { type: 'lines', linesClass: 'l' });
    s.lines.forEach((l, i) => { l.innerHTML = `<span class="li">${l.innerHTML}</span>`; l.style.setProperty('--i', i); });
    return s;
  }
  Promise.all([document.fonts.ready, window.styrkurGate || Promise.resolve()]).then(() => { // styrkurGate: landing loader (styrkur.js) opens first, then the hero entrance plays
    document.querySelectorAll('[data-split]').forEach(el => splits.push([el, split(el)]));
    document.querySelectorAll('[data-scrub]').forEach(el => {
      const s = new SplitText(el, { type: 'words', wordsClass: 'sw' });
      s.words.forEach((w, i) => w.style.setProperty('--i', i));
    });
    observe();
    hero && hero.start();
    html.classList.add('motion-started');
  }).catch(() => html.classList.add('motion-fallback'));
  let lastW = innerWidth;
  addEventListener('resize', () => {
    if (innerWidth === lastW) return; lastW = innerWidth;
    splits.forEach(([el, s], k) => { const st = el.className; s.revert(); splits[k][1] = split(el); el.className = st; });
  });

  /* ---------- in-view triggers (class toggles; CSS does the motion) */
  function observe() {
    const io = new IntersectionObserver(entries => entries.forEach(e => {
      if (!e.isIntersecting) return;
      e.target.classList.add('in'); io.unobserve(e.target);
    }), { threshold: 0, rootMargin: '0px 0px -10% 0px' });
    const pending = new Set();
    document.querySelectorAll('main [data-reveal], main [data-split]').forEach(el => { if (!el.closest('.hero')) { io.observe(el); pending.add(el); } });
    // A fast jump (anchor, refresh mid-page, flung scroll) can skip an element without it ever intersecting:
    // reveal anything that is already at or above the viewport.
    let queued = false;
    const sweep = () => { queued = false; pending.forEach(el => {
      if (el.classList.contains('in')) { pending.delete(el); return; }
      if (el.getBoundingClientRect().top < innerHeight) { el.classList.add('in'); io.unobserve(el); pending.delete(el); }
    }); if (!pending.size) removeEventListener('scroll', onScroll); };
    const onScroll = () => { if (!queued) { queued = true; requestAnimationFrame(sweep); } };
    addEventListener('scroll', onScroll, { passive: true }); requestAnimationFrame(sweep);
  }
  const replay = els => { els.forEach(el => { el.classList.remove('in', 'out'); void el.offsetWidth; }); requestAnimationFrame(() => els.forEach(el => el.classList.add('in'))); };

  /* ---------- hero slider: vertical, CSS-driven, media-paced progress */
  const hero = (() => {
    const root = document.getElementById('hero'); if (!root) return null;
    const slides = [...root.querySelectorAll('.hero__slide')];
    const texts = [...root.querySelectorAll('.hero__text')];
    const pager = document.getElementById('pager');
    const labels = [...root.querySelectorAll('.hero__text')].map(t => t.dataset.name || '');
    texts.forEach((t, i) => t.inert = i !== 0);
    const IMAGE_MS = 6000, SPEED = 1400;
    let idx = 0, t0 = 0, raf = 0, busy = false;
    pager.innerHTML = slides.map((_, i) => `<button class="pager__b" aria-label="Glæra ${i + 1}: ${labels[i]}"><span class="pager__i">${String(i + 1).padStart(2, '0')}.</span><span class="pager__t"></span><span class="pager__n">${labels[i]}</span></button>`).join('');
    const bullets = [...pager.children];
    bullets.forEach((b, i) => b.addEventListener('click', () => go(i)));
    const textEls = i => [...texts[i].querySelectorAll('[data-reveal],[data-split]')];
    function tick(now) {
      const p = Math.min((now - t0) / IMAGE_MS, 1);
      bullets[idx].style.setProperty('--p', p);
      if (p >= 1) return go((idx + 1) % slides.length);
      raf = requestAnimationFrame(tick);
    }
    function paint() {
      bullets.forEach((b, i) => { b.classList.toggle('is-active', i === idx); if (i !== idx) b.style.setProperty('--p', 0); });
      cancelAnimationFrame(raf); t0 = performance.now(); if (!/[?&]noauto\b/.test(location.search) && !(typeof paused !== 'undefined' && paused)) raf = requestAnimationFrame(tick); // ?noauto freezes the slider for measurement
    }
    function go(n) {
      if (busy || n === idx) return; busy = true; root.classList.add('is-transitioning');
      const prev = idx; idx = n;
      textEls(prev).forEach(el => { el.classList.remove('in'); void el.offsetWidth; el.classList.add('out'); });
      texts.forEach((t, i) => { t.classList.toggle('is-hidden', i !== idx); t.inert = i !== idx; });
      replay(textEls(idx));
      slides.forEach((s, i) => { if (i !== idx && i !== prev) s.classList.remove('is-active', 'is-leaving'); });
      slides[prev].classList.remove('is-active'); slides[prev].classList.add('is-leaving');
      slides[idx].classList.remove('is-leaving'); slides[idx].classList.add('is-active');
      paint();
      setTimeout(() => {
        slides[prev].classList.add('is-reset'); slides[prev].classList.remove('is-leaving');
        void slides[prev].offsetWidth; slides[prev].classList.remove('is-reset');
        busy = false; root.classList.remove('is-transitioning');
      }, SPEED + 80);
    }
    let paused = false;
    const pauseBtn = document.getElementById('heroPause');
    const setPaused = on => { paused = on; pauseBtn.setAttribute('aria-pressed', on); pauseBtn.textContent = on ? 'Spila' : 'Stöðva';
      if (on) cancelAnimationFrame(raf); else { const done = parseFloat(bullets[idx].style.getPropertyValue('--p')) || 0; t0 = performance.now() - done * IMAGE_MS; raf = requestAnimationFrame(tick); } };
    pauseBtn.addEventListener('click', () => setPaused(!paused));
    if (reduced) setPaused(true);
    return { pause() { setPaused(true); }, start() { replay(textEls(0)); paint(); if (paused) cancelAnimationFrame(raf); } };
  })();

  motionPreference.addEventListener('change', e => { reduced = e.matches; if (reduced) { lenis?.destroy(); lenis = null; hero?.pause(); document.querySelectorAll('[data-reveal],[data-split]').forEach(el => el.classList.add('in')); } });

  /* ---------- header: theme under its midpoint + collapse on scroll down past half a viewport */
  const hdr = document.getElementById('hdr');
  const themed = [...document.querySelectorAll('[data-theme]')].filter(s => s.parentElement.closest('[data-theme]')?.dataset.theme !== s.dataset.theme);
  let lastY = 0;
  function headerState(y) {
    const mid = hdr.querySelector('.hdr__row').offsetHeight / 2;
    let hit = '', aboveT = '', aboveB = -Infinity, belowT = '', belowTop = Infinity;
    for (const s of themed) {
      const r = s.getBoundingClientRect(), t = s.dataset.theme;
      if (r.top < mid && r.bottom > mid) { hit = t; continue; }
      if (t === 'media') continue;
      if (r.bottom <= mid && r.bottom > aboveB) { aboveB = r.bottom; aboveT = t; }
      else if (r.top >= mid && r.top < belowTop) { belowTop = r.top; belowT = t; }
    }
    const theme = hit || (aboveT === belowT ? aboveT : '');
    hdr.classList.toggle('hdr--grey', theme === 'grey');
    hdr.classList.toggle('hdr--offwhite', theme === 'media');
    hdr.classList.toggle('hdr--light', theme === 'dark');
    const down = y > lastY;
    hdr.classList.toggle('is-collapsed', innerWidth > 519 && down && y > innerHeight / 2 && !html.classList.contains('menu-open'));
    lastY = y;
  }
  onScroll(() => headerState(scrollY));
  headerState(0);

  /* ---------- menu + logo morph */
  const nav = document.getElementById('nav');
  const burger = document.getElementById('burger');
  const inertEls = [...document.querySelectorAll('main, footer, header')];
  const navTitles = [...nav.querySelectorAll('[data-split]')]; // the buttons inside the column titles
  function openMenu() {
    if (html.classList.contains('menu-open')) return;
    html.classList.add('menu-open'); burger.setAttribute('aria-expanded', 'true'); lockScroll(true);
    inertEls.forEach(el => el.inert = true);
    replay(navTitles); morph();
    nav.inert = false;
    nav.focus({ preventScroll: true });
  }
  function closeMenu() {
    if (!html.classList.contains('menu-open')) return;
    nav.inert = true;
    html.classList.remove('menu-open'); burger.setAttribute('aria-expanded', 'false'); lockScroll(false);
    inertEls.forEach(el => el.inert = false); navTitles.forEach(el => el.classList.remove('in'));
    if (clone) { gsap.killTweensOf(clone.querySelectorAll('path')); clone.remove(); clone = null; footMark.style.opacity = ''; }
    burger.focus({ preventScroll: true });
  }
  nav.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const els = [...nav.querySelectorAll('a[href],button')].filter(el => !el.closest('[inert]') && el.getClientRects().length);
    const first=els[0], last=els.at(-1);
    if (e.shiftKey && (document.activeElement===first || document.activeElement===nav)) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement===last) { e.preventDefault(); first?.focus(); }
  });
  burger.addEventListener('click', openMenu);
  document.getElementById('close').addEventListener('click', closeMenu);
  addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
  nav.querySelectorAll('.nav__col').forEach(c => { const b = c.querySelector('.acc'); b.addEventListener('click', () => { if (innerWidth > 1023) return; b.setAttribute('aria-expanded', c.classList.toggle('open')); }); });
  if (fine) nav.addEventListener('click', e => {
    const a = e.target.closest('a'); if (!a) return;
    nav.querySelectorAll('.nav__links a').forEach(o => { if (o !== a) o.style.opacity = .25; });
    setTimeout(() => nav.querySelectorAll('.nav__links a').forEach(o => o.style.opacity = ''), 1500);
  });

  const footMark = document.getElementById('footMark');
  let clone = null;
  function morph() {
    if (innerWidth < 1024 || reduced || !hdr.querySelector('[data-morph]')) return; // raster client logo: morph dropped per TRANSPLANT.md §2.3
    const src = hdr.querySelector('[data-morph]').getBoundingClientRect();
    if (!src.width) return;
    const scale = src.width / 57;
    clone = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    clone.setAttribute('viewBox', `0 0 ${innerWidth / scale} ${innerHeight / scale}`);
    Object.assign(clone.style, { position: 'fixed', inset: 0, width: '100vw', height: '100vh', zIndex: 8001, pointerEvents: 'none', color: '#f8f8f9' });
    clone.innerHTML = `<g transform="translate(${src.left / scale} ${src.top / scale})">${document.querySelector('#mark g').innerHTML}</g>`;
    document.body.appendChild(clone);
    footMark.style.opacity = 0;
    requestAnimationFrame(() => {
      const f = footMark.getBoundingClientRect();
      const o = { x: (f.left - src.left) / scale, y: (f.top - src.top) / scale };
      const corners = [{ x: o.x, y: 0 }, { x: o.x, y: o.y }, { x: 0, y: o.y }, { x: 0, y: 0 }];
      const arcs = [...clone.querySelectorAll('path')];
      const tl = gsap.timeline({ onComplete: () => { footMark.style.opacity = ''; clone?.remove(); clone = null; } });
      arcs.forEach((p, i) => tl.to(p, { x: corners[i].x, y: corners[i].y, duration: .9, ease: 'dive', delay: .6 }, 0));
      tl.to(arcs.filter((_, i) => i !== 1), { x: o.x, y: o.y, duration: .9, ease: 'dive' }, '>-0.1');
    });
  }

  /* ---------- custom cursor bubble */
  if (fine) {
    const cur = document.getElementById('cur'), txt = document.getElementById('curText');
    const pos = { x: 0, y: 0 }, m = { x: 0, y: 0 };
    let over = null;
    addEventListener('mousemove', e => { m.x = e.clientX; m.y = e.clientY; check(); });
    onScroll(check);
    function check() {
      const t = document.elementFromPoint(m.x, m.y)?.closest('[data-cursor]');
      if (t !== over) { over = t; if (t) txt.textContent = t.dataset.cursor; cur.classList.toggle('on', !!t); }
    }
    gsap.ticker.add(() => {
      if (!cur.classList.contains('on') && Math.abs(m.x - pos.x) + Math.abs(m.y - pos.y) < .5) return; // idle: no per-frame writes
      const k = 1 - Math.pow(1 - 1 / 10, gsap.ticker.deltaRatio());
      pos.x += (m.x - pos.x) * k; pos.y += (m.y - pos.y) * k;
      cur.style.transform = `translate3d(${pos.x}px,${pos.y}px,0)`;
    });
  }

  /* ---------- count-up: numbers in text run from 0 over 2000 ms, formatting kept */
  const countIO = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return; countIO.unobserve(e.target);
    const nodes = [...e.target.childNodes].filter(n => n.nodeType === 3 && /\d/.test(n.textContent));
    nodes.forEach(n => {
      const target = parseFloat(n.textContent.replace(/[^\d.]/g, '')), dec = (n.textContent.split('.')[1] || '').replace(/\D/g, '').length;
      const o = { v: 0 }; n.textContent = (0).toFixed(dec);
      gsap.to(o, { v: target, duration: reduced ? 0 : 2, ease: 'power1.out', onUpdate: () => n.textContent = o.v.toFixed(dec) });
    });
  }), { threshold: 0 });
  document.querySelectorAll('[data-count]').forEach(el => countIO.observe(el));

  /* ---------- onboard slider (Swiper, centred loop, per-slide parallax) */
  document.querySelectorAll('[data-onboard]').forEach(root => {
    const bar = root.querySelector('.obs__bar i');
    const sw = new Swiper(root.querySelector('.swiper'), {
      slidesPerView: 'auto', centeredSlides: true, loop: true, loopAdditionalSlides: 1, grabCursor: true, watchSlidesProgress: true,
      speed: 900, threshold: 25, spaceBetween: 16, breakpoints: { 768: { spaceBetween: 20 }, 1024: { spaceBetween: 24 } },
      navigation: { prevEl: root.querySelector('[data-prev]'), nextEl: root.querySelector('[data-next]') },
      on: {
        setTranslate(s) { s.slides.forEach(el => el.style.setProperty('--sp-p', el.progress)); },
        setTransition(s, d) { s.slides.forEach(el => el.style.setProperty('--pd', d + 'ms')); },
        slideChange(s) { bar.parentElement.style.setProperty('--prog', (s.realIndex + 1) / root.querySelectorAll('.obs__slide:not(.swiper-slide-duplicate)').length); }
      }
    });
    sw.emit('slideChange');
  });

  /* ---------- sticky videos: progress % + active caption (desktop) */
  document.querySelectorAll('[data-stv]').forEach(sec => {
    const media = [...sec.querySelectorAll('.stv__v')], items = [...sec.querySelectorAll('.stv__item')], pct = sec.querySelector('[data-pct]');
    const update = () => {
      const r = sec.getBoundingClientRect(), p = Math.min(1, Math.max(0, -r.top / (r.height - innerHeight)));
      pct.textContent = Math.round(p * 100) + '%';
      let a = 0;
      for (let i = media.length - 1; i >= 1; i--) { const m = media[i].getBoundingClientRect(), k = (innerHeight - m.top) / m.height; if (k >= .55) { a = i; break; } if (k >= .1) { a = null; break; } }
      items.forEach((it, i) => it.classList.toggle('is-active', i === a));
    };
    onScroll(update); update();
  });

  /* ---------- media divider: pointer side drives the split */
  document.querySelectorAll('[data-divider]').forEach(d => {
    if (!fine) return;
    d.addEventListener('mousemove', e => { const r = d.getBoundingClientRect(), left = e.clientX - r.left < r.width / 2; d.classList.toggle('is-left', left); d.classList.toggle('is-right', !left); });
    d.addEventListener('mouseleave', () => d.classList.remove('is-left', 'is-right'));
  });

  /* ---------- view switcher: sliding ink pill, swaps [data-view] panels */
  document.querySelectorAll('[data-switch]').forEach(sw => {
    const ink = sw.querySelector('.vsw__ink'), btns = [...sw.querySelectorAll('button')];
    const scope = document.querySelector(sw.dataset.switch);
    const place = b => { ink.style.transform = `translateX(${b.offsetLeft}px) scaleX(${b.offsetWidth / 100})`; }; // transform only: width is a fixed 100px base
    const pick = b => {
      btns.forEach(o => o.setAttribute('aria-pressed', o === b)); place(b);
      scope.querySelectorAll('[data-view]:not(button)').forEach(v => v.hidden = v.dataset.view !== b.dataset.view);
    };
    btns.forEach(b => b.addEventListener('click', () => pick(b)));
    document.fonts.ready.then(() => pick(btns.find(b => b.getAttribute('aria-pressed') === 'true') || btns[0]));
  });
  document.querySelectorAll('[data-tabs]').forEach(t => t.querySelectorAll('button').forEach(b => b.addEventListener('click', () => t.querySelectorAll('button').forEach(o => o.setAttribute('aria-pressed', o === b)))));

  /* ---------- member dialog */
  const dlg = document.getElementById('dlg');
  if (dlg) {
    const close = () => { dlg.classList.remove('open'); lockScroll(false); };
    document.querySelectorAll('[data-member]').forEach(m => m.addEventListener('click', () => {
      dlg.querySelector('[data-dlg-name]').textContent = m.querySelector('.mem__n').textContent;
      dlg.querySelector('[data-dlg-role]').textContent = m.querySelector('.mem__r').textContent;
      dlg.classList.add('open'); lockScroll(true); dlg.querySelector('.dlg__close').focus();
    }));
    dlg.querySelectorAll('[data-dlg-close]').forEach(b => b.addEventListener('click', close));
    addEventListener('keydown', e => { if (e.key === 'Escape' && dlg.classList.contains('open')) close(); });
  }

  /* ---------- legal chapter index: active anchor + eased jump */
  document.querySelectorAll('[data-chapters]').forEach(root => {
    const hh = () => hdr.querySelector('.hdr__row').offsetHeight;
    const pairs = [...root.querySelectorAll('[data-anchor]')].map(a => [a, document.querySelector(a.getAttribute('href'))]);
    const update = () => {
      const line = hh();
      const hit = pairs.find(([, s]) => { const r = s.getBoundingClientRect(); return r.top <= line && r.bottom > line; })
        || [...pairs].reverse().find(([, s]) => s.getBoundingClientRect().top <= line) || pairs[0];
      pairs.forEach(([a]) => a.classList.toggle('is-active', a === hit[0]));
    };
    pairs.forEach(([a, s]) => a.addEventListener('click', e => {
      e.preventDefault();
      const y = s.getBoundingClientRect().top + scrollY - hh() + 1, d = Math.abs(scrollY - y), vh = innerHeight;
      const dur = (Math.log(d) / Math.log(vh) + Math.sqrt(d) / Math.sqrt(vh)) * .5;
      lenis ? lenis.scrollTo(y, { duration: dur, easing: t => 1 - Math.pow(1 - t, 3) }) : gsap.to(window, { scrollTo: y, duration: dur, ease: 'power3.out' });
    }));
    onScroll(update); update();
  });

  /* ---------- lightbox film: slit-open stage, auto-hiding controls (placeholder clip, 90 s) */
  const lbx = document.getElementById('lbx');
  if (lbx) {
    const LEN = 90, bar = lbx.querySelector('.lbx__bar'), time = lbx.querySelector('[data-lbx-time]'), playBtn = lbx.querySelector('[data-lbx-play]');
    let t = 0, playing = false, last = 0, idle = 0, opener = null;
    const fmt = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    const render = () => { bar.style.setProperty('--p', t / LEN); bar.setAttribute('aria-valuenow', Math.round(t)); bar.setAttribute('aria-valuetext', fmt(t)); time.textContent = `${fmt(t)} / ${fmt(LEN)}`; };
    const tick = now => { if (!playing) return; t = Math.min(LEN, t + (now - last) / 1000); last = now; render(); if (t >= LEN) setPlay(false); else requestAnimationFrame(tick); };
    const setPlay = on => { playing = on; lbx.classList.toggle('playing', on); playBtn.textContent = on ? 'Pause' : 'Play'; if (on) { last = performance.now(); requestAnimationFrame(tick); } };
    const wake = () => { lbx.classList.remove('idle'); clearTimeout(idle); if (playing) idle = setTimeout(() => lbx.classList.add('idle'), 2500); };
    const open = e => { e.preventDefault(); opener = e.currentTarget; lbx.inert = false; lbx.classList.add('open'); lockScroll(true); inertEls.forEach(el => el.inert = true); setTimeout(() => { setPlay(true); wake(); }, 100); lbx.querySelector('.lbx__close').focus({ preventScroll: true }); };
    const close = () => { setPlay(false); lbx.classList.remove('open', 'idle'); lbx.inert = true; lockScroll(false); inertEls.forEach(el => el.inert = false); opener?.focus({ preventScroll: true }); };
    document.querySelectorAll('[data-lightbox]').forEach(a => a.addEventListener('click', open));
    lbx.querySelector('.lbx__close').addEventListener('click', close);
    playBtn.addEventListener('click', () => { setPlay(!playing); wake(); });
    lbx.querySelector('[data-lbx-mute]').addEventListener('click', e => e.currentTarget.textContent = e.currentTarget.textContent === 'Sound off' ? 'Sound on' : 'Sound off');
    bar.addEventListener('click', e => { const r = bar.getBoundingClientRect(); t = LEN * (e.clientX - r.left) / r.width; render(); });
    bar.addEventListener('keydown', e => { const d = { ArrowRight: 5, ArrowLeft: -5, Home: -LEN, End: LEN }[e.key]; if (d === undefined) return; e.preventDefault(); t = Math.min(LEN, Math.max(0, t + d)); render(); wake(); });
    lbx.addEventListener('mousemove', e => { if (e.movementX || e.movementY) wake(); });
    addEventListener('keydown', e => { if (e.key === 'Escape' && lbx.classList.contains('open')) close(); });
    render();
  }

  /* ---------- scroll cue in heroes */
  document.querySelectorAll('[data-scroll-next]').forEach(b => b.addEventListener('click', () => {
    const next = b.closest('section').nextElementSibling; if (!next) return;
    const y = next.getBoundingClientRect().top + scrollY;
    lenis ? lenis.scrollTo(y) : scrollTo({ top: y, behavior: reduced ? 'instant' : 'smooth' });
  }));

  /* ---------- footer */
  document.getElementById('toTop').addEventListener('click', () => lenis ? lenis.scrollTo(0) : scrollTo({ top: 0, behavior: reduced ? 'instant' : 'smooth' }));
  document.querySelectorAll('.ftr__nav > div').forEach(c => { const b = c.querySelector('.acc'); b.addEventListener('click', () => { if (innerWidth > 519) return; b.setAttribute('aria-expanded', c.classList.toggle('open')); }); });
})();
