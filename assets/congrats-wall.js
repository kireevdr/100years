/* Лендинг «100 лет СПбГУП» — стена поздравлений: две ленты навстречу друг другу + официальные поздравления на бланках.
   Без библиотек. Данные:
     data/congrats.json — [{ name, who, text }]                       (тот же файл, что и раньше)
     data/letters.json  — [{ org, author, role, quote, date, image, thumb }]
   Тексты вставляются только через textContent — HTML из JSON не исполняется. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const root = $('#cw');
  // стена поздравлений есть только на главной; блок с бланками работает и на странице всех поздравлений
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const plural = (n, f) => f[(n % 10 === 1 && n % 100 !== 11) ? 0 : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 1 : 2];
  const load = url => fetch(url, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
  if (root) (function () {


  /* ---------- окно «Читать полностью» ---------- */
  const dlg = $('#cw-dialog');
  let opener = null;
  function openWish(w, btn) {
    opener = btn;
    $('.cw-dialog__text', dlg).textContent = w.text;
    $('.cw-dialog__name', dlg).textContent = w.name;
    const who = $('.cw-dialog__who', dlg); who.textContent = w.who || ''; who.hidden = !w.who;
    document.documentElement.classList.add('cw-lock');
    dlg.showModal();
    $('.cw-dialog__body', dlg).scrollTop = 0;
  }
  if (dlg) {
    $('.cw-dialog__close', dlg).addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });     // клик по затемнению
    dlg.addEventListener('close', () => { document.documentElement.classList.remove('cw-lock'); if (opener) opener.focus({ preventScroll: true }); resumeAll(); });
  }

  /* ---------- карточка поздравления ---------- */
  function card(w) {
    const el = document.createElement('blockquote'); el.className = 'cw-card';
    const t = document.createElement('p'); t.className = 'cw-card__text'; t.textContent = w.text.replace(/\s*\n\s*/g, '\n').trim();
    const f = document.createElement('footer');
    const b = document.createElement('b'); b.textContent = w.name; f.append(b);
    if (w.who) { const s = document.createElement('span'); s.textContent = w.who.trim(); f.append(s); }
    const more = document.createElement('button'); more.type = 'button'; more.className = 'cw-card__more'; more.textContent = 'Читать полностью';
    more.setAttribute('aria-haspopup', 'dialog'); more.setAttribute('aria-label', 'Читать полностью поздравление: ' + w.name);
    el.append(t, more, f);
    return el;
  }

  /* ---------- бегущая лента ---------- */
  const rows = [];
  let userPaused = false;
  const pauseBtn = $('.cw__pause', root);
  function Row(el, items, dir) {
    const track = $('.cw__track', el);
    const fill = () => { track.innerHTML = ''; items.forEach(w => track.append(card(w))); };
    fill();
    // копия набора — для бесшовного круга (копия скрыта от экранного диктора)
    const clone = () => { Array.from(track.children).slice(0, items.length).forEach(c => { const k = c.cloneNode(true); k.setAttribute('aria-hidden', 'true'); $$('button', k).forEach(b => { b.tabIndex = -1; }); track.append(k); }); };
    clone();
    const r = { el, track, dir, x: 0, half: 0, hover: false, drag: null, speed: 0, dragged: 0 };
    // нажатие на любую карточку (в том числе в копии) открывает поздравление целиком; после перетаскивания — не открывает
    Array.from(track.children).forEach((c, i) => {
      c.dataset.i = i % items.length;
      if (!c.hasAttribute('aria-hidden')) { c.tabIndex = 0; c.setAttribute('role', 'button'); c.setAttribute('aria-label', 'Открыть поздравление: ' + items[i % items.length].name); }
      const b = $('.cw-card__more', c); b.tabIndex = -1; b.setAttribute('aria-hidden', 'true');
    });
    const open = c => { pauseAll(); openWish(items[+c.dataset.i], c); };
    track.addEventListener('click', e => { const c = e.target.closest('.cw-card'); if (!c || performance.now() - r.dragged < 250) return; open(c); });
    track.addEventListener('keydown', e => { const c = e.target.closest('.cw-card'); if (c && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(c); } });
    r.measure = () => {
      r.half = track.scrollWidth / 2;
      // «Читать полностью» — только там, где текст действительно обрезан
      $$('.cw-card', track).forEach(c => { const t = $('.cw-card__text', c); c.classList.toggle('is-clamped', t.scrollHeight > t.clientHeight + 2); });
      if (dir > 0 && r.x === 0) r.x = -r.half;
    };
    el.addEventListener('mouseenter', () => { r.hover = true; });
    el.addEventListener('mouseleave', () => { r.hover = false; });
    el.addEventListener('focusin', () => { r.hover = true; });
    el.addEventListener('focusout', () => { r.hover = false; });
    // перетаскивание пальцем / мышью
    el.addEventListener('pointerdown', e => { if (still.matches) return; r.drag = { x0: e.clientX, x: r.x, moved: false, id: e.pointerId }; });
    el.addEventListener('pointermove', e => { if (!r.drag) return; const d = e.clientX - r.drag.x0; if (!r.drag.moved && Math.abs(d) > 5) { r.drag.moved = true; try { el.setPointerCapture(r.drag.id); } catch (_) {} } if (r.drag.moved) r.x = r.drag.x + d; });
    const end = () => { if (r.drag && r.drag.moved) r.dragged = performance.now(); r.drag = null; };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    rows.push(r);
    return r;
  }
  function pauseAll() { rows.forEach(r => { r.paused = true; }); }
  function resumeAll() { rows.forEach(r => { r.paused = false; }); }

  let visible = true, last = 0, running = false;
  function tick(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    const v = innerWidth <= 600 ? 16 : 22;                                // px/с — спокойный темп, текст успевает читаться
    rows.forEach(r => {
      if (!r.half) return;
      const go = !userPaused && !r.hover && !r.paused && !r.drag && visible && !document.hidden;
      r.speed += ((go ? v : 0) - r.speed) * Math.min(1, dt * 4);          // мягкий разгон и торможение
      r.x += r.dir * r.speed * dt;
      if (r.x <= -r.half) r.x += r.half; else if (r.x > 0) r.x -= r.half;
      r.track.style.transform = `translate3d(${r.x.toFixed(2)}px,0,0)`;
    });
    requestAnimationFrame(tick);
  }
  function start() {
    root.classList.toggle('is-static', still.matches);
    rows.forEach(r => { r.track.style.transform = ''; r.x = 0; r.measure(); });
    if (still.matches) { running = false; return; }
    if (!running) { running = true; last = 0; requestAnimationFrame(tick); }
  }
  if (pauseBtn) pauseBtn.addEventListener('click', () => {
    userPaused = !userPaused;
    pauseBtn.setAttribute('aria-pressed', String(userPaused));
    $('span', pauseBtn).textContent = userPaused ? 'Продолжить' : 'Пауза';
  });

  function buildWall(list) {
    const items = list.filter(w => w && w.text && w.name);
    const n = items.length;
    const cnt = $('.cw__count', root);
    if (cnt) cnt.textContent = n + ' ' + plural(n, ['поздравление', 'поздравления', 'поздравлений']);
    // верхняя лента — короткие поздравления, нижняя — длинные; порядок внутри — как в файле, старт — случайный
    const byLen = items.map((w, i) => [w.text.length, i]).sort((a, b) => a[0] - b[0]);
    const cut = Math.ceil(n / 2), shortIdx = new Set(byLen.slice(0, cut).map(p => p[1]));
    const top = items.filter((w, i) => shortIdx.has(i)), bottom = items.filter((w, i) => !shortIdx.has(i));
    // каждая лента начинается со случайного поздравления (порядок внутри сохраняется — лента просто «сдвинута»)
    const rot = arr => { if (arr.length < 2) return arr; const k = Math.floor(Math.random() * arr.length); return arr.slice(k).concat(arr.slice(0, k)); };
    const topR = rot(top), bottomR = rot(bottom);
    const [r1, r2] = $$('.cw__row', root);
    Row(r1, topR, -1); Row(r2, bottomR.length ? bottomR : topR, 1);
    root.classList.add('is-ready');
    start();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => rows.forEach(r => r.measure()));
    let w0 = innerWidth;
    addEventListener('resize', () => { if (Math.abs(innerWidth - w0) > 1) { w0 = innerWidth; rows.forEach(r => r.measure()); } });
    if ('IntersectionObserver' in window) new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(root);
    (still.addEventListener ? still.addEventListener('change', start) : still.addListener(start));
  }
  const src = root.dataset.source || 'data/congrats.json';
  load(src).then(buildWall).catch(() => {
    const m = $('.cw__message', root); if (m) { m.hidden = false; m.textContent = 'Не удалось загрузить поздравления. Обновите страницу.'; }
  });

  })();

  /* ---------- официальные поздравления на бланках ---------- */
  const lt = $('#letters');
  const viewer = $('#lt-viewer');
  if (lt) {
    let letters = [], idx = 0;
    const show = () => {
      const l = letters[idx];
      const img = $('img', viewer); img.src = l.image; img.alt = 'Поздравление на бланке: ' + l.org;
      $('.lt-viewer__org', viewer).textContent = l.org;
      $('.lt-viewer__who', viewer).textContent = [l.author, l.role].filter(Boolean).join(', ');
      $('.lt-viewer__count', viewer).textContent = letters.length > 1 ? (idx + 1) + ' / ' + letters.length : '';
      $('.lt-viewer__paper', viewer).scrollTop = 0; viewer.classList.remove('is-zoom');
    };
    // увеличить лист — нажатием (мелкий шрифт бланка читается на телефоне)
    $('.lt-viewer__paper img', viewer).addEventListener('click', e => {
      const pap = $('.lt-viewer__paper', viewer), r = e.currentTarget.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
      viewer.classList.toggle('is-zoom');
      requestAnimationFrame(() => { const im = e.currentTarget; pap.scrollLeft = fx * im.offsetWidth - pap.clientWidth / 2; pap.scrollTop = fy * im.offsetHeight - pap.clientHeight / 2; });
    });
    $$('.lt-viewer__nav button', viewer).forEach(b => b.addEventListener('click', () => { idx = (idx + Number(b.dataset.d) + letters.length) % letters.length; show(); }));
    $('.lt-viewer__close', viewer).addEventListener('click', () => viewer.close());
    viewer.addEventListener('click', e => { if (e.target === viewer) viewer.close(); });
    viewer.addEventListener('keydown', e => { if (letters.length > 1 && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { idx = (idx + (e.key === 'ArrowRight' ? 1 : -1) + letters.length) % letters.length; show(); } });
    viewer.addEventListener('close', () => document.documentElement.classList.remove('cw-lock'));

    const strip = $('.lt__strip', lt), prev = $('.lt__arrow[data-d="-1"]', lt), next = $('.lt__arrow[data-d="1"]', lt);
    const arrows = () => {
      const over = strip.scrollWidth > strip.clientWidth + 2;
      lt.classList.toggle('is-scrollable', over);
      prev.disabled = strip.scrollLeft < 4; next.disabled = strip.scrollLeft > strip.scrollWidth - strip.clientWidth - 4;
    };
    $$('.lt__arrow', lt).forEach(b => b.addEventListener('click', () => {
      const step = (strip.firstElementChild ? strip.firstElementChild.offsetWidth : 300) + 24;
      strip.scrollBy({ left: Number(b.dataset.d) * step, behavior: still.matches ? 'auto' : 'smooth' });
    }));
    strip.addEventListener('scroll', arrows, { passive: true });
    addEventListener('resize', arrows);

    load(lt.dataset.source || 'data/letters.json').then(list => {
      letters = list.filter(l => l && l.image && l.org);
      const n = letters.length;
      letters.forEach((l, i) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'lt-card';
        b.setAttribute('aria-label', 'Открыть поздравление: ' + l.org);
        const fig = document.createElement('span'); fig.className = 'lt-card__sheet';
        const im = document.createElement('img'); im.src = l.thumb || l.image; im.alt = ''; im.loading = 'lazy'; im.width = 560; im.height = 792;
        fig.append(im);
        const body = document.createElement('span'); body.className = 'lt-card__body';
        const org = document.createElement('b'); org.className = 'lt-card__org'; org.textContent = l.org;
        const who = document.createElement('span'); who.className = 'lt-card__who'; who.textContent = [l.author, l.role].filter(Boolean).join(', ');
        body.append(org, who);
        if (l.quote) { const q = document.createElement('span'); q.className = 'lt-card__quote'; q.textContent = '«' + l.quote.replace(/^[«"]|[»"]$/g, '') + '»'; body.append(q); }
        const go = document.createElement('span'); go.className = 'lt-card__open'; go.textContent = 'Открыть письмо'; body.append(go);
        b.append(fig, body);
        b.addEventListener('click', () => { idx = i; show(); viewer.classList.toggle('is-single', n < 2); document.documentElement.classList.add('cw-lock'); viewer.showModal(); });
        strip.append(b);
      });
      (lt.closest('.lt-section') || lt).hidden = !n;
      requestAnimationFrame(arrows);
    }).catch(() => { (lt.closest('.lt-section') || lt).hidden = true; });
  }
})();
