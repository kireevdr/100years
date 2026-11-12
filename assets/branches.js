/* Филиалы: data/branches.json → вкладки городов + карточка филиала.
   Поля записи (все, кроме city/name/year, необязательны — пустые не выводятся):
   city, name, year, site, photo, photoAlt, photoPos (точка кадрирования, напр. "0% 50%"), start, graduates, programs[], forms[],
   location, programsUrl, partners[] (строка или {name, field}), head{name, role, quote, photo},
   alumniUrl (кнопка «Интервью выпускников»), archive[{src, cap, year}], demo (true — пример заполнения).
   Слайдер открывается на первом заполненном филиале (без demo). */
(function () {
    'use strict';
    const app = document.getElementById('branches-app');
    if (!app) return;
    const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
    const cityIn = { 'Москва': 'Москве', 'Киров': 'Кирове', 'Красноярск': 'Красноярске', 'Самара': 'Самаре', 'Алматы': 'Алматы' };
    let dialog = null;

    function chips(arr, cls) { const ul = el('ul', cls); arr.forEach(t => ul.append(el('li', null, t))); return ul; }
    function block(label, node) { const d = el('div'); d.append(el('span', 'br-lbl', label), node); return d; }

    /* Архив: сетка превью; клик — просмотр в полный размер со стрелками */
    // let dialog = null;
    // Состояние текущего открытого архива — на уровне модуля
    let curArchive = { list: [], cur: 0, capOf: null };
    
    function openArchive(b) {
        if (!dialog) {
            dialog = el('dialog', 'br-archive');
            dialog.innerHTML = '<div class="br-archive__head"><span class="cap"></span><button type="button" class="br-archive__x" aria-label="Закрыть">✕</button></div>'
                + '<div class="br-archive__grid"></div>'
                + '<div class="br-archive__view" hidden><button type="button" class="br-archive__back">← Все материалы</button>'
                + '<figure><img alt=""><figcaption></figcaption></figure>'
                + '<div class="br-archive__nav"><button type="button" data-d="-1" aria-label="Предыдущий материал">←</button><span></span><button type="button" data-d="1" aria-label="Следующий материал">→</button></div></div>';
            dialog.querySelector('.br-archive__x').addEventListener('click', () => dialog.close());
            dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
            dialog.querySelector('.br-archive__back').addEventListener('click', () => showGrid());
            // ВАЖНО: обработчики теперь вызывают showItem через текущее состояние
            dialog.querySelectorAll('.br-archive__nav button').forEach(btn =>
                btn.addEventListener('click', () => showItem(curArchive.cur + Number(btn.dataset.d)))
            );
            dialog.addEventListener('keydown', e => {
                if (dialog.querySelector('.br-archive__view').hidden) return;
                if (e.key === 'ArrowRight') showItem(curArchive.cur + 1);
                if (e.key === 'ArrowLeft') showItem(curArchive.cur - 1);
            });
            document.body.append(dialog);
        }
    
        // Обновляем состояние при КАЖДОМ открытии
        const list = b.archive;
        const capOf = a => (a.year ? a.year + ' · ' : '') + (a.cap || '');
        curArchive = { list, cur: 0, capOf };
    
        const grid = dialog.querySelector('.br-archive__grid');
        const view = dialog.querySelector('.br-archive__view');
    
        function showGrid() { view.hidden = true; grid.hidden = false; }
    
        function showItem(k) {
            const list = curArchive.list;
            curArchive.cur = (k + list.length) % list.length;
            const a = list[curArchive.cur];
            const img = view.querySelector('img'); img.src = a.src; img.alt = a.cap || '';
            view.querySelector('figcaption').textContent = curArchive.capOf(a);
            view.querySelector('.br-archive__nav span').textContent = (curArchive.cur + 1) + ' / ' + list.length;
            grid.hidden = true; view.hidden = false;
        }
    
        dialog.querySelector('.cap').textContent = 'Фотоархив · ' + b.name;
        grid.replaceChildren(...list.map((a, k) => {
            const f = el('button', 'br-archive__item'); f.type = 'button';
            const img = el('img'); img.src = a.src; img.alt = a.cap || ''; img.loading = 'lazy';
            f.append(img, el('span', null, capOf(a)));
            f.addEventListener('click', () => showItem(k));
            return f;
        }));
        showGrid();
        dialog.showModal();
    }

    function person(cls, label, p) {
        const box = el('figure', 'br-person ' + cls);
        if (p.photo) { const ph = el('img'); ph.src = p.photo; ph.alt = p.name || ''; ph.loading = 'lazy'; box.append(ph); }
        const body = el('figcaption');
        body.append(el('span', 'br-lbl', label));
        if (p.quote) body.append(el('p', 'br-person__quote', '«' + p.quote.replace(/[.!]?$/, m => m || '.') + '»'));
        const who = el('p', 'br-person__who'); who.append(el('b', null, p.name || ''));
        if (p.role) who.append(el('span', null, p.role));
        body.append(who);
        box.append(body);
        return box;
    }

    function card(b, i) {
        const art = el('article', 'br-card');
        art.id = 'branch-' + i; art.setAttribute('role', 'tabpanel'); art.setAttribute('aria-labelledby', 'brtab-' + i);
        if (i) art.hidden = true;

        /* филиал без анкеты — заглушка «Информация будет пополняться» */
        if (b.pending || b.demo) {
            art.classList.add('br-card--pending');
            const ph0 = el('div', 'br-photo br-photo--pending');
            const yr0 = el('div', 'br-photo__year'); yr0.append(el('i', null, 'Основан'), el('b', null, String(b.year))); ph0.append(yr0);
            const info0 = el('div', 'br-info');
            const h0 = el('div'); h0.append(el('h3', 'h3', b.name), el('p', 'br-start', 'Информация о филиале будет пополняться. Скоро здесь появятся история филиала, направления подготовки, базы практики и фотоархив.'));
            info0.append(h0);
            if (b.site) { const btns0 = el('div', 'btns'); const s0 = el('a', 'btn btn--outline', 'Сайт филиала →'); s0.href = b.site; s0.target = '_blank'; s0.rel = 'noopener'; btns0.append(s0); info0.append(btns0); }
            art.append(ph0, info0);
            return art;
        }

        const ph = el('div', 'br-photo');
        if (b.photo) { const img = el('img'); img.src = b.photo; img.alt = b.photoAlt || b.name; img.loading = 'lazy'; if (b.photoPos) img.style.objectPosition = b.photoPos; ph.append(img); }
        else ph.append(el('span', 'br-photo__ph', 'Фото студентов или здания филиала'));
        const yr = el('div', 'br-photo__year'); yr.append(el('i', null, 'Основан'), el('b', null, String(b.year))); ph.append(yr);
        if (b.demo) ph.append(el('span', 'br-demo', 'Пример заполнения'));

        const info = el('div', 'br-info');
        const head = el('div'); head.append(el('h3', 'h3', b.name));
        if (b.start) head.append(el('p', 'br-start', b.start));
        if (b.location) head.append(el('p', 'br-loc', b.location));
        info.append(head);
        /* Подробности — в раскрывающейся части (аккордеон) */
        const more = el('div', 'br-more'); more.id = 'br-more-' + i; more.hidden = true;
        /* люди филиала — отдельной полосой во всю ширину карточки, крупные портреты */
        const people = el('div', 'br-people'); people.hidden = true;
        const add = n => more.append(n);
        if (b.graduates) { const big = el('div', 'br-big'); big.append(el('span', 'num', b.graduates)); const p = el('p'); p.textContent = 'выпускников'; big.append(p); add(big); }
        if (b.programs && b.programs.length) {
            const d = block('Направления подготовки', chips(b.programs, 'br-chips'));
            if (b.programsUrl) { const a = el('a', 'br-link', 'Все направления и сроки обучения →'); a.href = b.programsUrl; a.target = '_blank'; a.rel = 'noopener'; d.append(a); }
            add(d);
        }
        if (b.forms && b.forms.length) add(block('Формы обучения', chips(b.forms, 'br-forms')));
        if (b.partners && b.partners.length) {
            const ul = el('ul', 'br-partners');
            b.partners.forEach(pt => {
                const li = el('li');
                if (typeof pt === 'string') li.append(el('b', null, pt));
                else { if (pt.logo) { const im = el('img', 'br-partners__logo'); im.src = pt.logo; im.alt = ''; im.loading = 'lazy'; li.append(im); li.classList.add('has-logo'); } li.append(el('b', null, pt.name)); if (pt.field) li.append(el('span', null, pt.field)); }
                ul.append(li);
            });
            add(block('Базы практики', ul));
        }
        if (b.head && b.head.quote) {
            if (b.head.photo) people.append(person('br-person--head', 'Поздравление руководителя', b.head));
            else {
                const q = el('blockquote', 'br-head'); q.append(el('p', null, '«' + b.head.quote + '»'));
                const f = el('footer'); f.append(el('b', null, b.head.name || ''), document.createTextNode(b.head.role ? ', ' + b.head.role : '')); q.append(f); add(q);
            }
        }
        const spb = el('p', 'br-spb'); spb.innerHTML = '<b>Последний курс — в Петербурге.</b> Студенты филиала завершают обучение в СПбГУП и получают диплом Санкт-Петербургского Гуманитарного университета профсоюзов.';
        add(spb);
        const toggle = el('button', 'br-toggle', 'Подробнее о филиале');
        toggle.type = 'button'; toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', more.id);
        toggle.addEventListener('click', () => {
            const open = more.hidden;
            more.hidden = !open;
            if (people.children.length) people.hidden = !open;
            toggle.setAttribute('aria-expanded', String(open));
            toggle.textContent = open ? 'Свернуть' : 'Подробнее о филиале';
            if (!open) art.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
        if (more.children.length) info.append(toggle, more);
        const btns = el('div', 'btns');
        if (b.archive && b.archive.length) { const a = el('button', 'btn btn--burgundy', 'Фотоархив филиала (' + b.archive.length + ')'); a.type = 'button'; a.addEventListener('click', () => openArchive(b)); btns.append(a); }
        if (b.alumniUrl) { const v = el('a', 'btn btn--outline', 'Интервью выпускников →'); v.href = b.alumniUrl; v.target = '_blank'; v.rel = 'noopener'; btns.append(v); }
        if (b.site) { const s = el('a', 'btn btn--outline', 'Сайт филиала →'); s.href = b.site; s.target = '_blank'; s.rel = 'noopener'; btns.append(s); }
        if (btns.children.length) info.append(btns);

        art.append(ph, info);
        if (people.children.length) { art.append(people); art.classList.add('has-people'); people.classList.toggle('is-single', people.children.length === 1); }
        return art;
    }

    function render(items) {
        items = items.slice().sort((a, b) => a.year - b.year);
        const tabs = el('div', 'br-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Филиалы');
        const cards = items.map(card);
        const count = el('span');
        const go = i => {
            i = (i + items.length) % items.length;
            tabs.querySelectorAll('.br-tab').forEach((t, k) => { t.setAttribute('aria-selected', k === i ? 'true' : 'false'); t.tabIndex = k === i ? 0 : -1; });
            cards.forEach((c, k) => { c.hidden = k !== i; });
            count.innerHTML = '<b>' + String(i + 1).padStart(2, '0') + '</b> / ' + String(items.length).padStart(2, '0');
            cur = i;
        };
        let cur = 0;
        items.forEach((b, i) => {
            const t = el('button', 'br-tab'); t.type = 'button'; t.id = 'brtab-' + i;
            t.setAttribute('role', 'tab'); t.setAttribute('aria-controls', 'branch-' + i);
            t.append(document.createTextNode(b.city), el('span', null, 'с ' + b.year + ' года'));
            t.addEventListener('click', () => go(i));
            tabs.append(t);
        });
        tabs.addEventListener('keydown', e => { if (e.key === 'ArrowRight') { go(cur + 1); tabs.children[cur].focus(); } if (e.key === 'ArrowLeft') { go(cur - 1); tabs.children[cur].focus(); } });
        const nav = el('div', 'br-nav');
        const prev = el('button', null, '←'); prev.type = 'button'; prev.setAttribute('aria-label', 'Предыдущий филиал'); prev.addEventListener('click', () => go(cur - 1));
        const next = el('button', null, '→'); next.type = 'button'; next.setAttribute('aria-label', 'Следующий филиал'); next.addEventListener('click', () => go(cur + 1));
        nav.append(prev, count, next);
        app.replaceChildren(tabs, ...cards, nav);
        const first = items.findIndex(b => !b.demo && !b.pending);
        go(first < 0 ? 0 : first);
    }

    fetch(app.dataset.source || 'data/branches.json', { cache: 'no-store' })
        .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(d => render(d.items || []))
        .catch(err => { console.error('Branches load failed:', err); app.closest('section').hidden = true; });
})();
