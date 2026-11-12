/* Лендинг «100 лет СПбГУП» — интерактив без библиотек */

/* Форма поздравлений: обработчик api/congrats.php; стена: data/congrats.json. */

(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- отступы для якорей: реальная высота шапки (и липкой навигации хроники) ---------- */
  const rootEl = document.documentElement, hdrEl = $('.site-header'), cnavEl = $('.chron-nav');
  let offW = -1;
  function setOffsets() {
    if (innerWidth === offW) return;                            // высота шапки зависит только от ширины
    offW = innerWidth;
    if (hdrEl) rootEl.style.setProperty('--hdr-h', hdrEl.offsetHeight + 'px');
    const stickyNav = cnavEl && getComputedStyle(cnavEl).position === 'sticky' && innerWidth <= 1024;
    rootEl.style.setProperty('--cnav-h', (stickyNav ? cnavEl.offsetHeight : 0) + 'px');
    // у разделов разные внутренние отступы — выравниваем по подписи раздела («Хроника», «Люди»…): 40 px под шапкой
    const h = hdrEl ? hdrEl.offsetHeight : 0;
    $$('section.section[id]').forEach(sec => {
      const cap = sec.querySelector('.head .cap, .cap');
      if (!cap) return;
      const inner = cap.getBoundingClientRect().top - sec.getBoundingClientRect().top;
      sec.style.scrollMarginTop = Math.round(h + 40 - inner) + 'px';
    });
  }
  setOffsets();
  addEventListener('resize', setOffsets);

  /* ---------- переход по ссылке с якорем с другой страницы: после загрузки шрифтов и картинок
     раскладка меняется, поэтому довыравниваем позицию (если человек ещё не начал листать сам) ---------- */
  if ('scrollRestoration' in history && cnavEl) history.scrollRestoration = 'manual';
  let userMoved = false;
  ['wheel', 'touchstart', 'keydown'].forEach(ev => addEventListener(ev, () => { userMoved = true; }, { passive: true, once: true }));
  function alignToHash() {
    if (userMoved) return;
    const id = decodeURIComponent(location.hash.slice(1));
    const t = id && document.getElementById(id);
    if (t) t.scrollIntoView({ behavior: 'instant', block: 'start' });
    else if (cnavEl) scrollTo({ top: 0, behavior: 'instant' });                         // «Полная хроника» без якоря — всегда с начала страницы
  }
  if (location.hash || cnavEl) {
    alignToHash();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(alignToHash);
    addEventListener('load', () => { setOffsets(); alignToHash(); });
  }

  /* ---------- мобильное интро: полный логотип → «100 лет СПбГУП» в шапке (assets/logo-morph.js) ---------- */
  const intro = $('.intro');
  if (intro && window.LogoMorph && window.LOGO_GLYPHS) {
    const root = document.documentElement;
    const mq = matchMedia('(max-width: 600px)'), rm = matchMedia('(prefers-reduced-motion: reduce)');
    const svg = $('.lm', intro), hint = $('.intro__hint', intro);
    const brand = $('.site-header .brand img'), hdr = $('.site-header'), burgerBtn = $('.site-header .burger');
    const hero = $('.hero'), heroWrap = $('.hero > .wrap'), bandImg = $('.band img');
    const clamp = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
    const GAP = 28;              // расстояние от логотипа до «Век служения культуре»
    /* Принцип плавности: текст и фото первого экрана прокручиваются браузером «как есть» (без JS-сдвигов),
       а логотип живёт в координатах страницы и едет вместе с ними. JS только меняет форму логотипа,
       поэтому ничего не дёргается даже при быстрой прокрутке пальцем. */
    let V = null, M = null;
    const lm = new LogoMorph({ svg, glyphs: window.LOGO_GLYPHS,
      getViewport: () => V,
      getTarget: () => ({ x: M.tx, y: M.ty, w: M.tw }) });
    const measure = () => {
      // высоту экрана фиксируем: когда в Safari прячется адресная строка, раскладка не перестраивается
      if (!V || Math.abs(V.w - innerWidth) > 1) V = { w: innerWidth, h: innerHeight };
      const hh = hdr.offsetHeight, r = brand.getBoundingClientRect();
      M = { tx: r.left, ty: r.top, tw: r.width, hh };
      intro.style.marginTop = -hh + 'px';
      lm.render(0); const b0 = lm.bottom();
      intro.style.height = Math.round(b0 + GAP - 4) + 'px';      // «Век служения» стоит сразу под логотипом (пока скрыт)
      M.heroTop = hero.getBoundingClientRect().top + scrollY;
      M.heroH = hero.offsetHeight;
      M.dist = Math.max(1, M.heroTop - hh);                       // за это расстояние логотип приходит в шапку
      lm.render(LogoMorph.END); M.bEnd = lm.bottom();
      M.gap1 = M.heroTop + 4 - M.dist - M.bEnd;                  // зазор в конце — чтобы логотип точно совпал с шапкой
      last = {};
    };
    // золотой салют (мобильный первый экран); над логотипом искры приглушаются, чтобы не «перекрашивать» его
    let shift = 0;
    const fwc = $('.fw', intro), fx = fwc && window.GoldFireworks ? new GoldFireworks(fwc, {
      getSize: () => ({ w: innerWidth, h: innerHeight }),
      getExclude: () => { const b = lm.box(), d = shift - scrollY; return b[2] > b[0] ? [b[0] - 14, b[1] + d - 14, b[2] + 14, b[3] + d + 14] : null; } }) : null;
    let ticking = false, last = {};
    const put = (k, v, fn) => { if (last[k] !== v) { last[k] = v; fn(v); } };
    function frame() {
      ticking = false;
      if (!root.classList.contains('has-intro')) return;
      if (!M) measure();
      const y = Math.max(0, scrollY), p = Math.min(1, y / M.dist);
      if (fx) fx.setIntensity(Math.max(0, Math.min(1, (M.heroTop - y + M.heroH) / (V.h * 0.45))));
      const done = p >= 1;
      put('done', done, v => root.classList.toggle('intro-done', v));
      put('brand', done ? 1 : 0, v => { brand.style.opacity = v; });
      put('burger', Math.round(clamp(p, .76, 1) * 40) / 40, v => { burgerBtn.style.opacity = v; });
      put('hint', Math.round((1 - clamp(y, 0, 30)) * 40) / 40, v => { hint.style.opacity = v; });
      // «Век служения культуре» всплывает с первого движения
      const f = clamp(y, 0, 70), e = f * f * (3 - 2 * f);
      put('hero', Math.round(e * 60) / 60, v => {
        heroWrap.style.opacity = v; heroWrap.style.transform = v < 1 ? `translate3d(0,${((1 - v) * 18).toFixed(1)}px,0)` : '';
        if (bandImg) bandImg.style.opacity = v; });
      if (done && last.rendered === 1) return;                   // логотип уже в шапке — дальше ничего не считаем
      lm.render(p * LogoMorph.END);
      // логотип «сидит» над текстом в координатах страницы: его нижний край = верх текста − зазор
      const gap = GAP + (M.gap1 - GAP) * p;
      shift = M.heroTop + 4 - gap - lm.bottom();
      svg.style.transform = `translate3d(0,${shift.toFixed(1)}px,0)`;
      last.rendered = done ? 1 : 0;
    }
    const req = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
    function setup() {
      const on = mq.matches && !rm.matches;
      root.classList.toggle('has-intro', on);
      if (!on) {
        if (fx) fx.setIntensity(0);
        root.classList.remove('intro-done');
        [brand, burgerBtn, heroWrap, bandImg, hint].forEach(el => { if (el) { el.style.opacity = ''; el.style.transform = ''; } });
        intro.style.height = ''; intro.style.marginTop = ''; last = {};
      }
      M = null; req();
    }
    addEventListener('scroll', req, { passive: true });
    let lastW = innerWidth;
    addEventListener('resize', () => {
      if (Math.abs(innerWidth - lastW) < 2) return;               // меняется только высота (адресная строка) — ничего не перестраиваем
      lastW = innerWidth; V = null; M = null; if (fx) fx.resize(); req();
    });
    addEventListener('load', () => { M = null; req(); });
    (mq.addEventListener ? mq.addEventListener('change', setup) : mq.addListener(setup));
    setup();
  }

  /* ---------- планшет и компьютер: большой логотип первого экрана улетает в шапку (assets/logo-morph.js) ----------
     На старте в шапке логотипа нет. С первого движения прокрутки полный логотип едет в левый верхний угол
     и уменьшается, а «Санкт-Петербургский Гуманитарный университет профсоюзов» гармошкой сжимается в «СПбГУП».
     Когда логотип встаёт на место, его подменяет обычная картинка в шапке (ссылка «в начало» работает как раньше). */
  const flight = $('svg.flight');
  if (flight && window.LogoMorph && window.LOGO_GLYPHS) {
    const root = document.documentElement;
    const wide = matchMedia('(min-width: 601px)'), rm = matchMedia('(prefers-reduced-motion: reduce)');
    const heroLogo = $('.hero__logo'), brand = $('.site-header .brand img');
    let lm = null, D = null, ticking = false, lastP = -1;
    const vp = () => ({ w: innerWidth, h: innerHeight });
    const measure = () => {
      const r = heroLogo.getBoundingClientRect(), hh = hdrEl ? hdrEl.offsetHeight : 0;
      const top = r.top + scrollY;
      // путь, за который логотип приходит в шапку: пока его середина не дойдёт до низа шапки, но не короче 280 px
      D = { top, dist: Math.max(280, top + r.height * 0.5 - hh) };
    };
    function frame() {
      ticking = false;
      if (!root.classList.contains('has-flight')) return;
      if (!D) measure();
      const p = Math.min(1, Math.max(0, scrollY) / D.dist);
      root.classList.toggle('flight-done', p >= 1);
      if (!lm || (p >= 1 && lastP >= 1)) { lastP = p; return; }
      lastP = p;
      lm.render(p * LogoMorph.END);
    }
    const req = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
    function setup() {
      const on = wide.matches;
      root.classList.toggle('has-flight', on);
      if (on && !rm.matches && !lm) {
        lm = new LogoMorph({ svg: flight, glyphs: window.LOGO_GLYPHS, getViewport: vp,
          getStart: () => { const r = heroLogo.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width }; },
          getTarget: () => { const r = brand.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width }; } });
        root.classList.add('flight-ready');
      }
      // «уменьшить движение»: без полёта — логотип шапки просто появляется, когда первый экран ушёл вверх
      if (!on) root.classList.remove('flight-done');
      D = null; lastP = -1; req();
    }
    addEventListener('scroll', req, { passive: true });
    addEventListener('resize', () => { D = null; lastP = -1; req(); });
    addEventListener('load', () => { D = null; lastP = -1; req(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { D = null; lastP = -1; req(); });
    (wide.addEventListener ? wide.addEventListener('change', setup) : wide.addListener(setup));
    setup();
  }

  /* ---------- золотой салют первого экрана: планшет и компьютер (assets/salute.js) ---------- */
  const fwd = $('.fwd');
  if (fwd && window.GoldShow) {
    const root = document.documentElement, hero = $('.hero');
    const wide = matchMedia('(min-width: 601px)'), still = matchMedia('(prefers-reduced-motion: reduce)');
    let show = null, io = null, heroEnd = 0, ticking = false;
    const exclude = () => {                                   // текст и логотип первого экрана — звёзды за ними приглушены
      const b = fwd.getBoundingClientRect();
      return $$('.hero__text, .hero__logo').filter(el => el.offsetParent).map(el => { const r = el.getBoundingClientRect(); return [r.left - b.left - 16, r.top - b.top - 12, r.right - b.left + 16, r.bottom - b.top + 12]; });
    };
    const measure = () => { heroEnd = hero.getBoundingClientRect().bottom + scrollY; };
    const onScroll = () => { if (ticking) return; ticking = true; requestAnimationFrame(() => {
      ticking = false;
      const hh = hdrEl ? hdrEl.offsetHeight : 0;
      root.classList.toggle('salute-top', scrollY < 1);              // прозрачная шапка — только в самом верху страницы
    }); };
    function start() {
      if (show) return;
      root.classList.add('has-salute');
      measure();
      show = new GoldShow(fwd, { getExclude: exclude });
      // салют идёт, пока первый экран виден; по мере ухода с экрана — затихает
      io = new IntersectionObserver(es => { const r = es[0].intersectionRatio; show.setIntensity(es[0].isIntersecting ? Math.min(1, r * 1.6) : 0); }, { threshold: [0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1] });
      io.observe(hero);
      addEventListener('scroll', onScroll, { passive: true }); onScroll();
    }
    function stop() {
      if (!show) return;
      io.disconnect(); show.destroy(); show = null;
      removeEventListener('scroll', onScroll);
      root.classList.remove('has-salute', 'salute-top');
    }
    const sync = () => (wide.matches && !still.matches ? start() : stop());
    let rw = innerWidth;
    addEventListener('resize', () => { if (show && Math.abs(innerWidth - rw) > 1) { rw = innerWidth; measure(); show.resize(); onScroll(); } });
    addEventListener('load', () => { if (show) { measure(); show.resize(); } });
    (wide.addEventListener ? wide.addEventListener('change', sync) : wide.addListener(sync));
    sync();
  }

  /* ---------- мобильное меню ---------- */
  const menu = $('#menu');
  const burger = $('.burger');
  if (menu && burger) {
    const open = () => { menu.hidden = false; burger.setAttribute('aria-expanded', 'true'); document.body.style.overflow = 'hidden'; $('.menu__close', menu).focus(); };
    const close = () => { menu.hidden = true; burger.setAttribute('aria-expanded', 'false'); document.body.style.overflow = ''; };
    burger.addEventListener('click', open);
    $('.menu__close', menu).addEventListener('click', close);
    $$('a', menu).forEach(a => a.addEventListener('click', close));
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) close(); });
  }

  /* ---------- летопись: вкладки + стрелки ---------- */
  const tabs = $$('#chronicle .tab');
  const chapters = $$('#chronicle .chapter-wrap');
  function showChapter(i, focus) {
    if (i < 0 || i >= chapters.length) return;
    tabs.forEach((t, k) => { t.setAttribute('aria-selected', k === i ? 'true' : 'false'); t.tabIndex = k === i ? 0 : -1; });
    chapters.forEach((c, k) => { c.hidden = k !== i; });
    if (focus) tabs[i].focus();
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => showChapter(i));
    t.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight') { e.preventDefault(); showChapter(Math.min(i + 1, tabs.length - 1), true); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); showChapter(Math.max(i - 1, 0), true); }
    });
  });
  $$('#chronicle .chapter-nav button').forEach(b => b.addEventListener('click', () => {
    const cur = tabs.findIndex(t => t.getAttribute('aria-selected') === 'true');
    showChapter(cur + Number(b.dataset.dir));
    $('#chronicle .tabs').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }));

  $$('.more-link').forEach(b => b.addEventListener('click', () => {
    const t = document.getElementById(b.getAttribute('aria-controls'));
    const open = t.classList.toggle('is-clamped') === false;
    b.textContent = open ? 'Свернуть  ↑' : 'Читать далее  ↓';
    b.setAttribute('aria-expanded', String(open));
  }));

  /* ---------- фотоархив глав ---------- */
  const lb = $('#lightbox');
  if (lb) {
    let list = [], idx = 0;
    const show = () => { const t = list[idx]; $('img', lb).src = t.dataset.src; $('img', lb).alt = t.dataset.cap; $('figcaption', lb).textContent = t.dataset.cap; $('.lightbox__count', lb).textContent = (idx + 1) + ' / ' + list.length; };
    // лента главы: главное фото + фотоархив; открывается с любого из них
    $$('.chapter__media, [data-gallery]').forEach(m => {
      const items = $$('.pp--zoom, .thumb', m);
      items.forEach((t, i) => t.addEventListener('click', () => {
        list = items; idx = i; show();
        lb.classList.toggle('is-single', items.length < 2);
        if (lb.showModal) lb.showModal(); else lb.setAttribute('open', '');
      }));
    });
    // буклет Лихачёвских чтений: страницы листаются в той же ленте
    const bk = $('[data-booklet]');
    if (bk) bk.addEventListener('click', () => {
      list = $$('.booklet i'); idx = 0; show();
      lb.classList.remove('is-single');
      if (lb.showModal) lb.showModal(); else lb.setAttribute('open', '');
      list.forEach(p => { const im = new Image(); im.src = p.dataset.src; });   // подгружаем остальные страницы заранее
    });
    $$('.lightbox__nav button', lb).forEach(b => b.addEventListener('click', () => { idx = (idx + Number(b.dataset.d) + list.length) % list.length; show(); }));
    $('.lightbox__close', lb).addEventListener('click', () => lb.close());
    lb.addEventListener('click', e => { if (e.target === lb) lb.close(); });
    lb.addEventListener('keydown', e => { if (e.key === 'ArrowRight') { idx = (idx + 1) % list.length; show(); } if (e.key === 'ArrowLeft') { idx = (idx - 1 + list.length) % list.length; show(); } });
  }

  /* ---------- почётные доктора и профессора: вкладки, раскрытие, карточка ---------- */
  const ptabs = $$('.ptab');
  ptabs.forEach((t, i) => {
    const sel = () => {
      ptabs.forEach(x => { const on = x === t; x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1; document.getElementById(x.getAttribute('aria-controls')).hidden = !on; });
    };
    t.addEventListener('click', sel);
    t.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); const n = ptabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + ptabs.length) % ptabs.length]; n.click(); n.focus(); }
    });
  });
  $$('.doctors-more').forEach(moreBtn => {
    const grid = document.getElementById(moreBtn.getAttribute('aria-controls'));
    const label = moreBtn.textContent;
    moreBtn.addEventListener('click', () => {
      const open = grid.classList.toggle('is-open');
      moreBtn.textContent = open ? 'Свернуть  ↑' : label;
      moreBtn.setAttribute('aria-expanded', String(open));
      if (!open) grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  const dlg = $('#doctor-dialog');
  if (dlg) {
    $$('button.doctor').forEach(card => card.addEventListener('click', () => {
      $('img', dlg).src = card.dataset.photo;
      $('img', dlg).alt = card.dataset.name;
      // «б» в СПбГУП остаётся строчной в подписи капсом
      const yr = $('.dlg-year', dlg), txt = document.createElement('span');   // одна обёртка: подпись — flex-контейнер
      ((card.dataset.kind || 'Почётный доктор СПбГУП') + ' · ' + card.dataset.year).split('СПбГУП').forEach((part, k) => {
        if (k) { const lc = document.createElement('span'); lc.className = 'lc'; lc.textContent = 'б'; txt.append('СП', lc, 'ГУП'); }
        txt.append(part);
      });
      yr.replaceChildren(txt);
      $('.dlg-name', dlg).textContent = card.dataset.name;
      $('.reg', dlg).textContent = card.dataset.reg;
      $('.dlg-bio', dlg).textContent = card.dataset.bio;
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    }));
    $('.dialog__close', dlg).addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
  }

  /* ---------- хроника: подсветка текущей главы ---------- */
  const cnav = $$('.chron-nav a');
  if (cnav.length && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(en => {
      if (!en.isIntersecting) return;
      cnav.forEach(a => a.classList.toggle('is-active', a.getAttribute('href') === '#' + en.target.id));
      const act = cnav.find(a => a.classList.contains('is-active'));
      if (act && act.parentElement.scrollWidth > act.parentElement.clientWidth) act.parentElement.scrollTo({ left: act.offsetLeft - 20, behavior: 'smooth' });
    }), { rootMargin: '-30% 0px -60% 0px' });
    $$('.chron-ch').forEach(s => io.observe(s));
  }

  /* ---------- поздравления: PHP → письмо редактору; JSON → стена ---------- */
  (function setupCongrats() {
    const section = $('#congrats');
    if (!section) return; // остальные разделы и chronicle.html не затрагиваем

    // стена поздравлений — теперь две ленты (assets/congrats-wall.js); здесь — только отправка формы

    const form = $('#congrats-form', section), status = $('.form__status', form);
    const submit = $('button[type="submit"]', form);
    const field = name => form.elements.namedItem(name);
    const fieldNames = ['name', 'email', 'who', 'text', 'consent'];
    let sending = false;
    function setError(input, message) {
      const box = input.closest('.field'), error = $('.field__err', box);
      error.textContent = message; error.hidden = !message;
      if (message) { box.dataset.error = ''; input.setAttribute('aria-invalid', 'true'); }
      else { delete box.dataset.error; input.removeAttribute('aria-invalid'); }
    }
    function showStatus(message, kind) {
      status.textContent = message; status.dataset.kind = kind; status.hidden = false;
    }
    fieldNames.forEach(name => field(name).addEventListener('input', () => {
      setError(field(name), '');
      if (!sending) status.hidden = true;
    }));
    submit.disabled = false;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (sending) return;
      const payload = {
        name: field('name').value.trim(), email: field('email').value.trim(),
        who: field('who').value.trim(), text: field('text').value.replace(/\r\n?/g, '\n').trim(),
        consent: field('consent').checked, website: field('website').value
      };
      const errors = {};
      if (!payload.name) errors.name = 'Укажите, как к вам обращаться';
      else if (payload.name.length > 120) errors.name = 'Не более 120 символов';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) || payload.email.length > 254 || field('email').validity.typeMismatch) errors.email = 'Укажите корректный e-mail, например name@mail.ru';
      if (payload.who.length > 200) errors.who = 'Не более 200 символов';
      if (!payload.text) errors.text = 'Напишите несколько слов Университету';
      else if (payload.text.length > 10000) errors.text = 'Не более 10 000 символов';
      if (!payload.consent) errors.consent = 'Подтвердите согласие на публикацию';
      fieldNames.forEach(name => setError(field(name), errors[name] || ''));
      status.hidden = true;
      const invalid = fieldNames.find(name => errors[name]);
      if (invalid) { field(invalid).focus(); return; }

      sending = true; form.setAttribute('aria-busy', 'true');
      const controls = $$('input, textarea, button[type="submit"]', form);
      controls.forEach(input => { input.disabled = true; });
      submit.textContent = 'Отправляем…';
      const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 20000);
      try {
        const response = await fetch(form.action, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify(payload), signal: controller.signal
        });
        const data = await response.json();
        if (!data || typeof data !== 'object') throw new Error('Invalid server response');
        if (!response.ok || data.ok !== true) {
          if (data.errors && typeof data.errors === 'object') {
            fieldNames.forEach(name => { if (typeof data.errors[name] === 'string') setError(field(name), data.errors[name]); });
          }
          showStatus(typeof data.message === 'string' ? data.message : 'Не удалось отправить поздравление. Текст сохранён в форме. Попробуйте позже или напишите на указанную почту.', 'error');
        } else {
          form.reset();
          showStatus('Спасибо! Поздравление передано на отправку. После проверки оно может появиться на стене юбилея.', 'success');
        }
      } catch (err) {
        showStatus(err.name === 'AbortError'
          ? 'Сервер не ответил вовремя. Не удалось подтвердить отправку. Текст сохранён в форме; попробуйте позже или напишите на указанную почту.'
          : 'Не удалось подтвердить отправку. Текст сохранён в форме. Проверьте соединение, попробуйте позже или напишите на указанную почту.', 'error');
      } finally {
        clearTimeout(timeout); sending = false; form.removeAttribute('aria-busy');
        controls.forEach(input => { input.disabled = false; });
        submit.textContent = 'Отправить поздравление';
        const firstInvalid = $('[aria-invalid="true"]', form);
        if (firstInvalid) firstInvalid.focus();
      }
    });
  })();
})();
