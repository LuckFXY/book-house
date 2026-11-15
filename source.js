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
    else if (payload.type === 'chunk') chunks.set(`${payload.bookId}/${payload.chunk}`, payload);
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
  let raw = false;
  try { raw = localStorage.getItem('source-raw-v1') === 'true'; } catch { /* Reading works without storage. */ }
  $('source-raw').checked = raw;
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
  function lineContent(number, text) {
    const span = node('span', undefined, 'source-original-line');
    span.id = `line-${number}`; span.dataset.line = number; span.tabIndex = -1;
    if (number >= range.from && number <= range.to) span.classList.add('is-highlighted');
    const original = node('span', undefined, 'source-line-text');
    const parts = /^(\s*)(.*?)(\s*)$/.exec(text);
    original.append(node('span', parts[1], 'source-whitespace'), document.createTextNode(parts[2]), node('span', parts[3], 'source-whitespace'));
    span.append(original);
    if (current.references.some(ref => number >= ref.lineStart && number <= ref.lineEnd)) {
      const button = node('button', '↗', 'source-reference-marker'); button.type = 'button';
      button.setAttribute('aria-label', `查看引用第 ${number} 行的精读`);
      button.addEventListener('click', () => showReferences(number)); span.append(button);
    }
    return span;
  }
  const isDateline = text => /^[(（][^()（）]{0,6}[一二三四五六七八九〇零○十]+年[^()（）]*[)）][*＊]*$/.test(text.trim());
  function renderLines() {
    const titleParts = new Map(), titleEnds = new Map();
    const loadedLine = number => {
      const payload = chunks.get(`${current.bookId}/${Math.floor((number - 1) / current.chunkSize)}`);
      const offset = (number - 1) % current.chunkSize;
      return payload && { text: payload.lines[offset], type: payload.classes[offset] };
    };
    const end = Math.min(current.totalLines, (lastChunk + 1) * current.chunkSize);
    for (let number = firstChunk * current.chunkSize + 1; number <= end; number++) {
      if (loadedLine(number).type !== 'h') continue;
      for (let next = number + 1; next <= end; next++) {
        const line = loadedLine(next);
        if (!line.text?.trim() || !'th'.includes(line.type)) break;
        if (isDateline(line.text)) {
          titleEnds.set(number, next);
          for (let part = number + 1; part <= next; part++) titleParts.set(part, part === next ? 'source-dateline' : 'source-subtitle');
          number = next;
          break;
        }
        if ([...line.text.trim()].length > 20) break;
      }
    }
    const fragment = document.createDocumentFragment();
    let block, content, permalink, previousText, previousHeading, titleEnd;
    function newBlock(number) {
      block = node('div', undefined, 'source-line');
      const gutter = node('div', undefined, 'source-gutter');
      permalink = node('a', String(number)); permalink.href = `#${hashFor(current.bookId, number, number)}`;
      block.dataset.first = number; gutter.append(permalink);
      content = node('div', undefined, 'source-prose'); block.append(gutter, content); fragment.append(block);
    }
    for (let chunk = firstChunk; chunk <= lastChunk; chunk++) {
      const payload = chunks.get(`${current.bookId}/${chunk}`);
      payload.lines.forEach((text, offset) => {
        const number = chunk * current.chunkSize + offset + 1;
        if (!raw && !'th'.includes(payload.classes[offset])) return;
        const marker = text.match(/^==========第(\d+)页==========$/);
        if (raw) {
          newBlock(number);
          const original = lineContent(number, text);
          block.id = original.id; block.dataset.line = number; block.tabIndex = -1;
          if (number >= range.from && number <= range.to) block.classList.add('is-highlighted');
          const reference = original.querySelector('button');
          if (reference) block.querySelector('.source-gutter').append(reference);
          content.append(node('span', text || '\u00a0', 'source-line-text'));
          if (marker) block.classList.add('scan-separator');
          permalink.title = `第 ${number} 行`; permalink.setAttribute('aria-label', permalink.title);
          return;
        }
        const titlePart = titleParts.get(number);
        const dateline = isDateline(text);
        const heading = payload.classes[offset] === 'h' && !titlePart;
        if (heading) titleEnd = titleEnds.get(number);
        const joinsHeading = heading && previousHeading?.number === number - 1 &&
          ((previousHeading.text === '注' && text.trim() === '释') || (previousHeading.text === '目' && text.trim() === '录'));
        const merge = previousText !== undefined && (!/[。！？；：…"”’」』）]$/.test(previousText.trim()) || [...previousText.trim()].length <= 6);
        if (!block || (heading && !joinsHeading) || (!titlePart && (dateline || (!marker && previousText !== undefined && !merge)))) newBlock(number);
        if (heading) { block.classList.add('source-heading'); content.setAttribute('role','heading'); content.setAttribute('aria-level','2'); }
        const span = lineContent(number, text);
        if (titlePart || dateline) span.classList.add(titlePart ?? 'source-dateline');
        if (marker) {
          span.classList.add('scan-separator');
          if (!raw) {
            span.querySelector('.source-line-text').dataset.pageLabel = `扫描页 ${marker[1]}`;
            span.setAttribute('aria-label', `扫描页 ${marker[1]}`);
            const count = current.pageArtifacts[marker[1]] ?? 0;
            if (count) span.append(node('small', `已隐藏页眉/页码/水印 ${count} 行`, 'source-hidden-note'));
          }
        } else previousText = text;
        content.append(span);
        block.dataset.last = number;
        permalink.title = `第 ${block.dataset.first}–${number} 行`;
        permalink.setAttribute('aria-label', permalink.title);
        if (dateline) {
          block = undefined; previousText = undefined; previousHeading = undefined; titleEnd = undefined;
        } else if (titlePart || (heading && titleEnd)) {
          previousText = undefined; previousHeading = undefined;
        } else if (heading) {
          previousText = undefined; previousHeading = { number, text: text.trim() };
          // Retain the block only when the next original line completes 注释 or 目录.
          const nextPayload = offset + 1 < payload.lines.length ? payload : chunks.get(`${current.bookId}/${chunk + 1}`);
          const nextText = nextPayload?.lines[offset + 1 < payload.lines.length ? offset + 1 : 0]?.trim();
          if (!((text.trim() === '注' && nextText === '释') || (text.trim() === '目' && nextText === '录'))) block = undefined;
        } else previousHeading = undefined;
      });
    }
    $('source-lines').classList.toggle('reading-mode', !raw);
    $('source-lines').replaceChildren(fragment);
  }
  function centerTarget() {
    let target = $(`line-${range.from}`);
    if (!target) {
      // An explicit jump to a hidden line exposes the original rather than guessing a new location.
      raw = true; $('source-raw').checked = true; renderLines();
      $('source-status').textContent += ' · 此行为隐藏内容，已临时显示原始行。';
      target = $(`line-${range.from}`);
    }
    target.focus({preventScroll:true}); target.scrollIntoView({block:'center',behavior:'instant'});
  }
  function visibleAnchor() {
    const top = document.querySelector('.source-context').getBoundingClientRect().bottom;
    const el = [...document.querySelectorAll('#source-lines [data-line]')].find(el => el.getBoundingClientRect().bottom > top);
    return el ? { id: el.id, top: el.getBoundingClientRect().top } : null;
  }
  function restoreAnchor(anchor) {
    if (anchor && $(anchor.id)) window.scrollBy({top:$(anchor.id).getBoundingClientRect().top-anchor.top,behavior:'instant'});
  }
  $('source-raw').addEventListener('change', event => {
    raw = event.target.checked;
    try { localStorage.setItem('source-raw-v1', String(raw)); } catch { /* Preference remains usable for this visit. */ }
    if (current && !loading) { const anchor = visibleAnchor(); renderLines(); restoreAnchor(anchor); }
  });
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
    const anchor = visibleAnchor();
    try {
      await loadChunk(book, chunk);
      if (token !== version) return;
      if (direction < 0) firstChunk = chunk; else lastChunk = chunk;
      renderLines(); restoreAnchor(anchor);
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
      await Promise.all(Array.from({length:last - first + 1}, (_, n) => loadChunk(book, first + n)));
      if (token !== version) return;
      current = index; range = {from, to}; firstChunk = first; lastChunk = last;
      renderLines();
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
      centerTarget();
    } catch (error) { if (token === version) $('source-status').textContent = error.message; }
    finally { if (token === version) { loading = false; updateButtons(); } }
  }
  window.addEventListener('hashchange', navigate);
  navigate();
})();
