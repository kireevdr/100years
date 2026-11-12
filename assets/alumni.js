/* Выпускники: загрузка data/alumni.json, построение блока #alumni,
   вкладки «факультет → направление».
   v3: без слайдера. На главной — по 2 отзыва и кнопка «Читать все отзывы»,
   ведущая на alumni.html#<направление>; на alumni.html — все отзывы.
   «Читать полностью» оставлен в index.html (id="alumni-review-script"),
   он подхватит новые карточки через MutationObserver. */
(function () {
    'use strict';

    const root = document.getElementById('alumni-app');
    if (!root) return;
    const source = root.dataset.source || 'data/alumni.json';
    const status = document.getElementById('alumni-status');

    /* --- Стили для сообщения о загрузке (один раз) --- */
    if (!document.getElementById('alumni-status-styles')) {
        const st = document.createElement('style');
        st.id = 'alumni-status-styles';
        st.textContent = `
      #alumni .alumni-status { color: var(--muted, #6b6b6b); font: 400 15px/1.5 var(--sans, Arial, sans-serif); margin: 24px 0; }
      #alumni .alumni-status[data-kind="error"] { color: var(--burgundy, #8e070b); }
    `;
        document.head.append(st);
    }

    function setStatus(text, kind) {
        if (!status) return;
        if (text) {
            status.textContent = text;
            status.hidden = false;
            if (kind) status.dataset.kind = kind;
            else delete status.dataset.kind;
        } else {
            status.hidden = true;
        }
    }

    /* --- Многострочный текст: \n → <br>, без innerHTML --- */
    function renderText(el, text) {
        el.textContent = '';
        String(text).split('\n').forEach((line, i) => {
            if (i > 0) el.append(document.createElement('br'));
            el.append(document.createTextNode(line));
        });
    }

    /* --- Одна карточка выпускника --- */
    function makeAlum(alum) {
        const article = document.createElement('article');
        article.className = 'alum';

        const portrait = document.createElement('span');
        portrait.className = 'portrait';
        if (alum.photo) {
            const img = document.createElement('img');
            img.src = alum.photo;
            img.alt = alum.name || '';
            img.loading = 'lazy';
            portrait.append(img);
        }

        const body = document.createElement('div');
        body.className = 'alum__body';
        const nameEl = document.createElement('b');
        nameEl.textContent = alum.name || '';
        body.append(nameEl);
        if (alum.year) {
            const yearEl = document.createElement('span');
            yearEl.className = 'cap';
            yearEl.textContent = alum.year;
            body.append(yearEl);
        }
        if (alum.role) {
            const roleEl = document.createElement('p');
            roleEl.className = 'alum__role';
            roleEl.textContent = alum.role;
            body.append(roleEl);
        }

        // Обёртка .alum__review + клэмп + кнопка создаются СРАЗУ,
        // чтобы клэмп применился с первого кадра, а не после measure().
        const review = document.createElement('div');
        review.className = 'alum__review';

        const quote = document.createElement('p');
        quote.className = 'quote is-clamped';
        quote.style.gridColumn = '1/-1';
        renderText(quote, alum.text || '');

        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'alum__more';
        more.textContent = 'Читать полностью';
        more.setAttribute('aria-haspopup', 'dialog');
        more.setAttribute('aria-controls', 'alumni-review-dialog');
        more.setAttribute('aria-label', 'Читать полностью отзыв: ' + (alum.name || ''));
        more.hidden = false; // measure() скроет, если отзыв короткий

        review.append(quote, more);
        article.append(portrait, body, review);
        return article;
    }

    /* --- Режим блока ---
       data-limit="2"  — на главной: показываем по 2 отзыва в направлении
                         и ссылку «Читать все отзывы» (data-all-href);
       data-limit="0"  — на странице всех отзывов: показываем всё,
                         вкладка выбирается по якорю (#zhurnalistika). */
    const limit = Number.parseInt(root.dataset.limit || '0', 10) || 0;
    const allHref = root.dataset.allHref || 'alumni.html';
    const isAllPage = limit === 0;

    const TR = {а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'e',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'h',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya'};
    function slug(text) {
        return String(text).toLowerCase().split('').map(ch => TR[ch] !== undefined ? TR[ch] : ch)
            .join('').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    }
    function plural(n, one, few, many) {
        const m10 = n % 10, m100 = n % 100;
        if (m10 === 1 && m100 !== 11) return one;
        if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
        return many;
    }

    /* --- Строка под карточками на главной: «Ещё N отзывов · Читать все отзывы →» --- */
    function makeMore(spec, total) {
        const row = document.createElement('div');
        row.className = 'alumni-more';
        const rest = total - limit;
        if (rest > 0) {
            const note = document.createElement('span');
            note.className = 'alumni-more__note';
            note.textContent = 'Ещё ' + rest + ' ' + plural(rest, 'отзыв', 'отзыва', 'отзывов') + ' выпускников направления «' + (spec.name || '') + '»';
            row.append(note);
        }
        const link = document.createElement('a');
        link.className = 'btn btn--outline alumni-more__link';
        link.href = allHref + '#' + slug(spec.name || '');
        link.textContent = 'Читать все отзывы →';
        row.append(link);
        return row;
    }

    /* --- Рендер всей структуры --- */
    function render(data) {
        if (!Array.isArray(data.faculties) || !data.faculties.length) {
            setStatus('Список отзывов пуст.', 'error');
            return;
        }

        const facWrap = document.createElement('div');
        facWrap.className = 'faculties';
        facWrap.setAttribute('role', 'tablist');
        facWrap.setAttribute('aria-label', 'Факультеты');

        const fragsSpecs = [];
        const fragsGroups = [];

        data.faculties.forEach((fac, fi) => {
            const facBtn = document.createElement('button');
            facBtn.type = 'button';
            facBtn.className = 'faculty';
            facBtn.setAttribute('role', 'tab');
            facBtn.dataset.fac = String(fi);
            facBtn.setAttribute('aria-selected', fi === 0 ? 'true' : 'false');
            facBtn.textContent = fac.name || '';
            facWrap.append(facBtn);

            const specsEl = document.createElement('div');
            specsEl.className = 'specs';
            specsEl.dataset.fac = String(fi);
            specsEl.setAttribute('role', 'tablist');
            specsEl.setAttribute('aria-label', 'Направления: ' + (fac.name || ''));
            if (fi !== 0) specsEl.hidden = true;
            fragsSpecs.push(specsEl);

            const specs = Array.isArray(fac.specs) ? fac.specs : [];
            specs.forEach((spec, si) => {
                const specBtn = document.createElement('button');
                specBtn.type = 'button';
                specBtn.className = 'spec';
                specBtn.setAttribute('role', 'tab');
                specBtn.dataset.spec = spec.name || '';
                specBtn.setAttribute('aria-selected', (fi === 0 && si === 0) ? 'true' : 'false');
                specBtn.textContent = spec.name || '';
                specsEl.append(specBtn);

                const group = document.createElement('div');
                group.className = 'alumni-group';
                group.dataset.spec = spec.name || '';
                group.dataset.fac = String(fi);
                if (!(fi === 0 && si === 0)) group.hidden = true;


                const all = Array.isArray(spec.alumni) ? spec.alumni : [];
                const shown = limit > 0 ? all.slice(0, limit) : all;
                const list = document.createElement('div');
                list.className = 'alumni';
                shown.forEach(a => list.append(makeAlum(a)));
                group.id = 'spec-' + slug(spec.name || '');
                group.append(list);
                if (limit > 0 && all.length) group.append(makeMore(spec, all.length));
                specBtn.dataset.slug = slug(spec.name || '');
                const count = document.createElement('span');
                count.className = 'spec__count';
                count.textContent = all.length;
                if (isAllPage) specBtn.append(' ', count);

                fragsGroups.push({ el: group, fac: fi, spec: spec.name || '' });
            });
        });

        root.replaceChildren(facWrap);
        fragsSpecs.forEach(s => root.append(s));
        fragsGroups.forEach(g => root.append(g.el));

        setStatus('');
    }

    /* --- Переключение вкладок --- */
    function activate(facIndex, specName) {
        root.querySelectorAll('.faculty').forEach((b, i) =>
            b.setAttribute('aria-selected', i === facIndex ? 'true' : 'false'));
        root.querySelectorAll('.specs').forEach((s, i) => { s.hidden = i !== facIndex; });
        root.querySelectorAll('.alumni-group').forEach(g => {
            const sameFac = Number(g.dataset.fac) === facIndex;
            g.hidden = !(sameFac && g.dataset.spec === specName);
        });
        let current = null;
        root.querySelectorAll('.spec').forEach(b => {
            const on = b.dataset.spec === specName && Number(b.closest('.specs').dataset.fac) === facIndex;
            b.setAttribute('aria-selected', on ? 'true' : 'false');
            if (on) current = b;
        });
        if (isAllPage && current && history.replaceState) history.replaceState(null, '', '#' + current.dataset.slug);
    }

    /* --- Открыть вкладку по якорю (#reklama-i-svyazi-s-obschestvennostyu) --- */
    function openFromHash() {
        const key = decodeURIComponent(location.hash.slice(1));
        if (!key) return false;
        const btn = Array.from(root.querySelectorAll('.spec')).find(b => b.dataset.slug === key);
        if (!btn) return false;
        activate(Number(btn.closest('.specs').dataset.fac), btn.dataset.spec);
        return true;
    }

    function wireClicks() {
        root.addEventListener('click', e => {
            const facBtn = e.target.closest('.faculty');
            if (facBtn && root.contains(facBtn)) {
                const fi = Number(facBtn.dataset.fac);
                const specsEl = root.querySelector('.specs[data-fac="' + fi + '"]');
                const firstSpec = specsEl && specsEl.querySelector('.spec');
                activate(fi, firstSpec ? firstSpec.dataset.spec : '');
                return;
            }
            const specBtn = e.target.closest('.spec');
            if (specBtn && root.contains(specBtn)) {
                const fi = Number(specBtn.closest('.specs').dataset.fac);
                activate(fi, specBtn.dataset.spec);
            }
        });
    }

    /* --- Поиск по выпускникам (только на alumni.html, форма #alumni-search) ---
       Ищет по ФИО, году выпуска, должности/организации, направлению и факультету.
       Пока в поле меньше 2 символов — обычные вкладки; иначе — список найденных. */
    const norm = t => String(t || '').toLowerCase().replace(/ё/g, 'е');
    function wireSearch(data) {
        const form = document.getElementById('alumni-search');
        if (!form) return;
        const input = form.querySelector('input');
        const clear = form.querySelector('.alumni-search__clear');
        const note = form.querySelector('.alumni-search__note');
        const index = [];
        data.faculties.forEach(fac => (fac.specs || []).forEach(spec => (spec.alumni || []).forEach(a => {
            index.push({ a, fac: fac.name || '', spec: spec.name || '', hay: norm([a.name, a.year, a.role, spec.name, fac.name].join(' ')) });
        })));
        const results = document.createElement('div');
        results.className = 'alumni-results';
        results.hidden = true;
        const list = document.createElement('div');
        list.className = 'alumni';
        results.append(list);
        root.append(results);

        function run() {
            const q = norm(input.value.trim());
            clear.hidden = !q;
            if (q.length < 2) {
                results.hidden = true;
                root.classList.remove('is-search');
                note.textContent = '';
                return;
            }
            const words = q.split(/\s+/);
            const hits = index.filter(x => words.every(w => x.hay.includes(w)));
            list.replaceChildren(...hits.map(x => {
                const card = makeAlum(x.a);
                const tag = document.createElement('a');
                tag.className = 'alum__spec';
                tag.href = '#' + slug(x.spec);
                tag.textContent = x.spec + ' · ' + x.fac;
                tag.addEventListener('click', () => { input.value = ''; run(); });
                card.querySelector('.alum__body').append(tag);
                return card;
            }));
            root.classList.add('is-search');
            results.hidden = false;
            note.textContent = hits.length
                ? 'Найдено: ' + hits.length + ' ' + plural(hits.length, 'выпускник', 'выпускника', 'выпускников')
                : 'Никого не нашли. Попробуйте фамилию, год выпуска или название организации.';
        }
        input.addEventListener('input', run);
        clear.addEventListener('click', () => { input.value = ''; run(); input.focus(); });
        form.addEventListener('submit', e => { e.preventDefault(); run(); });
    }

    async function load() {
        setStatus('Загружаем отзывы…');
        try {
            const res = await fetch(source, { cache: 'no-store' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            render(data);
            wireClicks();
            if (isAllPage) {
                wireSearch(data);
                openFromHash();
                addEventListener('hashchange', openFromHash);
            }
        } catch (err) {
            console.error('Alumni load failed:', err);
            setStatus('Не удалось загрузить отзывы выпускников. Попробуйте обновить страницу позже.', 'error');
        } finally {
            root.setAttribute('aria-busy', 'false');
        }
    }

    load();
})();