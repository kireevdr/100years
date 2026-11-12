/* СМИ о столетии: data/press.json → карточки в #press-list.
   Одинаковая карточка для любой публикации: издание, дата, заголовок, ссылка.
   Поля записи: source, date (ГГГГ-ММ-ДД), title, url, lead?, print? (PDF полосы). Пометок над карточками нет.
   Порядок — хронологический: от новых публикаций к более ранним.
   Главная: на компьютере — «страницы» по 8 карточек (2 ряда × 4), стрелки листают страницу целиком;
            на телефоне — лента по одной карточке, листается пальцем; кнопка «Читать все статьи» → press.html.
   press.html (класс .press--all): все публикации сеткой. */
(function () {
    'use strict';
    const list = document.getElementById('press-list');
    if (!list) return;
    const nav = document.getElementById('press-nav');
    const isAll = list.classList.contains('press--all');
    const PER_PAGE = 8;
    const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

    const fmtDate = d => { const [y, m, dd] = d.split('-').map(Number); return dd + ' ' + MONTHS[m - 1] + ' ' + y; };
    const host = u => { try { return new URL(u).hostname.replace(/^(www|m)\./, ''); } catch (e) { return ''; } };
    const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };

    function card(it) {
        const a = el('a', 'press-card');
        a.href = it.url; a.target = '_blank'; a.rel = 'noopener';
        a.setAttribute('aria-label', it.source + ': ' + it.title + ' (откроется на сайте издания)');
        const top = el('div', 'press-card__top');
        top.append(el('span', 'press-card__src', it.source), el('time', 'press-card__date', fmtDate(it.date)));
        top.lastChild.dateTime = it.date;
        const title = el('p', 'press-card__title', it.title);
        if (it.lead) title.append(el('span', 'press-card__lead', it.lead));
        const foot = el('div', 'press-card__foot');
        foot.append(el('span', null, host(it.url)));
        if (it.print) {
            const pdf = el('span', 'press-card__pdf', 'Полоса PDF');
            pdf.setAttribute('role', 'link'); pdf.tabIndex = 0;
            const open = e => { e.preventDefault(); e.stopPropagation(); window.open(it.print, '_blank', 'noopener'); };
            pdf.addEventListener('click', open);
            pdf.addEventListener('keydown', e => { if (e.key === 'Enter') open(e); });
            foot.append(pdf);
        } else {
            foot.append(el('span', 'press-card__more', 'Читать →'));
        }
        a.append(top, title, foot);
        return a;
    }

    /* стрелки: листаем на ширину видимой области (на компьютере это ровно одна страница из 8 карточек) */
    function wireNav() {
        if (!nav) return;
        const bar = nav.querySelector('.press-nav__bar i');
        const count = nav.querySelector('.press-nav__count');
        const [prev, next] = nav.querySelectorAll('button');
        const update = () => {
            const view = list.clientWidth || 1;
            const max = list.scrollWidth - view;
            nav.hidden = max <= 2;
            const pages = Math.max(1, Math.round(list.scrollWidth / view));
            const cur = Math.min(pages, Math.round(list.scrollLeft / view) + 1);
            count.innerHTML = '<b>' + cur + '</b> / ' + pages;
            if (bar) { const w = 100 / pages; bar.style.width = w + '%'; bar.style.left = (max > 0 ? (list.scrollLeft / max) * (100 - w) : 0) + '%'; }
            prev.disabled = list.scrollLeft <= 2;
            next.disabled = list.scrollLeft >= max - 2;
        };
        const go = d => list.scrollBy({ left: d * list.clientWidth, behavior: 'smooth' });
        prev.addEventListener('click', () => go(-1));
        next.addEventListener('click', () => go(1));
        list.addEventListener('keydown', e => { if (e.key === 'ArrowRight') { e.preventDefault(); go(1); } if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); } });
        let raf = 0;
        list.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); }, { passive: true });
        addEventListener('resize', update);
        update();
    }

    /* перетаскивание мышью на компьютере (без перехода по ссылке после перетаскивания) */
    function wireDrag() {
        let x0 = 0, s0 = 0, down = false, moved = false;
        list.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' || e.button !== 0) return; down = true; moved = false; x0 = e.clientX; s0 = list.scrollLeft; });
        addEventListener('pointermove', e => {
            if (!down) return;
            const dx = e.clientX - x0;
            if (Math.abs(dx) > 5 && !moved) { moved = true; list.classList.add('is-drag'); }
            if (moved) list.scrollLeft = s0 - dx;
        });
        addEventListener('pointerup', () => {
            if (!down) return; down = false;
            if (moved) {
                list.classList.remove('is-drag');
                const w = list.clientWidth, d = list.scrollLeft - s0;
                const target = Math.abs(d) > w * 0.15 ? s0 + Math.sign(d) * w : s0;
                list.scrollTo({ left: Math.round(target / w) * w, behavior: 'smooth' });
            }
        });
        list.addEventListener('click', e => { if (moved) { e.preventDefault(); moved = false; } }, true);
        list.addEventListener('dragstart', e => e.preventDefault());
    }

    fetch(list.dataset.source || 'data/press.json', { cache: 'no-store' })
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(data => {
            // хронологический порядок: сначала самые новые публикации
            const items = (data.items || []).slice().sort((a, b) => b.date.localeCompare(a.date));
            if (isAll) { list.replaceChildren(...items.map(card)); return; }
            const pages = [];
            for (let i = 0; i < items.length; i += PER_PAGE) {
                const p = el('div', 'press-page');
                items.slice(i, i + PER_PAGE).forEach(it => p.append(card(it)));
                pages.push(p);
            }
            list.replaceChildren(...pages);
            wireNav();
            wireDrag();
        })
        .catch(err => { console.error('Press load failed:', err); list.closest('section').hidden = true; });
})();
