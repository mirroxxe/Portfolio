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
    if (!('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (a.target.compareDocumentPosition(b.target) & 4 ? -1 : 1));
        visible.forEach((entry, i) => {
          const delay = Math.min(i, 7) * 90;
          const el = entry.target;
          el.style.transitionDelay = `${delay}ms`;
          el.classList.add('is-visible');
          // drop the stagger afterwards so hover transitions respond instantly
          setTimeout(() => { el.style.transitionDelay = ''; }, delay + 1400);
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
        f.style.setProperty('--py', `${(p * -1.8).toFixed(2)}%`);
      });
    };
    const request = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request);
    update();
  }

  /* ---------- colour theme ---------- */

  function setupTheme() {
    const btn = document.querySelector('.theme-toggle');
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const stored = () => { try { return localStorage.getItem('theme'); } catch (e) { return null; } };
    const apply = (t) => {
      root.setAttribute('data-theme', t);
      if (btn) btn.setAttribute('aria-pressed', String(t === 'dark'));
    };
    apply(root.getAttribute('data-theme') || (mq.matches ? 'dark' : 'light'));

    if (btn) {
      btn.addEventListener('click', () => {
        const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        try { localStorage.setItem('theme', next); } catch (e) {}
        // cross-fade the whole page where the browser supports it
        if (document.startViewTransition && !reduce) document.startViewTransition(() => apply(next));
        else apply(next);
      });
    }
    // follow the system setting until the visitor picks a theme themselves
    const follow = (e) => { if (!stored()) apply(e.matches ? 'dark' : 'light'); };
    if (mq.addEventListener) mq.addEventListener('change', follow);
  }

  /* ---------- magnetic buttons ---------- */

  function setupMagnetic() {
    if (reduce || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    document.querySelectorAll('.btn').forEach((b) => {
      b.addEventListener('mousemove', (e) => {
        const r = b.getBoundingClientRect();
        b.style.setProperty('--mx', `${((e.clientX - (r.left + r.width / 2)) * 0.22).toFixed(1)}px`);
        b.style.setProperty('--my', `${((e.clientY - (r.top + r.height / 2)) * 0.3).toFixed(1)}px`);
      });
      b.addEventListener('mouseleave', () => {
        b.style.removeProperty('--mx');
        b.style.removeProperty('--my');
      });
    });
  }

  /* ---------- image viewer ---------- */

  function setupLightbox() {
    const frames = [...document.querySelectorAll('.gallery .frame')];
    if (!frames.length) return;
    const items = frames.map((f) => {
      const img = f.querySelector('img');
      return { src: img.currentSrc || img.src, alt: img.alt };
    });

    const lb = document.createElement('div');
    lb.className = 'lb';
    lb.setAttribute('role', 'dialog');
    lb.setAttribute('aria-modal', 'true');
    lb.setAttribute('aria-label', 'Image viewer');
    lb.setAttribute('aria-hidden', 'true');
    const svg = (d) => `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    lb.innerHTML =
      '<div class="lb-backdrop"></div>' +
      '<figure class="lb-stage"><img class="lb-img" alt=""></figure>' +
      `<button class="lb-btn lb-close" type="button" aria-label="Close">${svg('M6 6l12 12M18 6 6 18')}</button>` +
      `<button class="lb-btn lb-prev" type="button" aria-label="Previous image">${svg('M15 5l-7 7 7 7')}</button>` +
      `<button class="lb-btn lb-next" type="button" aria-label="Next image">${svg('M9 5l7 7-7 7')}</button>` +
      '<p class="lb-count" aria-live="polite"></p>';
    document.body.appendChild(lb);

    const stage = lb.querySelector('.lb-stage');
    const img = lb.querySelector('.lb-img');
    const count = lb.querySelector('.lb-count');
    const btnClose = lb.querySelector('.lb-close');
    const btnPrev = lb.querySelector('.lb-prev');
    const btnNext = lb.querySelector('.lb-next');
    const single = items.length < 2;
    btnPrev.hidden = btnNext.hidden = single;

    let index = 0;
    let lastFocus = null;
    let closeTimer = 0;
    const isOpen = () => lb.classList.contains('is-open');

    function show(i, animate) {
      index = (i + items.length) % items.length;
      const it = items[index];
      const apply = () => {
        img.src = it.src;
        img.alt = it.alt;
        count.textContent = single ? '' : `${index + 1} / ${items.length}`;
        lb.classList.remove('is-zoomed');
        stage.scrollTo(0, 0);
        img.classList.remove('is-swap');
      };
      if (animate && !reduce) {
        img.classList.add('is-swap');
        setTimeout(apply, 150);
      } else apply();
      // warm the neighbours so arrows feel instant
      [index - 1, index + 1].forEach((n) => { new Image().src = items[(n + items.length) % items.length].src; });
    }

    function open(i) {
      clearTimeout(closeTimer);
      lastFocus = document.activeElement;
      show(i, false);
      root.classList.add('lb-lock');
      lb.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(() => lb.classList.add('is-open'));
      btnClose.focus({ preventScroll: true });
    }

    function close() {
      if (!isOpen()) return;
      lb.classList.remove('is-open', 'is-zoomed');
      lb.setAttribute('aria-hidden', 'true');
      root.classList.remove('lb-lock');
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }

    frames.forEach((f, i) => {
      f.tabIndex = 0;
      f.setAttribute('role', 'button');
      f.setAttribute('aria-label', `Open image ${i + 1} of ${frames.length}`);
      f.addEventListener('click', () => open(i));
      f.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(i); }
      });
    });

    btnClose.addEventListener('click', close);
    btnPrev.addEventListener('click', () => show(index - 1, true));
    btnNext.addEventListener('click', () => show(index + 1, true));
    lb.querySelector('.lb-backdrop').addEventListener('click', close);
    // click on empty space around the picture closes it; a tap on the picture zooms on phones
    stage.addEventListener('click', (e) => {
      if (e.target === img) {
        if (window.innerWidth <= 900) lb.classList.toggle('is-zoomed');
      } else if (!lb.classList.contains('is-zoomed')) close();
    });

    document.addEventListener('keydown', (e) => {
      if (!isOpen()) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft' && !single) show(index - 1, true);
      else if (e.key === 'ArrowRight' && !single) show(index + 1, true);
      else if (e.key === 'Tab') {
        const f = [btnClose, btnPrev, btnNext].filter((b) => !b.hidden);
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });

    // swipe between images
    let sx = 0, sy = 0;
    stage.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    stage.addEventListener('touchend', (e) => {
      if (single || lb.classList.contains('is-zoomed')) return;
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) show(index + (dx < 0 ? 1 : -1), true);
    }, { passive: true });
  }

  /* ---------- boot ---------- */

  const boot = () => {
    setupTheme();
    setupMagnetic();
    setupLightbox();
    setupHeader();
    setupTransitions();
    setupPreview();
    setupParallax();
    enter();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
