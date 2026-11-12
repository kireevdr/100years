/* Гимназия «Ольгино»: фотослайдер — стрелки, миниатюры, свайп, клавиши ← →, неспешное автолистание.
   Нажатие на фото открывает его во весь экран (общий просмотрщик #lightbox из main.js). */
(function () {
  const root = document.querySelector('.olg-sl');
  if (!root) return;
  const $ = (s, r = root) => r.querySelector(s), $$ = (s, r = root) => Array.from(r.querySelectorAll(s));
  const track = $('.olg-sl__track'), slides = $$('.olg-sl__slide'), thumbs = $$('.olg-sl__thumb');
  const cap = $('.olg-sl__cap'), num = $('.olg-sl__count b'), strip = $('.olg-sl__thumbs');
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const n = slides.length; let i = 0, timer = null, hover = false, visible = false, userTouched = false;

  function go(k, fromUser) {
    i = (k + n) % n;
    track.style.transform = `translate3d(${-i * 100}%,0,0)`;
    slides.forEach((s, j) => { const on = j === i; s.setAttribute('aria-hidden', String(!on)); s.tabIndex = on ? 0 : -1;
      if (Math.abs(j - i) <= 1) { const im = s.querySelector('img'); im.loading = 'eager'; } });
    thumbs.forEach((t, j) => { t.classList.toggle('is-active', j === i); if (j === i) t.setAttribute('aria-current', 'true'); else t.removeAttribute('aria-current'); });
    cap.textContent = slides[i].dataset.cap; num.textContent = i + 1;
    const t = thumbs[i]; if (t) strip.scrollTo({ left: t.offsetLeft - (strip.clientWidth - t.offsetWidth) / 2, behavior: still.matches ? 'auto' : 'smooth' });
    if (fromUser) { userTouched = true; stop(); }
  }
  $$('.olg-sl__arrow').forEach(b => b.addEventListener('click', () => go(i + Number(b.dataset.d), true)));
  thumbs.forEach(t => t.addEventListener('click', () => go(Number(t.dataset.i), true)));
  root.addEventListener('keydown', e => { if (e.target.closest('.olg-sl__thumbs, .olg-sl__view')) { if (e.key === 'ArrowRight') { go(i + 1, true); e.preventDefault(); } if (e.key === 'ArrowLeft') { go(i - 1, true); e.preventDefault(); } } });

  // свайп пальцем; после свайпа фото не открывается во весь экран
  const view = $('.olg-sl__view'); let x0 = null, y0 = 0, swiped = false;
  view.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; swiped = false; }, { passive: true });
  view.addEventListener('touchend', e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) { swiped = true; go(i + (dx < 0 ? 1 : -1), true); } x0 = null; }, { passive: true });
  view.addEventListener('click', e => { if (swiped) { e.stopPropagation(); e.preventDefault(); swiped = false; } }, true);

  // автолистание раз в 5 с: пока блок на экране, мышь не над слайдером и посетитель сам ещё не листал
  function stop() { clearInterval(timer); timer = null; }
  function start() { if (timer || still.matches || userTouched) return; timer = setInterval(() => { if (visible && !hover && !document.hidden) go(i + 1); }, 5000); }
  root.addEventListener('mouseenter', () => { hover = true; }); root.addEventListener('mouseleave', () => { hover = false; });
  root.addEventListener('focusin', () => { hover = true; }); root.addEventListener('focusout', () => { hover = false; });
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { threshold: .4 }).observe(root);
  // если фото открыли во весь экран — автолистание останавливается
  slides.forEach(s => s.addEventListener('click', () => { userTouched = true; stop(); }));
  go(0); start();
})();
