/* Page UI that does not depend on WebGL: nav, reveals, counters, copy, etc. */

export function initUI({ reduced }) {
  const root = document.documentElement;
  const body = document.body;

  // ---- mobile menu
  const toggle = document.getElementById('nav-toggle');
  const links = document.getElementById('nav-links');
  const setMenu = (open) => {
    body.classList.toggle('nav-open', open);
    if (toggle) {
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    }
  };
  if (toggle) toggle.addEventListener('click', () => setMenu(!body.classList.contains('nav-open')));
  if (links) links.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') setMenu(false); });

  // ---- active section in the nav
  const navLinks = [...document.querySelectorAll('.nav-links a[href^="#"]')];
  const byId = new Map(navLinks.map((a) => [a.getAttribute('href').slice(1), a]));
  const accents = { about: '--c-white', experience: '--c-yellow', projects: '--c-red', skills: '--c-blue', education: '--c-orange', contact: '--c-green' };
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        navLinks.forEach((a) => a.classList.remove('active'));
        const a = byId.get(en.target.id);
        if (a) {
          a.classList.add('active');
          document.querySelector('.nav').style.setProperty('--nav-accent', `var(${accents[en.target.id] || '--c-white'})`);
        }
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    byId.forEach((_, id) => { const s = document.getElementById(id); if (s) io.observe(s); });
    // back in the hero: nothing is active
    const heroEl = document.getElementById('hero');
    if (heroEl) new IntersectionObserver((entries) => {
      if (entries.some((en) => en.isIntersecting)) navLinks.forEach((a) => a.classList.remove('active'));
    }, { rootMargin: '-45% 0px -50% 0px' }).observe(heroEl);
  }

  // ---- section labels: a tiny cube face that starts scrambled and solves itself
  const PALETTE = ['--c-white', '--c-yellow', '--c-red', '--c-orange', '--c-blue', '--c-green'];
  const faces = [...document.querySelectorAll('.eyebrow i')].map((i) => {
    i.classList.add('face3');
    const cells = [];
    for (let k = 0; k < 9; k++) {
      const b = document.createElement('b');
      if (!reduced) b.style.background = `var(${PALETTE[(Math.random() * 6) | 0]})`;
      i.appendChild(b);
      cells.push(b);
    }
    return { i, cells };
  });
  const solveFace = (head) => {
    const f = faces.find((x) => head.contains(x.i));
    if (!f || f.done) return;
    f.done = true;
    const order = [...f.cells.keys()].sort(() => Math.random() - 0.5);
    order.forEach((idx, n) => setTimeout(() => { f.cells[idx].style.background = ''; }, 260 + n * 85));
    setTimeout(() => f.i.classList.add('solved'), 260 + 9 * 85);
  };

  // ---- reveal on scroll (with a small stagger between siblings)
  const revealEls = [...document.querySelectorAll('[data-reveal]')];
  const counted = new WeakSet();
  const reveal = (el) => {
    el.classList.add('is-in');
    if (el.classList.contains('section-head')) solveFace(el);
    el.querySelectorAll('[data-count]').forEach(countUp);
  };
  if ('IntersectionObserver' in window && !reduced) {
    const groups = new Map();
    revealEls.forEach((el) => {
      const p = el.parentElement;
      const i = groups.get(p) || 0;
      groups.set(p, i + 1);
      el.style.setProperty('--d', `${Math.min(i, 6) * 0.08}s`);
    });
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.isIntersecting) {
          reveal(en.target);
          io.unobserve(en.target);
        }
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach(reveal);
  }

  // ---- number count-up for the stats row
  function countUp(el) {
    if (counted.has(el)) return;
    counted.add(el);
    const end = parseFloat(el.dataset.count);
    const dec = parseInt(el.dataset.decimals || '0', 10);
    if (reduced || !isFinite(end)) return;
    const dur = 1400;
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const v = end * (1 - Math.pow(1 - p, 4));
      el.textContent = v.toFixed(dec);
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = end.toFixed(dec);
    };
    el.textContent = (0).toFixed(dec);
    requestAnimationFrame(tick);
  }

  // ---- spotlight that follows the pointer on cards
  document.addEventListener('pointermove', (e) => {
    const card = e.target.closest && e.target.closest('.card');
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - r.left}px`);
    card.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, { passive: true });

  // ---- copy email
  const toast = document.getElementById('toast');
  let toastTimer = 0;
  const showToast = (msg) => {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  };
  document.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const text = btn.dataset.copy;
      let ok = false;
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
        ta.remove();
      }
      const label = btn.querySelector('span');
      if (ok) {
        btn.classList.add('copied');
        if (label) label.textContent = 'Copied';
        showToast('Email copied to clipboard');
        setTimeout(() => { btn.classList.remove('copied'); if (label) label.textContent = 'Copy email'; }, 2200);
      } else {
        showToast(text);
      }
    });
  });

  // ---- footer: back to the scrambled cube
  const toTop = document.getElementById('to-top');
  if (toTop) toTop.addEventListener('click', (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  });

  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  root.classList.add('ui-ready');
}
