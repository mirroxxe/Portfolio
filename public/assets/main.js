/* Motion layer: scroll reveals, word-by-word headings, page transitions,
   cursor preview on project rows, gallery parallax. No dependencies.
   Everything is skipped when the visitor prefers reduced motion. */
(() => {
  const root = document.documentElement;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const curtain = document.querySelector('.curtain');
  const EASE = 'cubic-bezier(0.76, 0, 0.24, 1)';

  const flag = {
    get: () => { try { return sessionStorage.getItem('curtain'); } catch (e) { return null; } },
    set: () => { try { sessionStorage.setItem('curtain', '1'); } catch (e) {} },
    clear: () => { try { sessionStorage.removeItem('curtain'); } catch (e) {} },
  };

  /* ---------- reveal on scroll ---------- */

  function startReveals() {
    const items = [...document.querySelectorAll('[data-reveal]')];
    if (reduce || !('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (a.target.compareDocumentPosition(b.target) & 4 ? -1 : 1));
        visible.forEach((entry, i) => {
          entry.target.style.transitionDelay = `${Math.min(i, 7) * 90}ms`;
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    );
    items.forEach((el) => io.observe(el));
  }

  /* ---------- page ready (after the curtain, if any) ---------- */

  function ready() {
    root.classList.add('is-ready');
    startReveals();
  }

  function enter() {
    if (!curtain || reduce || !root.classList.contains('curtain-in')) {
      root.classList.remove('curtain-in');
      flag.clear();
      requestAnimationFrame(() => requestAnimationFrame(ready));
      return;
    }
    // The previous page left a black curtain covering the screen: lift it.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      curtain.style.transition = `transform 0.8s ${EASE}`;
      curtain.style.transform = 'translateY(-100%)';
      setTimeout(ready, 380);
      const done = () => {
        curtain.style.transition = 'none';
        root.classList.remove('curtain-in');
        curtain.style.transform = '';
        flag.clear();
      };
      curtain.addEventListener('transitionend', done, { once: true });
      setTimeout(done, 1200);
    }));
  }

  /* ---------- page transitions ---------- */

  function setupTransitions() {
    if (!curtain || reduce) return;
    document.addEventListener('click', (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest('a[href]');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      const samePage = url.pathname === location.pathname;
      if (samePage) return; // hash links on the same page just scroll smoothly
      e.preventDefault();
      flag.set();
      curtain.style.transition = `transform 0.6s ${EASE}`;
      curtain.style.transform = 'translateY(0)';
      setTimeout(() => { location.href = url.href; }, 620);
    });
    // Back/forward cache: make sure the curtain is not left covering the page.
    window.addEventListener('pageshow', (e) => {
      if (e.persisted) {
        curtain.style.transition = 'none';
        curtain.style.transform = '';
        root.classList.remove('curtain-in');
        flag.clear();
      }
    });
  }

  /* ---------- header state ---------- */

  function setupHeader() {
    const header = document.querySelector('.site-header');
    if (!header) return;
    const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---------- cursor preview on project rows ---------- */

  function setupPreview() {
    if (reduce || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const rows = document.querySelectorAll('.row[data-preview]');
    if (!rows.length) return;

    const box = document.createElement('div');
    box.className = 'preview';
    box.setAttribute('aria-hidden', 'true');
    const img = new Image();
    img.alt = '';
    box.appendChild(img);
    document.body.appendChild(box);

    let tx = 0, ty = 0, x = 0, y = 0, raf = 0, active = false;

    const loop = () => {
      x += (tx - x) * 0.16;
      y += (ty - y) * 0.16;
      box.style.transform = `translate3d(${x + 28}px, ${y - 90}px, 0)`;
      raf = active || Math.abs(tx - x) > 0.5 || Math.abs(ty - y) > 0.5 ? requestAnimationFrame(loop) : 0;
    };

    rows.forEach((row) => {
      row.addEventListener('mouseenter', (e) => {
        img.src = row.dataset.preview;
        tx = x = e.clientX;
        ty = y = e.clientY;
        active = true;
        box.classList.add('is-on');
        if (!raf) raf = requestAnimationFrame(loop);
      });
      row.addEventListener('mousemove', (e) => { tx = e.clientX; ty = e.clientY; });
      row.addEventListener('mouseleave', () => { active = false; box.classList.remove('is-on'); });
    });
  }

  /* ---------- gallery parallax ---------- */

  function setupParallax() {
    if (reduce) return;
    const frames = [...document.querySelectorAll('.frame')];
    if (!frames.length) return;
    let ticking = false;

    const update = () => {
      ticking = false;
      const vh = window.innerHeight;
      frames.forEach((f) => {
        const r = f.getBoundingClientRect();
        if (r.bottom < -100 || r.top > vh + 100) return;
        const p = Math.max(-1, Math.min(1, (r.top + r.height / 2 - vh / 2) / (vh / 2 + r.height / 2)));
        f.style.setProperty('--py', `${(p * -4.5).toFixed(2)}%`);
      });
    };
    const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request);
    update();
  }

  /* ---------- boot ---------- */

  const boot = () => {
    setupHeader();
    setupTransitions();
    setupPreview();
    setupParallax();
    enter();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
