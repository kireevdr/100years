/* Страница «Поздравления Университету» (congrats.html): все опубликованные поздравления, от новых к первым.
   Данные — тот же data/congrats.json, что и для лент на главной: [{ name, who, text, date? }].
   Порядок:
     • если у поздравлений есть поле "date" ("ГГГГ-ММ-ДД" или "ДД.ММ.ГГГГ") — сортировка по дате, новые сверху;
     • если дат нет — порядок файла. data-order="newest-first" — новые записи добавляются в НАЧАЛО файла;
       data-order="oldest-first" — новые добавляются в КОНЕЦ (тогда список переворачивается).
   Тексты вставляются только через textContent. */
(function () {
  const list = document.getElementById('ca-list');
  if (!list) return;
  const sec = list.closest('.ca'), countEl = sec.querySelector('.ca__count'), input = sec.querySelector('.ca__search input');
  const moreBtn = sec.querySelector('.ca__more .btn'), empty = sec.querySelector('.ca__empty');
  const PAGE = Infinity;   // сплошная лента — показываем всё сразу (чтобы включить «Показать ещё», поставьте, например, 18)
  const plural = (n, f) => f[(n % 10 === 1 && n % 100 !== 11) ? 0 : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 1 : 2];
  const MONTHS = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const parseDate = s => { if (!s) return null; let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return new Date(+m[1], m[2] - 1, +m[3]);
    m = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(s); return m ? new Date(+m[3], m[2] - 1, +m[1]) : null; };
  let all = [], shown = PAGE, q = '';

  function card(w) {
    const el = document.createElement('blockquote'); el.className = 'ca-card';
    const t = document.createElement('p'); t.className = 'ca-card__text'; t.textContent = w.text.replace(/\s*\n\s*/g, '\n').trim();
    const f = document.createElement('footer');
    const b = document.createElement('b'); b.textContent = w.name; f.append(b);
    if (w.who) { const s = document.createElement('span'); s.textContent = w.who.trim(); f.append(s); }
    if (w._d) { const d = document.createElement('time'); d.dateTime = w._d.toISOString().slice(0, 10); d.textContent = w._d.getDate() + ' ' + MONTHS[w._d.getMonth()] + ' ' + w._d.getFullYear(); f.append(d); }
    el.append(t, f);
    return el;
  }
  function render() {
    const norm = s => (s || '').toLowerCase().replace(/ё/g, 'е');
    const items = q ? all.filter(w => norm(w.name + ' ' + w.who).includes(norm(q))) : all;
    // сплошная лента в одну колонку: от новых к первым
    list.innerHTML = '';
    items.slice(0, q ? items.length : shown).forEach(w => list.append(card(w)));
    moreBtn.hidden = !!q || shown >= items.length;
    empty.hidden = items.length > 0;
    countEl.textContent = q ? 'найдено: ' + items.length : all.length + ' ' + plural(all.length, ['поздравление', 'поздравления', 'поздравлений']);
  }
  moreBtn.addEventListener('click', () => { shown += PAGE; render(); });
  let t = 0; input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { q = input.value.trim(); render(); }, 150); });

  fetch(list.dataset.source || 'data/congrats.json', { cache: 'no-cache' }).then(r => { if (!r.ok) throw 0; return r.json(); }).then(data => {
    let items = data.filter(w => w && w.text && w.name).map((w, i) => Object.assign({}, w, { _i: i, _d: parseDate(w.date) }));
    if (list.dataset.order === 'oldest-first') items.reverse();
    if (items.some(w => w._d)) items.sort((a, b) => ((b._d || 0) - (a._d || 0)) || 0);   // сортировка устойчивая: без даты — порядок файла
    all = items; list.setAttribute('aria-busy', 'false'); render();
  }).catch(() => { list.setAttribute('aria-busy', 'false'); empty.hidden = false; empty.textContent = 'Не удалось загрузить поздравления. Обновите страницу.'; });
})();
