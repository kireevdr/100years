/* Золотая линия под шапкой: появляется, когда шапка уходит с бордового первого экрана
   (главная — .hero, внутренние страницы — .chron-hero). Пока шапка над первым экраном
   того же цвета, линии нет. */
(function () {
    'use strict';
    var hdr = document.querySelector('.site-header');
    if (!hdr) return;
    var hero = document.querySelector('.hero, .chron-hero');
    var raf = 0;
    function update() {
        raf = 0;
        var past = !hero || hero.getBoundingClientRect().bottom <= hdr.getBoundingClientRect().bottom + 1;
        hdr.classList.toggle('has-line', past);
    }
    function schedule() { if (!raf) raf = requestAnimationFrame(update); }
    addEventListener('scroll', schedule, { passive: true });
    addEventListener('resize', schedule);
    update();
})();
