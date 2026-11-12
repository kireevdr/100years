/* Золотой салют первого экрана — планшет и компьютер (на телефоне свой салют в logo-morph.js).

   Как устроено (по мотивам лучших canvas-симуляторов фейерверков):
   • два холста: «шлейфы» (кадр не стирается, а плавно гаснет — отсюда гладкие светящиеся хвосты без «пикселей»)
     и «свечение» (стирается каждый кадр: яркие головки звёзд, вспышки разрывов);
   • ракеты прилетают из-за левого и правого края, по баллистической дуге к центру, и рвутся в верхней точке;
   • звёзды разлетаются по сфере (проекция 3D-оболочки — «пушистый» шар без овальных колец), тормозятся воздухом,
     провисают под тяжестью; виды: пион, хризантема с блёстками, золотая ива, корона с треском, двойной разрыв;
   • всё считается по реальному времени (а не по кадрам) — скорость одинаковая на любом экране;
   • разрешение = плотности пикселей экрана (до 2×) с ограничением площади — чёткость без перегрузки;
   • салют работает, только пока первый экран виден и вкладка активна.

   GoldShow(box, { getExclude })  box — контейнер (position: absolute), getExclude() → [[x0,y0,x1,y1], …]
   области в координатах контейнера, где звёзды приглушаются (текст первого экрана).
   .setIntensity(0..1)  .resize()  .destroy()
*/
(function (root) {
  const TAU = Math.PI * 2;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[(Math.random() * a.length) | 0];
  const PAL = {
    gold: [255, 190, 86], honey: [255, 214, 138], champagne: [255, 236, 200],
    amber: [255, 160, 64], white: [255, 250, 238]
  };
  const SETS = [['gold', 'honey'], ['honey', 'champagne'], ['gold', 'amber'], ['champagne', 'white', 'gold'], ['gold', 'honey', 'champagne']];

  function glowSprite(rgb, size, hot) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'), r = size / 2, gr = g.createRadialGradient(r, r, 0, r, r, r);
    const [R, G, B] = rgb;
    if (hot) { gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, `rgba(${R},${G},${B},.9)`); }
    else gr.addColorStop(0, `rgba(${R},${G},${B},.95)`);
    gr.addColorStop(0.35, `rgba(${R},${G},${B},.35)`);
    gr.addColorStop(0.7, `rgba(${R},${G},${B},.08)`);
    gr.addColorStop(1, `rgba(${R},${G},${B},0)`);
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    return c;
  }

  function GoldShow(box, opts) {
    opts = opts || {};
    const cT = document.createElement('canvas'), cM = document.createElement('canvas');
    cT.className = 'fwd__trails'; cM.className = 'fwd__glow';
    box.append(cT, cM);
    const xT = cT.getContext('2d'), xM = cM.getContext('2d');
    const GLOW = {}, HOT = {};
    for (const k in PAL) { GLOW[k] = glowSprite(PAL[k], 64, false); HOT[k] = glowSprite(PAL[k], 32, true); }
    const FLASH = glowSprite([255, 200, 120], 256, false);

    let W = 1, H = 1, S = 1, U = 1, EX = [];
    let stars = [], sparks = [], rockets = [], flashes = [];
    let intensity = 0, running = false, last = 0, clock = 0, next = 0.25, salvo = 0, density = 1, slow = 0;

    function resize() {
      const r = box.getBoundingClientRect();
      W = Math.max(1, r.width); H = Math.max(1, r.height);
      U = Math.min(W, H * 1.6) / 900;                       // единица масштаба: салют пропорционален экрану
      const d = window.devicePixelRatio || 1;
      S = Math.min(d, 2, Math.sqrt(2.8e6 / (W * H)));        // чёткость до 2×, но не больше ~2.8 Мп на холст
      for (const c of [cT, cM]) { c.width = Math.round(W * S); c.height = Math.round(H * S); }
      xT.setTransform(S, 0, 0, S, 0, 0); xM.setTransform(S, 0, 0, S, 0, 0);
      EX = opts.getExclude ? (opts.getExclude() || []) : [];
    }
    const dim = (x, y) => { for (const e of EX) if (x > e[0] && x < e[2] && y > e[1] && y < e[3]) return 0.38; return 1; };

    // ---------- ракета: из-за края экрана по дуге, разрыв в верхней точке ----------
    function launch(side, tx, ty, type, delay) {
      const x0 = side < 0 ? rnd(-0.04, 0.06) * W : rnd(0.94, 1.04) * W, y0 = H * rnd(0.96, 1.04);
      const g = H * 1.05;                                      // «тяжесть» ракеты
      const T = Math.sqrt(2 * Math.max(40, y0 - ty) / g) * rnd(0.94, 1);
      rockets.push({ x: x0, y: y0, px: x0, py: y0, x0, y0, vx: (tx - x0) / T, vy0: (ty - y0 - 0.5 * g * T * T) / T, g, T, t: -(delay || 0), type, set: pick(SETS) });
    }

    // ---------- разрыв ----------
    function star(x, y, vx, vy, o) {
      stars.push(Object.assign({ x, y, px: x, py: y, vx, vy, age: 0, life: 1.8, drag: 2.3, g: 95 * U * 1.4, size: 2.4, col: 'gold', glitter: 0, willow: 0, crackle: 0 }, o));
    }
    function sphere(n, R, cb) {                                // равномерно по сфере, проекция на экран
      for (let i = 0; i < n; i++) {
        const u = rnd(-1, 1), th = rnd(0, TAU), r = Math.sqrt(1 - u * u), k = rnd(0.9, 1.06);
        cb(Math.cos(th) * r * R * k, Math.sin(th) * r * R * k, i);
      }
    }
    function burst(rk) {
      const { x, y, type, set } = rk, D = density;
      const R = rnd(170, 240) * U * (type === 'willow' ? 1.15 : 1);
      flashes.push({ x, y, age: 0, life: 0.38, size: R * 2.8 });
      if (type === 'peony') {
        sphere(Math.round(150 * D), R, (dx, dy) => star(x, y, dx * 2.3, dy * 2.3, { col: pick(set), life: rnd(1.6, 2.2), glitter: 5 }));
      } else if (type === 'chrysanthemum') {
        sphere(Math.round(120 * D), R, (dx, dy) => star(x, y, dx * 2.3, dy * 2.3, { col: pick(set), life: rnd(1.8, 2.4), glitter: 30 }));
      } else if (type === 'willow') {
        sphere(Math.round(100 * D), R, (dx, dy) => star(x, y, dx * 2.0, dy * 2.0, { col: pick(['gold', 'honey']), life: rnd(2.8, 3.6), drag: 2.6, g: 60 * U * 1.4, willow: 1, size: 2 }));
      } else if (type === 'crown') {
        sphere(Math.round(130 * D), R, (dx, dy) => star(x, y, dx * 2.3, dy * 2.3, { col: pick(set), life: rnd(1.4, 1.8), crackle: 1 }));
      } else {                                                 // двойной разрыв: золотая оболочка + светлое ядро
        sphere(Math.round(120 * D), R, (dx, dy) => star(x, y, dx * 2.3, dy * 2.3, { col: pick(['gold', 'honey']), life: rnd(1.7, 2.2) }));
        sphere(Math.round(55 * D), R * 0.45, (dx, dy) => star(x, y, dx * 2.3, dy * 2.3, { col: pick(['champagne', 'white']), life: rnd(1.1, 1.5), size: 1.6, glitter: 14 }));
      }
    }

    // ---------- программа: залпы попеременно слева и справа, встречные пары, каскад ----------
    const TYPES = ['peony', 'chrysanthemum', 'willow', 'crown', 'double', 'peony', 'chrysanthemum'];
    function target(side) {
      return [W / 2 + side * W * rnd(0.04, 0.3) * (W > H ? 1 : 0.8), H * rnd(0.14, 0.44)];
    }
    function program(dt) {
      if (intensity < 0.05) return;
      clock += dt;
      if (clock < next) return;
      salvo++;
      if (salvo % 6 === 0) {                                   // каскад: шесть разрывов подряд с двух сторон
        for (let i = 0; i < 6; i++) { const s = i % 2 ? 1 : -1, [tx, ty] = target(s); launch(s, tx, ty, pick(TYPES), i * 0.24); }
        next = clock + 3.4;
      } else if (Math.random() < 0.35) {                       // встречная пара — зеркально к центру
        const t = pick(TYPES), [tx, ty] = target(-1);
        launch(-1, tx, ty, t, 0); launch(1, W - tx, ty + rnd(-0.04, 0.04) * H, t, rnd(0.05, 0.18));
        next = clock + rnd(1.5, 2.1);
      } else {
        const s = salvo % 2 ? -1 : 1, [tx, ty] = target(s);
        launch(s, tx, ty, pick(TYPES), 0);
        next = clock + rnd(0.85, 1.35);
      }
    }

    // ---------- физика ----------
    function step(dt) {
      program(dt);
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i]; r.t += dt; if (r.t < 0) continue;
        const t = Math.min(r.t, r.T);
        r.px = r.x; r.py = r.y;
        r.x = r.x0 + r.vx * t; r.y = r.y0 + r.vy0 * t + 0.5 * r.g * t * t;
        const n = Math.random() < 0.85 ? 2 : 1;                  // искрящий хвост ракеты
        for (let k = 0; k < n; k++) sparks.push({ x: r.x, y: r.y, px: r.x, py: r.y, vx: rnd(-18, 18) * U, vy: rnd(10, 50) * U, age: 0, life: rnd(0.35, 0.75), col: pick(['honey', 'gold', 'champagne']), w: rnd(0.8, 1.3), g: 40 * U });
        if (r.t >= r.T) { burst(r); rockets.splice(i, 1); }
      }
      for (let i = stars.length - 1; i >= 0; i--) {
        const s = stars[i]; s.age += dt;
        const f = Math.exp(-s.drag * dt);
        s.vx *= f; s.vy = s.vy * f + s.g * dt;
        s.px = s.x; s.py = s.y; s.x += s.vx * dt; s.y += s.vy * dt;
        if (s.willow && Math.random() < 34 * dt * density) sparks.push({ x: s.x, y: s.y, px: s.x, py: s.y, vx: s.vx * 0.05, vy: s.vy * 0.05 + 6 * U, age: 0, life: rnd(0.9, 1.5), col: 'gold', w: 1.1, g: 22 * U, hang: 1 });
        if (s.glitter && s.age > 0.25 && Math.random() < s.glitter * dt * density) sparks.push({ x: s.x, y: s.y, px: s.x, py: s.y, vx: rnd(-14, 14) * U, vy: rnd(0, 26) * U, age: 0, life: rnd(0.25, 0.6), col: 'white', w: 0.9, g: 55 * U, tw: 1 });
        if (s.age >= s.life) {
          if (s.crackle) for (let k = 0; k < 5; k++) { const a = rnd(0, TAU), v = rnd(40, 90) * U; sparks.push({ x: s.x, y: s.y, px: s.x, py: s.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, age: 0, life: rnd(0.12, 0.3), col: 'white', w: 1, g: 30 * U, tw: 1 }); }
          stars.splice(i, 1);
        }
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i]; p.age += dt;
        if (p.age >= p.life) { sparks.splice(i, 1); continue; }
        const f = Math.exp(-2.2 * dt); p.vx *= f; p.vy = p.vy * f + p.g * dt;
        p.px = p.x; p.py = p.y; p.x += p.vx * dt; p.y += p.vy * dt;
      }
      for (let i = flashes.length - 1; i >= 0; i--) { const fl = flashes[i]; fl.age += dt; if (fl.age >= fl.life) flashes.splice(i, 1); }
      if (stars.length > 2200) stars.splice(0, stars.length - 2200);
      if (sparks.length > 3200) sparks.splice(0, sparks.length - 3200);
    }

    // ---------- отрисовка ----------
    const buckets = new Map();
    function seg(col, a, w, x0, y0, x1, y1) {
      if (a < 0.02) return;
      const key = col + '|' + Math.min(8, Math.round(a * 8)) + '|' + Math.round(w * 2);
      let b = buckets.get(key); if (!b) { b = []; buckets.set(key, b); }
      b.push(x0, y0, x1, y1);
    }
    function draw(dt) {
      // шлейфы: прошлый кадр не стирается, а гаснет — получаются гладкие светящиеся хвосты
      xT.globalCompositeOperation = 'destination-out';
      xT.globalAlpha = 1;
      xT.fillStyle = `rgba(0,0,0,${(1 - Math.pow(1 - 0.15, dt * 60)).toFixed(3)})`;
      xT.fillRect(0, 0, W, H);
      xT.globalCompositeOperation = 'lighter';
      xT.lineCap = 'round';
      buckets.clear();
      const I = intensity;
      for (const s of stars) {
        const t = s.age / s.life, fade = t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35;
        seg(s.col, fade * I * dim(s.x, s.y), s.size * (1 - t * 0.35), s.px, s.py, s.x, s.y);
      }
      for (const p of sparks) {
        const t = p.age / p.life; let a = (1 - t) * I * (p.hang ? 0.55 : 0.9) * dim(p.x, p.y);
        if (p.tw) a *= 0.55 + 0.45 * Math.sin(p.age * 70);
        seg(p.col, a, p.w, p.px, p.py, p.x, p.y);
      }
      for (const r of rockets) if (r.t >= 0) seg('champagne', I, 2, r.px, r.py, r.x, r.y);
      buckets.forEach((b, key) => {
        const [col, aq, wq] = key.split('|'), c = PAL[col];
        xT.strokeStyle = `rgb(${c[0]},${c[1]},${c[2]})`; xT.globalAlpha = aq / 8; xT.lineWidth = wq / 2;
        xT.beginPath();
        for (let i = 0; i < b.length; i += 4) { xT.moveTo(b[i], b[i + 1]); xT.lineTo(b[i + 2], b[i + 3]); }
        xT.stroke();
      });
      xT.globalAlpha = 1;

      // свечение: головки звёзд, ракеты, вспышки разрывов
      xM.clearRect(0, 0, W, H);
      xM.globalCompositeOperation = 'lighter';
      for (const fl of flashes) {
        const t = fl.age / fl.life, a = (1 - t) * (1 - t) * 0.6 * I * dim(fl.x, fl.y), s = fl.size * (0.75 + 0.25 * t);
        xM.globalAlpha = a; xM.drawImage(FLASH, fl.x - s / 2, fl.y - s / 2, s, s);
      }
      for (const s of stars) {
        const t = s.age / s.life, fade = t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35, a = fade * I * dim(s.x, s.y);
        if (a < 0.03) continue;
        const tw = 0.85 + 0.15 * Math.sin(s.age * 30 + s.x), g = s.size * 9 * tw;
        xM.globalAlpha = a * 0.8; xM.drawImage(GLOW[s.col], s.x - g / 2, s.y - g / 2, g, g);
        if (t < 0.55) { const h = s.size * 3.4; xM.globalAlpha = a; xM.drawImage(HOT[s.col], s.x - h / 2, s.y - h / 2, h, h); }
      }
      for (const r of rockets) {
        if (r.t < 0) continue;
        xM.globalAlpha = I; xM.drawImage(HOT.champagne, r.x - 6, r.y - 6, 12, 12);
        xM.globalAlpha = I * 0.6; xM.drawImage(GLOW.honey, r.x - 14, r.y - 14, 28, 28);
      }
      xM.globalAlpha = 1; xM.globalCompositeOperation = 'source-over';
    }

    function loop(now) {
      if (!running) return;
      const raw = (now - (last || now)) / 1000; last = now;
      const dt = Math.min(1 / 30, raw);
      // «предохранитель»: если кадры долго тяжёлые — чуть меньше звёзд, но та же красота
      slow = slow * 0.95 + (raw > 0.024 ? 1 : 0) * 0.05;
      if (slow > 0.6 && density > 0.55) { density -= 0.05; slow = 0.3; }
      if (dt > 0) { step(dt); draw(dt); }
      const idle = intensity < 0.05 && !rockets.length && !stars.length && !sparks.length && !flashes.length;
      if (idle) { running = false; xT.clearRect(0, 0, W, H); xM.clearRect(0, 0, W, H); return; }
      requestAnimationFrame(loop);
    }
    function wake() { if (!running && intensity >= 0.05 && document.visibilityState !== 'hidden') { running = true; last = 0; requestAnimationFrame(loop); } }
    const onVis = () => { if (document.visibilityState === 'hidden') running = false; else wake(); };
    document.addEventListener('visibilitychange', onVis);

    this.resize = resize;
    this.setIntensity = v => { intensity = Math.max(0, Math.min(1, v)); wake(); };
    this.destroy = () => { running = false; document.removeEventListener('visibilitychange', onVis); cT.remove(); cM.remove(); };
    resize();
  }
  root.GoldShow = GoldShow;
})(window);
