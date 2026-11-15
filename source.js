'use strict';
(() => {
  const books = JSON.parse(document.getElementById('source-books').textContent);
  const $ = id => document.getElementById(id);
  const node = (tag, text, className) => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  };
  const indices = new Map(), chunks = new Map(), scripts = new Map();
  window.registerBookSource = payload => {
    if (payload.type === 'index') indices.set(payload.bookId, payload);
    else if (payload.type === 'chunk') chunks.set(`${payload.bookId}/${payload.chunk}`, payload.lines);
  };
  async function loadScript(file) {
    if (!scripts.has(file)) {
      scripts.set(file, new Promise((resolve, reject) => {
        const script = document.createElement('script'); script.src = file;
        script.onload = resolve;
        script.onerror = () => { scripts.delete(file); script.remove(); reject(new Error('原文文件未能载入，请保留完整的 sources 目录。')); };
        document.head.append(script);
      }));
    }
    await scripts.get(file);
  }
  async function loadIndex(id) {
    await loadScript(`./sources/${id}/index.js`);
    if (!indices.has(id)) throw new Error('原书索引无效。');
    return indices.get(id);
  }
  async function loadChunk(id, chunk) {
    await loadScript(`./sources/${id}/c-${String(chunk).padStart(3, '0')}.js`);
    const lines = chunks.get(`${id}/${chunk}`);
    if (!lines) throw new Error('原书分块无效。');
    return lines;
  }
  let current, range, firstChunk = 0, lastChunk = 0, version = 0, loading = false;
  books.forEach(book => { const option = node('option', book.title); option.value = book.bookId; $('source-book').append(option); });
  function safeReference(ref, index) {
    if (!ref || !/^(?:\.\/)?[a-z0-9-]+\.html(?:#[a-zA-Z0-9_-]+)?$/.test(ref)) return null;
    const plain = ref.replace(/^\.\//, '');
    const [file] = plain.split('#');
    return [...index.references.map(r => r.output), 'practice-reader.html'].includes(file) ? plain : null;
  }
  function hashFor(book, from, to) {
    const previous = new URLSearchParams(location.hash.slice(1));
    const params = new URLSearchParams({ book, from, to });
    if (previous.get('book') === book && previous.has('ref')) params.set('ref', previous.get('ref'));
    return params.toString();
  }
  function route(book, from, to = from) {
    const hash = `#${hashFor(book, from, to)}`;
    if (location.hash === hash) navigate(); else location.hash = hash;
  }
  function showReferences(line) {
    const refs = current.references.filter(ref => line >= ref.lineStart && line <= ref.lineEnd);
    $('reference-list').replaceChildren();
    for (const ref of refs) {
      const a = node('a', `${ref.unitTitle} · ${ref.label}`);
      a.href = `./${ref.output}#excerpt-${ref.excerptId}`;
      $('reference-list').append(a);
      if (current.bookId === 'mao-selected' && ref.unitId === 'practice' && current.readerExcerptIds.includes(ref.excerptId)) {
        const reader = node('a', '在全文伴读中看 ↗', 'source-reader-link');
        reader.href = `./practice-reader.html#q-${ref.excerptId}`;
        $('reference-list').append(reader);
      }
    }
    $('source-references').showModal();
  }
  $('source-tools').addEventListener('click', () => { document.querySelector('.source-header').scrollIntoView({block:'start',behavior:'instant'}); $('line-number').focus({preventScroll:true}); });
  $('close-references').addEventListener('click', () => $('source-references').close());
  function renderChunk(index, lines) {
    const fragment = document.createDocumentFragment();
    lines.forEach((text, offset) => {
      const number = index * current.chunkSize + offset + 1;
      const row = node('div', undefined, 'source-line'); row.id = `line-${number}`; row.tabIndex = -1; row.dataset.line = number;
      if (number >= range.from && number <= range.to) row.classList.add('is-highlighted');
      const gutter = node('div', undefined, 'source-gutter');
      const permalink = node('a', String(number)); permalink.href = `#${hashFor(current.bookId, number, number)}`; permalink.setAttribute('aria-label', `第 ${number} 行`); gutter.append(permalink);
      if (current.references.some(ref => number >= ref.lineStart && number <= ref.lineEnd)) {
        const button = node('button', '↗', 'source-reference-marker'); button.type = 'button'; button.setAttribute('aria-label', `查看引用第 ${number} 行的精读`);
        button.addEventListener('click', () => showReferences(number)); gutter.append(button);
      }
      const marker = text.match(/^==========第(\d+)页==========$/);
      if (marker) row.classList.add('scan-separator');
      const content = node('span', text || '\u00a0', 'source-line-text');
      row.append(gutter, content); fragment.append(row);
    });
    return fragment;
  }
  function updateButtons() {
    for (const id of ['line-jump', 'page-jump']) $(id).querySelectorAll('input,button').forEach(el => { el.disabled = loading || !current; });
    $('load-before').disabled = loading || !current || firstChunk === 0;
    $('load-after').disabled = loading || !current || lastChunk >= current.chunkCount - 1;
  }
  async function extend(direction) {
    if (loading || !current) return;
    const chunk = direction < 0 ? firstChunk - 1 : lastChunk + 1;
    if (chunk < 0 || chunk >= current.chunkCount) return;
    const token = version, book = current.bookId;
    loading = true; updateButtons();
    const anchor = [...$('source-lines').children].find(el => el.getBoundingClientRect().bottom > 0);
    const top = anchor?.getBoundingClientRect().top;
    try {
      const lines = await loadChunk(book, chunk);
      if (token !== version) return;
      const rendered = renderChunk(chunk, lines);
      if (direction < 0) { $('source-lines').prepend(rendered); firstChunk = chunk; }
      else { $('source-lines').append(rendered); lastChunk = chunk; }
      if (anchor) window.scrollBy({ top: anchor.getBoundingClientRect().top - top, behavior: 'instant' });
    } catch (error) { if (token === version) $('source-status').textContent = error.message; }
    finally { if (token === version) { loading = false; updateButtons(); } }
  }
  $('load-before').addEventListener('click', () => extend(-1));
  $('load-after').addEventListener('click', () => extend(1));
  $('source-book').addEventListener('change', event => route(event.target.value, 1));
  $('line-jump').addEventListener('submit', event => { event.preventDefault(); if (current) route(current.bookId, Number($('line-number').value)); });
  $('page-jump').addEventListener('submit', event => {
    event.preventDefault();
    const line = current?.pages[$('scan-page').value];
    if (line) route(current.bookId, line);
    else $('source-status').textContent = '没有这个文本扫描页，请查看原书中的页标记。';
  });
  async function navigate() {
    const token = ++version;
    loading = true; updateButtons(); $('source-references').close();
    const params = new URLSearchParams(location.hash.slice(1));
    const book = params.get('book') || books[0]?.bookId;
    if (!books.some(item => item.bookId === book)) { current = undefined; $('source-lines').replaceChildren(); $('source-ref').hidden = true; loading = false; updateButtons(); $('source-status').textContent = '没有可用的原书，请重新构建并保留 sources 目录。'; return; }
    $('source-status').textContent = '正在载入原文…';
    try {
      const index = await loadIndex(book);
      if (token !== version) return;
      const line = value => Math.min(index.totalLines, Math.max(1, Number.isSafeInteger(Number(value)) ? Number(value) : 1));
      const from = line(params.get('from')), to = Math.max(from, line(params.get('to') ?? from));
      const first = Math.floor((from - 1) / index.chunkSize), last = Math.floor((to - 1) / index.chunkSize);
      const loaded = await Promise.all(Array.from({length:last - first + 1}, (_, n) => loadChunk(book, first + n)));
      if (token !== version) return;
      current = index; range = {from, to}; firstChunk = first; lastChunk = last;
      $('source-lines').replaceChildren(...loaded.map((lines, n) => renderChunk(first + n, lines)));
      $('source-book').value = book; $('line-number').max = index.totalLines; $('line-number').value = from;
      const page = Object.entries(index.pages).filter(([, n]) => n <= from).at(-1)?.[0]; $('scan-page').value = page ?? '';
      const ref = safeReference(params.get('ref'), index);
      $('source-ref').hidden = !ref;
      if (ref) {
        const excerptId = ref.split('#')[1]?.replace(/^(excerpt-|q-)/, '');
        const referring = index.references.find(item => item.excerptId === excerptId && (ref.startsWith('practice-reader.html#') || ref.startsWith(`${item.output}#`))) ?? index.references.find(item => item.lineStart === from && item.lineEnd === to);
        $('source-ref-label').textContent = referring ? `${referring.unitTitle} · ${referring.label}` : '全文伴读';
        $('source-return').href = `./${ref}`;
      }
      $('source-status').textContent = `${index.title} · 共 ${index.totalLines} 行 · 当前定位 ${from}–${to} 行`;
      document.title = `${index.title} · 原文浏览器`;
      const target = $(`line-${from}`); target.focus({preventScroll:true}); target.scrollIntoView({block:'center',behavior:'instant'});
    } catch (error) { if (token === version) $('source-status').textContent = error.message; }
    finally { if (token === version) { loading = false; updateButtons(); } }
  }
  window.addEventListener('hashchange', navigate);
  navigate();
})();
