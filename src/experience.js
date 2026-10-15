/*
 * The scroll-driven experience.
 *
 * The page starts with a tall, empty "runway" (#intro). While it scrolls by,
 * a fixed full-screen canvas shows a scrambled cube; scroll progress plays the
 * solving moves forwards (and backwards when scrolling up). Once solved, the
 * cube glides into its slot in the hero (#cube-anchor) and from then on just
 * follows that slot as the page scrolls.
 */
import {
  DirectionalLight,
  MathUtils,
  NeutralToneMapping,
  PerspectiveCamera,
  PMREMGenerator,
  Scene,
  WebGLRenderer,
} from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Burst, CubeState, CubeView, facelets, invertMove, makeRng, makeScramble, parseMove } from './cube.js';
import { Hud } from './hud.js';

const SCRAMBLE_LENGTH = 18;
const SOLVE_VH = 1.6; // viewport heights of scrolling to play every move
const FOV = 26;
const CAM_Z = 18;
const CUBE_SPAN = 4.6; // on-screen extent of the cube, in world units at scale 1
const BASE_YAW = -0.7;
const BASE_PITCH = 0.5;
const TAU = Math.PI * 2;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOutQuart = (x) => 1 - Math.pow(1 - x, 4);
const moveEase = (f) => easeInOut(clamp((f - 0.08) / 0.84, 0, 1));

export function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) {
    return false;
  }
}

export function initExperience({ reduced }) {
  const canvas = document.getElementById('stage');
  const anchor = document.getElementById('cube-anchor');
  const hero = document.getElementById('hero');
  const intro = document.getElementById('intro');
  const aura = document.getElementById('aura');
  const ring = document.getElementById('ring');
  const params = new URLSearchParams(window.location.search);
  if (!canvas || !anchor || !hero || params.has('nogl') || !webglAvailable()) return false;
  const instant = params.has('instant');

  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const lowPower = coarse || (navigator.hardwareConcurrency || 8) <= 4;

  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    return false;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = NeutralToneMapping;
  renderer.toneMappingExposure = 1.0;

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environmentIntensity = 0.55;

  const camera = new PerspectiveCamera(FOV, 1, 0.1, 100);
  camera.position.set(0, 0, CAM_Z);
  const key = new DirectionalLight(0xffffff, 1.9);
  key.position.set(4, 7, 8);
  const fill = new DirectionalLight(0xffffff, 0.55);
  fill.position.set(-7, 1, 6);
  const rim = new DirectionalLight(0xb4c8ff, 0.6);
  rim.position.set(-8, 4, -7);
  scene.add(key, fill, rim);

  const cube = new CubeView({ detail: lowPower ? 3 : 4 });
  scene.add(cube.root);
  const burst = new Burst(lowPower ? 64 : 110);
  cube.root.add(burst.mesh);

  // --- scramble + every intermediate state of the solve, precomputed
  const seed = params.has('seed') ? Number(params.get('seed')) : (Math.random() * 2 ** 31) | 0;
  const scramble = makeScramble(SCRAMBLE_LENGTH, makeRng(seed));
  const solveTokens = scramble.slice().reverse().map(invertMove);
  const solve = solveTokens.map(parseMove);
  const n = solve.length;
  const states = [];
  const st = new CubeState();
  scramble.forEach((t) => st.apply(parseMove(t)));
  states.push(st.clone());
  for (const m of solve) states.push(st.apply(m).clone());
  const nets = states.map(facelets);

  const hud = new Hud({ tokens: solveTokens, nets, scrambleLength: SCRAMBLE_LENGTH });

  // --- sizing
  let vw = 0, vh = 0, cw = 1, ch = 1, visH = 1;
  function resize() {
    vw = window.innerWidth;
    vh = window.innerHeight;
    const r = canvas.getBoundingClientRect();
    cw = Math.max(1, r.width);
    ch = Math.max(1, r.height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowPower ? 1.6 : 2));
    renderer.setSize(cw, ch, false);
    camera.aspect = cw / ch;
    camera.updateProjectionMatrix();
    visH = 2 * CAM_Z * Math.tan(MathUtils.degToRad(FOV / 2));
    hud.measure();
  }
  resize();

  // --- interaction: parallax (mouse) and drag-to-spin (mouse + horizontal touch)
  const par = { x: 0, y: 0, tx: 0, ty: 0 };
  const drag = { on: false, id: null, x: 0, y: 0, t: 0, yaw: 0, pitch: 0, vy: 0, vp: 0 };
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    par.tx = (e.clientX / vw - 0.5) * 2;
    par.ty = (e.clientY / vh - 0.5) * 2;
    wake();
  }, { passive: true });
  function down(e) {
    if (e.button !== 0) return;
    if (e.target.closest && e.target.closest('a, button')) return;
    drag.on = true;
    drag.id = e.pointerId;
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.t = performance.now();
    drag.vy = drag.vp = 0;
    wake();
  }
  function move(e) {
    if (!drag.on || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    const now = performance.now();
    const dt = Math.max(8, now - drag.t) / 1000;
    drag.t = now;
    const ky = 0.0095, kp = e.pointerType === 'mouse' ? 0.0075 : 0;
    drag.yaw += dx * ky;
    drag.pitch = clamp(drag.pitch + dy * kp, -1.1, 1.1);
    drag.vy = clamp((dx * ky) / dt, -12, 12);
    drag.vp = clamp((dy * kp) / dt, -6, 6);
    wake();
  }
  function up(e) {
    if (e.pointerId !== drag.id) return;
    drag.on = false;
    drag.id = null;
  }
  for (const el of [anchor, intro]) {
    if (!el) continue;
    el.addEventListener('pointerdown', down);
  }
  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);

  // --- state
  let q = reduced ? 1 : 0; // smoothed solve progress 0..1
  let qTarget = q;
  let t = 0;
  let latched = true; // solved celebration already shown for the current solve
  let celeb = -1; // seconds since the celebration started (-1 = none)
  let firstFrame = true;
  let visible = true;

  function celebrate() {
    if (reduced) return;
    celeb = 0;
    burst.fire();
    if (ring && ring.animate) {
      ring.animate(
        [
          { opacity: 0.9, transform: `${ring.dataset.base} scale(0.6)` },
          { opacity: 0, transform: `${ring.dataset.base} scale(3.4)` },
        ],
        { duration: 1100, easing: 'cubic-bezier(.2,.7,.2,1)' }
      );
    }
  }

  function update(dt) {
    t += dt;
    const y = window.scrollY || window.pageYOffset || 0;
    qTarget = reduced ? 1 : clamp(y / (vh * SOLVE_VH), 0, 1);
    if (t < 1.5 && qTarget === 1 && q < 0.5) {
      // the browser restored a scroll position below the intro: skip the replay
      q = 1;
      latched = true;
    }
    q = instant ? qTarget : damp(q, qTarget, 6.2, dt);
    if (Math.abs(q - qTarget) < 0.0005) q = qTarget;

    // which move is playing, and how far through it
    const P = q * n;
    let k = Math.floor(P);
    let f = P - k;
    if (k >= n) { k = n; f = 0; }
    const mv = k < n ? solve[k] : null;
    cube.pose(states[k], mv, mv ? (moveEase(f) * mv.turns * Math.PI) / 2 : 0);
    // the last move is visually finished a little before P reaches n (eased tail)
    const solved = P >= n - 0.06;
    if (solved && !latched) {
      latched = true;
      celebrate();
    }
    if (!solved && P < n - 1) latched = false;

    // docking: 0 while the hero is below the fold, 1 once its top reaches the top
    const heroTop = hero.getBoundingClientRect().top;
    const d = reduced ? 1 : clamp(1 - heroTop / vh, 0, 1);
    const e = easeInOut(d);
    const ar = anchor.getBoundingClientRect();
    const mobile = vw < 900;
    const introSize = mobile ? Math.min(vw * 0.74, vh * 0.42) : Math.min(vw * 0.36, vh * 0.5);
    const ix = vw * 0.5;
    const iy = vh * (mobile ? 0.5 : 0.48);
    const cx = lerp(ix, ar.left + ar.width / 2, e);
    const cy = lerp(iy, ar.top + ar.height / 2, e);
    const size = lerp(introSize, ar.width * 0.94, e);

    visible = d < 1 || (ar.bottom > -80 && ar.top < ch + 80);

    // celebration: a spin, a pop and a flash of the stickers
    let celebYaw = 0, pop = 0, glow = solved ? 0.04 : 0;
    if (celeb >= 0) {
      celeb += dt;
      celebYaw = easeOutQuart(clamp(celeb / 1.5, 0, 1)) * TAU;
      pop = Math.sin(Math.PI * clamp(celeb / 0.6, 0, 1)) * 0.075;
      glow += 0.55 * Math.exp(-celeb * 2.4);
      if (celeb > 1.6) celeb = -1; // a full turn later, the orientation is identical
    }
    cube.setGlow(glow);

    // placement in world space
    const visW = visH * camera.aspect;
    const bob = reduced ? 0 : Math.sin(t * 1.15) * 0.06 * (1 - e * 0.6);
    const scale = ((size / ch) * visH) / CUBE_SPAN;
    cube.root.position.set((cx / cw - 0.5) * visW, (0.5 - cy / ch) * visH + bob * scale, 0);
    cube.root.scale.setScalar(scale * (1 + pop));

    // orientation: tour around the cube while solving, settle on the classic view
    par.x = damp(par.x, par.tx, 2.5, dt);
    par.y = damp(par.y, par.ty, 2.5, dt);
    if (!drag.on) {
      drag.yaw += drag.vy * dt;
      drag.pitch = clamp(drag.pitch + drag.vp * dt, -1.1, 1.1);
      drag.vy *= Math.exp(-2.2 * dt);
      drag.vp *= Math.exp(-3 * dt);
      if (Math.abs(drag.vy) < 0.5) drag.yaw = damp(drag.yaw, Math.round(drag.yaw / TAU) * TAU, 0.9, dt);
      if (Math.abs(drag.vp) < 0.5) drag.pitch = damp(drag.pitch, 0, 1.4, dt);
    }
    const idle = reduced ? 0 : 1;
    // one full turn while solving; the pitch swings from a top view to a bottom
    // view and back, crossing level only when a corner faces the camera
    const yaw = BASE_YAW - q * TAU + celebYaw + drag.yaw + idle * (0.12 * Math.sin(t * 0.42) + par.x * 0.22);
    const pitch = BASE_PITCH * Math.cos(q * TAU) + drag.pitch + idle * (0.05 * Math.sin(t * 0.61 + 1) + par.y * 0.14);
    cube.spin.rotation.set(clamp(pitch, -1.4, 1.4), yaw, 0, 'XYZ');

    burst.update(dt);

    // DOM layers that follow the cube
    if (aura) {
      const s = (size * 2.3) / 1000;
      const flash = celeb >= 0 ? Math.exp(-celeb * 1.6) : 0;
      aura.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0) rotate(${(t * 12).toFixed(1)}deg) scale(${s.toFixed(3)})`;
      aura.style.opacity = ((0.2 + 0.14 * q + 0.5 * flash) * (1 - e * 0.35)).toFixed(3);
      aura.classList.toggle('off', !visible);
    }
    if (ring) {
      ring.dataset.base = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0) scale(${(size / 200).toFixed(3)})`;
      ring.style.transform = ring.dataset.base;
    }

    hud.update({ q, P, k, f, solved, fade: d, time: t });
    document.body.classList.toggle('is-docked', d > 0.55);
    return visible;
  }

  // --- render loop that sleeps when nothing is on screen
  let raf = 0;
  let last = 0;
  function frame(now) {
    raf = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const show = update(dt);
    canvas.style.visibility = show ? 'visible' : 'hidden';
    if (show) {
      renderer.render(scene, camera);
      if (firstFrame) {
        firstFrame = false;
        anchor.classList.add('is-live');
        document.documentElement.classList.add('cube-live');
      }
    }
    const busy = show || burst.active || celeb >= 0 || Math.abs(q - qTarget) > 0.0005;
    if (busy && !document.hidden) raf = requestAnimationFrame(frame);
    else last = 0;
  }
  function wake() {
    if (!raf && !document.hidden) raf = requestAnimationFrame(frame);
  }

  window.addEventListener('scroll', wake, { passive: true });
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    // ignore the mobile toolbar collapsing (height-only changes); refit on real resizes
    const widthChanged = window.innerWidth !== vw;
    const bigHeightChange = Math.abs(window.innerHeight - vh) > 140;
    clearTimeout(resizeTimer);
    if (widthChanged || bigHeightChange) resizeTimer = setTimeout(() => { resize(); wake(); }, 60);
    else { vh = window.innerHeight; wake(); }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) wake(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { hud.measure(); wake(); });

  // skip button: glide to the hero (the cube speed-solves on the way)
  const skip = document.getElementById('skip-intro');
  if (skip) skip.addEventListener('click', () => {
    window.scrollTo({ top: hero.getBoundingClientRect().top + window.scrollY, behavior: reduced ? 'auto' : 'smooth' });
    setTimeout(() => hero.focus({ preventScroll: true }), 900);
  });

  // a visitor landing mid-page (deep link / reload) should not see a celebration replay
  latched = window.scrollY > vh * SOLVE_VH;
  if (latched) q = 1;

  window.__cube = { seed, scramble, solve: solveTokens, get progress() { return q; } };
  wake();
  return true;
}
