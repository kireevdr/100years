/* Профессорско-преподавательский состав: data/staff.json.
   1) Главная (#staff-app): вкладки групп (сейчас — «Заведующие кафедрами») и карточки со ссылкой staff.html#<slug>.
   2) staff.html (#staff-page): страница человека по якорю — шапка с портретом, цифры, хронология,
      преподавание и наука, награды, публикации, «Вне кафедры». Пустые поля не выводятся. */
(function () {
    'use strict';
    /* типографика: инициалы не отрываются друг от друга и от фамилии (З. Я. Корогодский) */
    const typo = t => String(t).replace(/(^|[\s(«])([А-ЯЁA-Z]\.)\s(?=[А-ЯЁA-Z])/g, '$1$2\u00a0').replace(/([А-ЯЁA-Z]\.)\s(?=[А-ЯЁA-Z])/g, '$1\u00a0').replace(/(^|\s)(имени|им\.|№)\s/g, '$1$2\u00a0');
    const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = typo(text); return n; };
    const listApp = document.getElementById('staff-app');
    const page = document.getElementById('staff-page');
    if (!listApp && !page) return;
    const src = (listApp || page).dataset.source || 'data/staff.json';

    /* ---------- главная: вкладки + карточки ---------- */
    function renderList(d) {
        const groups = (d.groups || []).filter(g => !g.hidden);   /* hidden — страницы есть, но в блоке не показываются (например, почётные профессора) */
        const tabs = el('div', 'people-tabs staff-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Преподаватели');
        const panels = groups.map((g, gi) => {
            const t = el('button', 'stab'); t.type = 'button'; t.setAttribute('role', 'tab');
            t.id = 'stab-' + g.id; t.setAttribute('aria-controls', 'spanel-' + g.id);
            t.setAttribute('aria-selected', gi ? 'false' : 'true'); if (gi) t.tabIndex = -1;
            t.append(g.title + ' ', el('span', null, String(g.items.length)));
            tabs.append(t);
            const p = el('div', 'staff-panel'); p.id = 'spanel-' + g.id; p.setAttribute('role', 'tabpanel'); p.setAttribute('aria-labelledby', t.id); p.hidden = !!gi;
            const grid = el('div', 'staff-grid');
            g.items.forEach(s => {
                const a = el('a', 'staff-card'); a.href = (listApp.dataset.page || 'staff.html') + '#' + s.slug;
                const ph = el('span', 'portrait'); const img = el('img'); img.src = s.photo; img.alt = s.short || s.name; img.loading = 'lazy'; img.width = 360; img.height = 450; ph.append(img);
                const body = el('span', 'staff-card__body');
                body.append(el('b', null, s.short || s.name));
                if (s.dept) body.append(el('span', 'staff-card__dept', s.dept));
                if (s.degree) body.append(el('span', 'staff-card__deg', s.degree));
                body.append(el('span', 'staff-card__more', 'Биография →'));
                a.append(ph, body); grid.append(a);
            });
            if (g.more !== false) { const ph = el('div', 'staff-card staff-card--soon'); const box = el('span', 'staff-soon'); box.append(el('span', null, 'Информация будет пополняться')); ph.append(box); grid.append(ph); }
            p.append(grid);
            t.addEventListener('click', () => {
                tabs.querySelectorAll('.stab').forEach(x => { const on = x === t; x.setAttribute('aria-selected', String(on)); x.tabIndex = on ? 0 : -1; });
                listApp.querySelectorAll('.staff-panel').forEach(x => { x.hidden = x !== p; });
            });
            return p;
        });
        listApp.replaceChildren(tabs, ...panels);
    }

    /* ---------- страница человека ---------- */
    function section(id, title) {
        const s = el('section', 'sp-sec'); s.id = id; s.dataset.title = title;
        const h = el('div', 'sp-sec__head'); h.append(el('h2', 'h3', title));
        s.append(h); return s;
    }
    function renderPage(d) {
        const all = (d.groups || []).flatMap(g => g.items.map(s => Object.assign({ group: g.title }, s)));
        const slug = decodeURIComponent(location.hash.slice(1)) || (all[0] && all[0].slug);
        const s = all.find(x => x.slug === slug) || all[0];
        if (!s) return;
        document.title = (s.short || s.name) + ' · 100 лет СПбГУП';

        /* шапка */
        const hero = document.getElementById('sp-hero');
        hero.querySelector('.sp-hero__group').textContent = s.faculty || '';
        hero.querySelector('.h1').textContent = s.name;
        hero.querySelector('.sp-hero__pos').textContent = typo(s.position || '');
        const tags = hero.querySelector('.sp-tags'); tags.replaceChildren(...(s.tags || []).map(t => el('li', null, t)));
        const img = hero.querySelector('.sp-hero__photo img');
        /* при переходе к другому человеку старый портрет сразу убираем, новый показываем после загрузки */
        const nsrc = s.photoFull || s.photo;
        if (img.getAttribute('src') !== nsrc) { img.style.opacity = '0'; img.onload = () => { img.style.opacity = ''; }; img.onerror = () => { img.style.opacity = ''; }; img.removeAttribute('src'); img.src = nsrc; }
        img.alt = s.short || s.name;

        const main = document.getElementById('sp-main');
        const toc = document.getElementById('sp-toc');
        const out = [];

        if (s.facts && s.facts.length) {
            const f = el('div', 'sp-facts');
            s.facts.forEach(x => { const c = el('div', 'sp-fact'); c.append(el('span', 'num', x.num), el('p', null, x.txt)); f.append(c); });
            out.push(f);
        }
        if ((s.timeline && s.timeline.length) || s.lead) {
            const sec = section('bio', 'Биография');
            if (s.lead) sec.append(el('p', 'sp-lead', s.lead));
            const ol = el('ol', 'sp-time');
            (s.timeline || []).forEach(t => { const li = el('li', t.accent ? 'is-accent' : null); li.append(el('b', null, t.year), el('p', null, t.text)); ol.append(li); });
            sec.append(ol); out.push(sec);
        }
        const yearList = items => { const ul = el('ul', 'sp-ylist'); items.forEach(x => { const li = el('li'); li.append(el('b', null, x.year || ''), el('p', null, x.text)); ul.append(li); }); return ul; };
        if ((s.courses && s.courses.length) || s.science || (s.projects && s.projects.length)) {
            const sec = section('science', 'Научно-педагогическая деятельность');
            const grid = el('div', 'sp-two');
            if (s.projects && s.projects.length) { const b = el('div', 'sp-span'); b.append(el('span', 'br-lbl', s.projectsTitle || 'Проекты')); b.append(yearList(s.projects)); grid.append(b); }
            if (s.courses && s.courses.length) { const b = el('div'); b.append(el('span', 'br-lbl', 'Читает дисциплины')); const ul = el('ul', 'sp-list'); s.courses.forEach(c => ul.append(el('li', null, c))); b.append(ul); grid.append(b); }
            if (s.interests && s.interests.length) { const b = el('div', (s.courses && s.courses.length) ? null : 'sp-span'); b.append(el('span', 'br-lbl', 'Научные интересы')); const ul = el('ul', 'br-chips'); s.interests.forEach(c => ul.append(el('li', null, c))); b.append(ul); if (s.science) b.append(el('p', 'sp-note', s.science)); grid.append(b); }
            else if (s.science) { const b = el('div', 'sp-span'); b.append(el('p', 'sp-note sp-note--plain', s.science)); grid.append(b); }
            sec.append(grid); out.push(sec);
        }
        if (s.intl && s.intl.length) {
            const sec = section('intl', s.intlTitle || 'Международный опыт');
            const grid = el('div', 'sp-two');
            s.intl.forEach(g => {
                const b = el('div', g.wide ? 'sp-span' : null); b.append(el('span', 'br-lbl', g.title));
                if (g.items.some(x => x.year)) b.append(yearList(g.items));
                else { const ul = el('ul', 'sp-list'); g.items.forEach(x => ul.append(el('li', null, x.text))); b.append(ul); }
                grid.append(b);
            });
            sec.append(grid); out.push(sec);
        }
        if (s.awards && s.awards.length) {
            const sec = section('awards', 'Награды');
            const ul = el('ul', 'sp-awards');
            s.awards.slice().sort((a, b) => (!a.year - !b.year) || (a.year || '').localeCompare(b.year || '')).forEach(a => { const li = el('li', a.state ? 'is-state' : null); li.append(el('span', 'sp-awards__y', a.year), el('p', null, a.text)); ul.append(li); });
            sec.append(ul);
            if (s.awardsNote) sec.append(el('p', 'sp-note', s.awardsNote));
            out.push(sec);
        }
        if (s.publications && s.publications.length) {
            const sec = section('pubs', 'Основные публикации');
            const ol = el('ol', 'sp-pubs');
            s.publications.forEach(p => {
                const li = el('li', p.mono ? 'is-mono' : null);
                li.append(el('span', 'sp-pubs__y', p.year));
                const t = el('div'); if (p.mono) t.append(el('span', 'sp-pubs__tag', p.tag || 'Монография')); t.append(el('p', null, p.text)); if (p.note) t.append(el('p', 'sp-pubs__note', p.note));
                li.append(t); ol.append(li);
            });
            sec.append(ol);
            if (s.publicationsFull && s.publicationsFull.length) {
                const total = s.publicationsFull.reduce((n, g) => n + g.items.length, 0);
                const det = el('details', 'sp-full');
                det.append(el('summary', null, 'Полный список научных трудов (' + total + ')'));
                s.publicationsFull.forEach(g => {
                    det.append(el('h3', 'sp-full__h', g.title));
                    const ol = el('ol', 'sp-full__list'); ol.start = g.start || 1;
                    g.items.forEach(x => { const li = el('li'); li.append(el('span', 'sp-pubs__y', x.year), el('p', null, x.text)); ol.append(li); });
                    det.append(ol);
                });
                sec.append(det);
            }
            if (s.pubsUrl || s.site) {
                const bt = el('div', 'btns sp-btns');
                if (s.pubsUrl) { const a = el('a', 'btn btn--outline', 'Все публикации в eLibrary →'); a.href = s.pubsUrl; a.target = '_blank'; a.rel = 'noopener'; bt.append(a); }
                if (s.site) { const a = el('a', 'btn btn--outline', 'Личный сайт →'); a.href = s.site; a.target = '_blank'; a.rel = 'noopener'; bt.append(a); }
                sec.append(bt);
            }
            out.push(sec);
        }
        if (s.personal) {
            const sec = section('personal', 'Личное');
            const g = el('div', 'sp-personal');
            const card = (lbl, body) => { const c = el('div', 'sp-pcard'); c.append(el('span', 'br-lbl', lbl)); c.append(body); g.append(c); };
            if (s.personal.books) card(s.personal.booksLabel || 'Любимые книги', el('p', null, s.personal.books));
            if (s.personal.films) { const ul = el('ul', 'sp-films'); s.personal.films.forEach(f => ul.append(el('li', null, f))); card(s.personal.filmsLabel || 'Любимые фильмы', ul); }
            if (s.personal.hobby) card(s.personal.hobbyLabel || 'Хобби', el('p', null, s.personal.hobby));
            (s.personal.items || []).forEach(x => {
                const body = el('div', 'sp-pcard__b');
                if (x.num) { const n = el('div', 'sp-pcard__num'); n.append(el('span', 'num', x.num), el('span', null, x.numTxt || '')); body.append(n); }
                body.append(el('p', null, x.text)); card(x.label, body);
            });
            if (s.personal.items && s.personal.items.length) g.classList.add('sp-personal--items');
            sec.append(g); out.push(sec);
        }
        main.replaceChildren(...out);

        /* оглавление: подсветка по положению прокрутки; при клике — сразу нужный пункт */
        const secs = [...main.querySelectorAll('.sp-sec')];
        let lock = 0;
        const mark = id => toc.querySelectorAll('a').forEach(a => a.classList.toggle('is-on', a.dataset.to === id));
        toc.replaceChildren(...secs.map(x => {
            const a = el('a', null, x.dataset.title); a.href = '#' + s.slug; a.dataset.to = x.id;
            a.addEventListener('click', e => {
                e.preventDefault(); mark(x.id); lock = Date.now() + 1200;
                x.scrollIntoView({ behavior: 'smooth' });
                if (a.scrollIntoView && getComputedStyle(toc).display === 'flex') toc.scrollTo({ left: a.offsetLeft - 16, behavior: 'smooth' });
            });
            return a;
        }));
        const spy = () => {
            if (Date.now() < lock) return;
            const line = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hdr-h')) || 92) + 140;
            let cur = secs[0];
            secs.forEach(x => { if (x.getBoundingClientRect().top <= line) cur = x; });
            if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) cur = secs[secs.length - 1];
            if (cur) mark(cur.id);
        };
        if (window.__spSpy) removeEventListener('scroll', window.__spSpy);
        window.__spSpy = spy;
        addEventListener('scroll', spy, { passive: true });
        spy();

        /* другие заведующие */
        /* внизу — только люди из той же группы: заведующие → заведующие, профессора → профессора, почётные профессора → почётные профессора */
        const grp = (d.groups || []).find(g => g.items.some(x => x.slug === s.slug)) || { items: [] };
        const others = grp.items.filter(x => x.slug !== s.slug);
        const more = document.getElementById('sp-others');
        if (more) { const cap = more.querySelector('.cap'); if (cap) cap.textContent = grp.othersTitle || ('Другие: ' + (grp.title || '').toLowerCase()); }
        if (more) {
            more.hidden = !others.length;
            if (!others.length) {}
            else { const grid = more.querySelector('.staff-grid'); grid.replaceChildren(...others.map(o => { const a = el('a', 'staff-card'); a.href = '#' + o.slug; const ph = el('span', 'portrait'); const im = el('img'); im.src = o.photo; im.alt = o.short || o.name; ph.append(im); const b = el('span', 'staff-card__body'); b.append(el('b', null, o.short || o.name), el('span', 'staff-card__dept', o.dept || '')); a.append(ph, b); return a; })); }
        }
    }

    fetch(src, { cache: 'no-store' })
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(d => {
            if (listApp) renderList(d);
            if (page) { renderPage(d); addEventListener('hashchange', () => { renderPage(d); scrollTo(0, 0); }); }
        })
        .catch(err => { console.error('Staff load failed:', err); if (listApp) listApp.hidden = true; });
})();
