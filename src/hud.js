/*
 * The intro overlay: move ticker, counters, live cube net, the story lines
 * and the big name
 * behind the cube that decodes itself as the cube gets solved.
 */
const STAGES = [
  { tag: 'Stage 1 / 4 · Understand', line: 'Understand the problem.', sub: 'Read the requirements, find the pieces that matter, and line them up first.' },
  { tag: 'Stage 2 / 4 · Design', line: 'Break it into pieces.', sub: 'Design the system in layers: data, APIs, interfaces.' },
  { tag: 'Stage 3 / 4 · Build', line: 'Build, test, iterate.', sub: 'Get every piece facing the right way, with tests to prove it.' },
  { tag: 'Stage 4 / 4 · Ship', line: 'Polish and ship.', sub: 'The last moves: the details that make it feel finished.' },
];
const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#$%&@*+=?';
const NAME = 'DIVYESH';

export class Hud {
  constructor({ tokens, nets, scrambleLength }) {
    this.n = tokens.length;
    this.nets = nets;
    this.el = {
      root: document.getElementById('hud'),
      story: document.querySelector('.hud-story'),
      kicker: document.getElementById('hud-kicker'),
      line: document.getElementById('hud-line'),
      sub: document.getElementById('hud-sub'),
      hint: document.getElementById('hud-hint'),
      ticker: document.getElementById('hud-ticker'),
      count: document.getElementById('hud-count'),
      bar: document.getElementById('hud-bar'),
      pct: document.getElementById('hud-pct'),
      net: document.getElementById('hud-net'),
      faces: document.getElementById('hud-faces'),
      big: document.getElementById('bigname'),
    };
    this.scrambleLength = scrambleLength;

    // ticker tokens
    this.tokenEls = tokens.map((t) => {
      const li = document.createElement('li');
      li.textContent = t;
      this.el.ticker.appendChild(li);
      return li;
    });

    // cube net: 6 faces x 9 stickers
    this.netCells = {};
    this.netFaces = {};
    for (const f of ['U', 'L', 'F', 'R', 'B', 'D']) {
      const face = document.createElement('div');
      face.className = 'net-face';
      face.dataset.face = f;
      this.netCells[f] = [];
      for (let i = 0; i < 9; i++) {
        const c = document.createElement('i');
        face.appendChild(c);
        this.netCells[f].push(c);
      }
      this.netFaces[f] = face;
      this.el.net && this.el.net.appendChild(face);
    }

    this.bigSpans = this.el.big ? [...this.el.big.querySelectorAll('span')] : [];
    if (window.matchMedia('(pointer: coarse)').matches && this.el.hint) {
      this.el.hint.lastChild.textContent = 'Swipe up to solve';
    }
    this.state = { k: -1, stage: -2, pct: -1, count: '', solved: null, hint: null, fade: -1, glyphT: 0, glyphQ: -1 };
    this.tokenCenters = [];
    this.measure();
  }

  measure() {
    const ol = this.el.ticker;
    if (!ol) return;
    const prev = ol.style.transform;
    ol.style.transform = 'none';
    this.tokenCenters = this.tokenEls.map((li) => li.offsetLeft + li.offsetWidth / 2);
    this.viewW = ol.parentElement.clientWidth;
    ol.style.transform = prev;
    this.state.k = -1; // force a re-layout of the ticker
  }

  setNet(k) {
    const net = this.nets[k];
    let solvedFaces = 0;
    for (const f of Object.keys(this.netCells)) {
      const cells = this.netCells[f];
      const cols = net[f];
      let uniform = true;
      for (let i = 0; i < 9; i++) {
        if (cells[i].dataset.c !== cols[i]) cells[i].dataset.c = cols[i];
        if (cols[i] !== cols[4]) uniform = false;
      }
      this.netFaces[f].classList.toggle('done', uniform);
      if (uniform) solvedFaces++;
    }
    if (this.el.faces) this.el.faces.textContent = String(solvedFaces);
  }

  /**
   * q: 0..1 solve progress, P: q * n, k: completed moves, f: fraction of the
   * current move, fade: 0..1 how far the hero has docked (HUD fades out).
   */
  update({ q, P, k, solved, fade, time }) {
    const s = this.state;
    const n = this.n;

    // --- ticker + net (only when the completed-move count changes)
    const cur = solved ? n : Math.min(n - 1, Math.floor(P + 0.02));
    if (cur !== s.k) {
      s.k = cur;
      this.tokenEls.forEach((li, i) => {
        li.classList.toggle('done', i < cur);
        li.classList.toggle('cur', i === cur && !solved);
      });
      const last = this.tokenCenters[n - 1] ?? 0;
      const target = solved ? (this.tokenCenters[0] + last) / 2 : this.tokenCenters[Math.min(cur, n - 1)] ?? 0;
      const x = Math.round(this.viewW / 2 - target);
      this.el.ticker.style.transform = `translate3d(${x}px,0,0)`;
      this.setNet(solved ? n : Math.min(k, n));
    }

    // --- counters
    const done = solved ? n : Math.min(n, Math.round(P));
    const count = `Move ${String(done).padStart(2, '0')}/${n}`;
    if (count !== s.count) {
      s.count = count;
      this.el.count.textContent = count;
    }
    const pct = solved ? 100 : Math.min(99, Math.round(q * 100));
    if (pct !== s.pct) {
      s.pct = pct;
      this.el.pct.textContent = solved ? 'Solved' : `${pct}% solved`;
      this.el.bar.style.transform = `scaleX(${q.toFixed(4)})`;
    }

    // --- story lines
    const stage = solved ? 99 : q < 0.004 ? -1 : Math.min(3, Math.floor(q * 4));
    if (stage !== s.stage) {
      s.stage = stage;
      let tag, line, sub;
      if (stage === -1) {
        tag = `Scrambled · ${this.scrambleLength} moves deep`;
        line = 'Every problem starts scrambled.';
        sub = 'Scroll, and watch it get solved one move at a time.';
      } else if (stage === 99) {
        tag = `Solved · ${n} moves`;
        line = 'Solved. Now let me show you what I build.';
        sub = 'Keep scrolling.';
      } else {
        ({ tag, line, sub } = STAGES[stage]);
      }
      this.el.kicker.textContent = tag;
      this.el.line.textContent = line;
      this.el.sub.textContent = sub;
      this.el.story.classList.remove('swap');
      void this.el.story.offsetWidth; // restart the swap-in animation
      this.el.story.classList.add('swap');
    }
    if (solved !== s.solved) {
      s.solved = solved;
      document.body.classList.toggle('is-solved', solved);
      this.el.big && this.el.big.classList.toggle('solved', solved);
    }
    const hint = q < 0.02;
    if (hint !== s.hint) {
      s.hint = hint;
      this.el.hint.classList.toggle('gone', !hint);
    }

    // --- the big name decodes as the cube is solved
    if (this.bigSpans.length) {
      const moved = Math.abs(q - s.glyphQ) > 0.003;
      if (moved || time - s.glyphT > 0.42) {
        s.glyphQ = q;
        s.glyphT = time;
        const L = NAME.length;
        this.bigSpans.forEach((sp, i) => {
          const locked = solved || q >= ((i + 1) / L) * 0.97;
          const ch = locked ? NAME[i] : GLYPHS[(Math.random() * GLYPHS.length) | 0];
          if (sp.textContent !== ch) sp.textContent = ch;
          sp.classList.toggle('on', locked);
        });
      }
    }

    // --- fade the whole overlay out as the hero docks in
    const fadeQ = Math.round(fade * 100) / 100;
    if (fadeQ !== s.fade) {
      s.fade = fadeQ;
      const o = Math.max(0, 1 - fade * 2.4);
      this.el.root.style.opacity = o.toFixed(3);
      this.el.root.style.transform = o < 1 ? `translate3d(0, ${(-fade * 60).toFixed(1)}px, 0)` : '';
      this.el.root.classList.toggle('off', o <= 0);
      if (this.el.big) {
        const ob = Math.max(0, 1 - fade * 1.8);
        this.el.big.style.opacity = ob.toFixed(3);
        this.el.big.classList.toggle('off', ob <= 0);
      }
    }
  }
}
