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
  function storage(action) {
    try { return action(localStorage); }
    catch { $('storage-note').hidden = false; return null; }
  }
  const readingKey = 'source-reading-v1';
  const knownBook = id => books.some(book => book.bookId === id);
  const validLine = line => Number.isSafeInteger(line) && line > 0;
  const shorten = (text, length) => [...text].slice(0, length).join('');
  let saved;
  try { saved = JSON.parse(storage(store => store.getItem(readingKey))); } catch { saved = null; }
  const memory = { v: 1, lastBook: null, positions: {}, bookmarks: [] };
  if (saved?.v === 1) {
    if (knownBook(saved.lastBook)) memory.lastBook = saved.lastBook;
    for (const book of books) if (validLine(saved.positions?.[book.bookId])) memory.positions[book.bookId] = saved.positions[book.bookId];
    const seen = new Set();
    if (Array.isArray(saved.bookmarks)) for (const item of saved.bookmarks) {
      if (!item || !knownBook(item.bookId) || !validLine(item.line) || typeof item.snippet !== 'string' || !Number.isSafeInteger(item.createdAt) || item.createdAt < 0) continue;
      const key = `${item.bookId}/${item.line}`;
      if (seen.has(key)) continue; seen.add(key);
      memory.bookmarks.push({bookId:item.bookId,line:item.line,scanPage:validLine(item.scanPage)?item.scanPage:null,snippet:shorten(item.snippet,30),note:typeof item.note==='string'?shorten(item.note,60):'',createdAt:item.createdAt});
    }
    memory.bookmarks.sort((a,b)=>b.createdAt-a.createdAt); memory.bookmarks=memory.bookmarks.slice(0,500);
  }
  function persist() { storage(store => store.setItem(readingKey,JSON.stringify(memory))); }
  persist();
  let raw = storage(store => store.getItem('source-raw-v1')) === 'true';
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
    recordPosition();
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
  $('close-references').addEventListener('click', () => $('source-references').close());
  function readingPoint() {
    const top = document.querySelector('.source-context').getBoundingClientRect().bottom;
    return top + (innerHeight - top) * 0.3;
  }
  function readingLine() {
    const point = readingPoint();
    const entries = [...document.querySelectorAll('#source-lines [data-line]')]
      .map(el=>({el,rect:el.getBoundingClientRect()})).filter(({rect})=>rect.width>0 && rect.bottom>0 && rect.top<innerHeight);
    const found = entries.find(({rect})=>rect.top<=point && rect.bottom>point) ??
      entries.sort((a,b)=>Math.abs(a.rect.top-point)-Math.abs(b.rect.top-point))[0];
    return found ? Number(found.el.dataset.line) : null;
  }
  let positionTimer, bookmarkJump = false;
  function recordPosition() {
    clearTimeout(positionTimer);
    if (!current || loading || $('source-references').open || $('source-line-menu').open || (matchMedia('(max-width:900px)').matches && document.body.classList.contains('source-sidebar-open'))) return;
    const line = readingLine();
    if (!line) return;
    memory.positions[current.bookId] = line; memory.lastBook = current.bookId; persist();
  }
  window.addEventListener('scroll', () => { clearTimeout(positionTimer); positionTimer=setTimeout(recordPosition,500); }, {passive:true});
  window.addEventListener('pagehide',recordPosition);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')recordPosition();});
  const pageAt = line => Number(Object.entries(current.pages).filter(([,n])=>n<=line).at(-1)?.[0]) || null;
  function toggleBookmark(line) {
    if (!current || !validLine(line)) return;
    const existing = memory.bookmarks.findIndex(item=>item.bookId===current.bookId && item.line===line);
    if (existing>=0) memory.bookmarks.splice(existing,1);
    else {
      if (memory.bookmarks.length>=500) { $('source-status').textContent='最多保存 500 个书签，请先删除一个。'; return; }
      const text = $(`line-${line}`)?.querySelector('.source-line-text')?.textContent ?? '';
      memory.bookmarks.unshift({bookId:current.bookId,line,scanPage:pageAt(line),snippet:shorten(text.trim(),30),note:'',createdAt:Date.now()});
    }
    persist(); renderBookmarks(); updateBookmarkMarkers();
  }
  function bookmarkButton(line) {
    const button=node('button','☆','source-bookmark-line'); button.type='button'; button.dataset.bookmarkLine=line;
    button.addEventListener('click',()=>toggleBookmark(Number(button.dataset.bookmarkLine))); return button;
  }
  function nearestRenderedLine(line) {
    return $(`line-${line}`) ?? [...document.querySelectorAll('#source-lines [data-line]')]
      .sort((a,b)=>Math.abs(Number(a.dataset.line)-line)-Math.abs(Number(b.dataset.line)-line))[0];
  }
  function updateBookmarkMarkers() {
    const markedBlocks = new Map();
    if (current) for (const item of memory.bookmarks.filter(item=>item.bookId===current.bookId && item.line>firstChunk*current.chunkSize && item.line<=(lastChunk+1)*current.chunkSize)) {
      const block=nearestRenderedLine(item.line)?.closest('.source-line');
      if (block && !markedBlocks.has(block)) markedBlocks.set(block,item.line);
    }
    document.querySelectorAll('.source-line').forEach(block=>{
      const button=block.querySelector('.source-bookmark-line'), marked=markedBlocks.get(block);
      const line=marked??Number(block.dataset.first);
      button.dataset.bookmarkLine=line;
      button.textContent=marked?'★':'☆';button.setAttribute('aria-pressed',String(Boolean(marked)));
      button.classList.toggle('source-bookmark-gutter',Boolean(marked));
      button.setAttribute('aria-label',`${marked?'删除':'加'}书签 · 第 ${line} 行`);
    });
  }
  function updateLineMenu() {
    const line=Number($('bookmark-menu-line').value);
    const marked=memory.bookmarks.some(item=>item.bookId===current.bookId&&item.line===line);
    $('bookmark-menu-toggle').textContent=marked?'删除书签':'加书签';
    $('bookmark-menu-link').href=`#${hashFor(current.bookId,line,line)}`;
  }
  function openLineMenu(block) {
    const first=Number(block.dataset.first),last=Number(block.dataset.last??first);
    $('bookmark-menu-line').replaceChildren();
    for(let line=first;line<=last;line++) {
      const option=node('option',`第 ${line} 行`);option.value=line;$('bookmark-menu-line').append(option);
    }
    const target=range.from>=first&&range.from<=last?range.from:first;
    $('bookmark-menu-line').value=target;updateLineMenu();$('source-line-menu').showModal();
  }
  $('bookmark-menu-line').addEventListener('change',updateLineMenu);
  $('bookmark-menu-toggle').addEventListener('click',()=>{toggleBookmark(Number($('bookmark-menu-line').value));updateLineMenu();});
  $('bookmark-menu-link').addEventListener('click',()=>$('source-line-menu').close());
  $('close-line-menu').addEventListener('click',()=>$('source-line-menu').close());
  function renderBookmarks() {
    const list=$('bookmark-list'); list.replaceChildren();
    if (!memory.bookmarks.length) { list.append(node('p','还没有书签。阅读时点“加书签”保存位置。')); return; }
    for (const book of books) {
      const items=memory.bookmarks.filter(item=>item.bookId===book.bookId).sort((a,b)=>b.createdAt-a.createdAt);
      if (!items.length) continue;
      const section=node('section'); section.append(node('h3',book.title));
      for (const item of items) {
        const row=node('div',undefined,'bookmark-item'); row.dataset.bookmarkKey=`${item.bookId}/${item.line}`;
        const jump=node('a',`第 ${item.line} 行${item.scanPage ? ` · 扫描页 ${item.scanPage}`:''} · ${item.snippet}`);
        jump.href=`#${new URLSearchParams({book:item.bookId,from:item.line,to:item.line})}`;
        jump.addEventListener('click',event=>{event.preventDefault();if(mobileSidebar.matches)setSidebar(false);bookmarkJump=true;route(item.bookId,item.line);});
        const note=node('input'); note.value=item.note; note.maxLength=60; note.setAttribute('aria-label','书签备注');
        const save=node('button','保存备注'); save.type='button'; save.addEventListener('click',()=>{item.note=shorten(note.value,60); note.value=item.note; persist(); $('source-status').textContent='书签备注已保存。';});
        const remove=node('button','删除'); remove.type='button'; remove.addEventListener('click',()=>{memory.bookmarks=memory.bookmarks.filter(bookmark=>bookmark!==item);persist();renderBookmarks();updateBookmarkMarkers();});
        row.append(jump,note,save,remove);section.append(row);
      }
      list.append(section);
    }
  }
  $('bookmark-current').addEventListener('click',()=>toggleBookmark(readingLine() ?? memory.positions[current?.bookId]));
  $('resume-dismiss').addEventListener('click',()=>{$('source-resume').hidden=true;});
  $('resume-start').addEventListener('click',()=>{ $('source-resume').hidden=true; route(current.bookId,1); });
  renderBookmarks();
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
      const targetBlock=block;
      permalink.setAttribute('aria-haspopup','dialog');
      permalink.addEventListener('click',event=>{if(event.button===0&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){event.preventDefault();openLineMenu(targetBlock);}});
      block.dataset.first = number; gutter.append(permalink,bookmarkButton(number));
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
          const reference = original.querySelector('.source-reference-marker');
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
    updateBookmarkMarkers();
  }
  function centerTarget() {
    let target = $(`line-${range.from}`);
    if (!target) {
      target=nearestRenderedLine(range.from);
      if (!target) return;
      target.classList.add('is-highlighted');
      $('source-status').textContent += ` · 原行已隐藏，定位到最近可见的第 ${target.dataset.line} 行。`;
    }
    target.focus({preventScroll:true}); target.scrollIntoView({block:'center',behavior:'instant'});
    window.scrollBy({top:target.getBoundingClientRect().top-readingPoint()+1,behavior:'instant'});
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
    storage(store=>store.setItem('source-raw-v1',String(raw)));
    if (current && !loading) { const anchor = visibleAnchor(); renderLines();
      if (anchor && !$(anchor.id)) { const closest=[...document.querySelectorAll('#source-lines [data-line]')].sort((a,b)=>Math.abs(Number(a.dataset.line)-Number(anchor.id.slice(5)))-Math.abs(Number(b.dataset.line)-Number(anchor.id.slice(5))))[0]; if(closest) anchor.id=closest.id; }
      restoreAnchor(anchor); recordPosition(); }
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
  $('source-book').addEventListener('change', event => { const id=event.target.value; const line=memory.positions[id] ?? 1; route(id,line); });
  $('line-jump').addEventListener('submit', event => { event.preventDefault(); if (current) route(current.bookId, Number($('line-number').value)); });
  $('page-jump').addEventListener('submit', event => {
    event.preventDefault();
    const line = current?.pages[$('scan-page').value];
    if (line) route(current.bookId, line);
    else $('source-status').textContent = '没有这个文本扫描页，请查看原书中的页标记。';
  });
  async function navigate() {
    recordPosition();
    const token = ++version;
    loading = true; updateButtons(); $('source-references').close();
    const params = new URLSearchParams(location.hash.slice(1));
    const resume = !location.hash && memory.lastBook && memory.positions[memory.lastBook];
    const book = params.get('book') || (resume ? memory.lastBook : books[0]?.bookId);
    $('source-resume').hidden = true;
    if (!books.some(item => item.bookId === book)) { current = undefined; $('source-lines').replaceChildren(); $('source-ref').hidden = true; loading = false; updateButtons(); $('source-status').textContent = '没有可用的原书，请重新构建并保留 sources 目录。'; return; }
    $('source-status').textContent = '正在载入原文…';
    try {
      const index = await loadIndex(book);
      if (token !== version) return;
      const line = value => Math.min(index.totalLines, Math.max(1, Number.isSafeInteger(Number(value)) ? Number(value) : 1));
      const from = line(params.get('from') ?? (resume || 1)), to = Math.max(from, line(params.get('to') ?? from));
      let first = Math.floor((from - 1) / index.chunkSize), last = Math.floor((to - 1) / index.chunkSize);
      await Promise.all(Array.from({length:last - first + 1}, (_, n) => loadChunk(book, first + n)));
      if (!raw && from === to) {
        const target = chunks.get(`${book}/${first}`), offset = (from - 1) % index.chunkSize;
        if (!'th'.includes(target.classes[offset])) {
          let before = /[th]/.test(target.classes.slice(0, offset));
          let after = /[th]/.test(target.classes.slice(offset + 1));
          for (let chunk = first + 1; chunk <= last; chunk++) after ||= /[th]/.test(chunks.get(`${book}/${chunk}`).classes);
          // A hidden target can straddle a chunk boundary; search both sides before choosing the closest line.
          while ((!before && first > 0) || (!after && last < index.chunkCount - 1)) {
            if (!before && first > 0) before = /[th]/.test((await loadChunk(book, --first)).classes);
            if (!after && last < index.chunkCount - 1) after = /[th]/.test((await loadChunk(book, ++last)).classes);
            if (token !== version) return;
          }
        }
      }
      if (token !== version) return;
      const changedBook = current?.bookId !== index.bookId;
      current = index; range = {from, to}; firstChunk = first; lastChunk = last;
      if(changedBook){searchVersion++;searchResults=[];$('source-search').value='';$('search-results').replaceChildren();$('search-status').textContent='';$('toc-filter').value='';$('search-prev').disabled=$('search-next').disabled=true;}

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
      if (resume) {
        $('resume-label').textContent=`已回到上次阅读位置 · 第 ${from} 行（扫描页 ${pageAt(from) ?? '未标记'}）`;
        $('source-resume').hidden=false;
      }
      centerTarget();
      if(changedBook)renderToc();
      trackToc(from);
      if (bookmarkJump) { bookmarkJump=false; setTimeout(()=>{if(token===version)document.querySelectorAll('#source-lines .is-highlighted').forEach(el=>el.classList.remove('is-highlighted'));},2000); }
      memory.lastBook=book; memory.positions[book]=from; persist();
    } catch (error) { if (token === version) $('source-status').textContent = error.message; }
    finally { if (token === version) { loading = false; updateButtons(); } }
  }
  const mobileSidebar = matchMedia('(max-width:900px)');
  let sidebarOpener, activeTocId, searchVersion = 0, searchTimer, searchResults = [], searchCursor = -1;
  const compact = text => text.replace(/\s/gu, '');
  const sidebarPanels = {toc:'toc-panel',bookmarks:'bookmark-panel',search:'search-panel'};
  function selectSidebarTab(name) {
    for (const [key, panel] of Object.entries(sidebarPanels)) {
      $(panel).hidden = key !== name;
      $(`${key}-tab`).setAttribute('aria-selected', String(key === name));
      $(`${key}-tab`).tabIndex = key === name ? 0 : -1;
    }
  }
  function setSidebar(open, name, opener) {
    if (name) selectSidebarTab(name);
    if (open) { recordPosition(); sidebarOpener = opener ?? document.activeElement; }
    document.body.classList.toggle('source-sidebar-open',open);
    document.body.classList.toggle('source-sidebar-closed',!open);
    updateSidebarButtons(open);
    $('sidebar-backdrop').hidden = !open || !mobileSidebar.matches;
    const modal = open && mobileSidebar.matches;
    $('source-sidebar').setAttribute('role',modal?'dialog':'complementary');
    if (modal) $('source-sidebar').setAttribute('aria-modal','true'); else $('source-sidebar').removeAttribute('aria-modal');
    for (const el of document.querySelectorAll('.source-header,.source-context,.source-main,#source-resume')) el.inert=modal;
    if (open) (name === 'toc' ? $('toc-filter') : name === 'search' ? $('source-search') : $('bookmarks-tab')).focus({preventScroll:true});
    else if (sidebarOpener?.isConnected) sidebarOpener.focus({preventScroll:true});
  }
  function sidebarJump(line, to = line) {
    if (mobileSidebar.matches) setSidebar(false);
    bookmarkJump = true; route(current.bookId,line,to);
  }
  function updateSidebarButtons(open) {
    $('source-toc-toggle').setAttribute('aria-expanded',String(open));
    $('source-toc-toggle').textContent=mobileSidebar.matches?'目录':open?'收起目录':'展开目录';
    $('source-tools').hidden=!mobileSidebar.matches && current?.toc?.length !== 0;
  }
  $('source-toc-toggle').addEventListener('click',()=>{
    if(mobileSidebar.matches)setSidebar(true,'toc',$('source-toc-toggle'));
    else setSidebar(document.body.classList.contains('source-sidebar-closed'),'toc',$('source-toc-toggle'));
  });
  $('source-tools').addEventListener('click',()=>setSidebar(true,'bookmarks',$('source-tools')));
  $('sidebar-close').addEventListener('click',()=>setSidebar(false));
  $('sidebar-backdrop').addEventListener('click',()=>setSidebar(false));
  for (const name of Object.keys(sidebarPanels)) $(`${name}-tab`).addEventListener('click',()=>selectSidebarTab(name));
  document.querySelector('.sidebar-tabs').addEventListener('keydown',event=>{
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    const tabs=[...document.querySelectorAll('.sidebar-tabs button:not([hidden])')];
    const i=tabs.indexOf(document.activeElement);
    const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(i+(event.key==='ArrowRight'?1:tabs.length-1))%tabs.length;
    event.preventDefault();tabs[next].click();tabs[next].focus();
  });
  $('source-sidebar').addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();setSidebar(false);return;}
    if(event.key!=='Tab'||!mobileSidebar.matches)return;
    const items=[...$('source-sidebar').querySelectorAll('button,input,a[href],summary')].filter(el=>!el.disabled&&el.tabIndex>=0&&el.getClientRects().length);
    const first=items[0],last=items.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  });
  mobileSidebar.addEventListener('change',()=>setSidebar(!mobileSidebar.matches));
  new ResizeObserver(()=>document.body.style.setProperty('--source-context-height',`${document.querySelector('.source-context').offsetHeight}px`)).observe(document.querySelector('.source-context'));
  document.body.classList.toggle('source-sidebar-closed',mobileSidebar.matches);
  updateSidebarButtons(!mobileSidebar.matches);
  const entryAt = line => current?.toc?.findLast(entry=>entry.line<=line);
  function trackToc(line) {
    const entry=entryAt(line);
    if(entry?.id===activeTocId)return;
    activeTocId=entry?.id;
    for(const row of $('toc-list').querySelectorAll('.toc-entry')) {
      const active=row.dataset.tocId===activeTocId;
      row.setAttribute('aria-current',String(active));
      if(active){
        const group=row.closest('details');if(group)group.open=true;
        if(!$('toc-panel').hidden && (!mobileSidebar.matches||document.body.classList.contains('source-sidebar-open'))){
          const box=$('source-sidebar').getBoundingClientRect(),rect=row.getBoundingClientRect();
          if(rect.top<box.top+110||rect.bottom>box.bottom)$('source-sidebar').scrollTop+=rect.top-box.top-130;
        }
      }
    }
  }
  function renderToc() {
    const entries=current?.toc??[], filter=compact($('toc-filter').value).toLowerCase();
    $('toc-list').replaceChildren();
    $('toc-tab').hidden=!entries.length;$('source-toc-toggle').hidden=!entries.length;
    updateSidebarButtons(!document.body.classList.contains('source-sidebar-closed'));
    if(!entries.length){selectSidebarTab('bookmarks');document.body.classList.add('source-sidebar-closed');return;}
    let group,groupEntries=[];
    function flush(){
      if(!group)return;
      const matches=groupEntries.filter(entry=>compact(entry.title).toLowerCase().includes(filter));
      if(!matches.length)return;
      const details=node('details'),summary=node('summary',group.title);
      details.open=Boolean(filter)||groupEntries.some(entry=>entry.id===entryAt(readingLine()??range.from)?.id);
      details.append(summary);
      for(const entry of matches){
        const row=node('div',undefined,`toc-entry toc-level-${entry.level}`);row.dataset.tocId=entry.id;
        const jump=node('a',entry.title);jump.href=`#${hashFor(current.bookId,entry.line,entry.line)}`;jump.dataset.tocLine=entry.line;
        if(entry.date)jump.title=entry.date;
        jump.addEventListener('click',event=>{event.preventDefault();sidebarJump(entry.line);});row.append(jump);
        const links=node('div',undefined,'toc-study-links');
        for(const [output,label] of [[entry.unitOutput,'精读 ↗'],[entry.readerOutput,'伴读 ↗']])if(output){const link=node('a',label);link.href=`./${output}`;links.append(link);}
        row.append(links);details.append(row);
      }
      $('toc-list').append(details);
    }
    for(const entry of entries){if(entry.level===1){flush();group=entry;groupEntries=[];}groupEntries.push(entry);}flush();
    if(!$('toc-list').children.length)$('toc-list').append(node('p','没有匹配的篇名。'));
    activeTocId=undefined;trackToc(readingLine()??range.from);
  }
  $('toc-filter').addEventListener('input',renderToc);
  let tocTimer;
  window.addEventListener('scroll',()=>{if(!tocTimer)tocTimer=setTimeout(()=>{tocTimer=null;if(!loading)trackToc(readingLine());},150);},{passive:true});
  function renderSearchResults(query) {
    $('search-results').replaceChildren();
    const groups=new Map();
    for(const [i,result] of searchResults.entries()){
      const entry=entryAt(result.line),key=entry?.id??'front';
      if(!groups.has(key))groups.set(key,{title:entry?.title??'卷首',items:[]});groups.get(key).items.push({result,i});
    }
    for(const {title,items} of groups.values()){
      const section=node('section');section.append(node('h3',`${title} · ${items.length} 处`));
      for(const {result,i} of items){
        const link=node('a');link.href=`#${hashFor(current.bookId,result.line,result.to)}`;link.dataset.searchLine=result.line;
        link.append(node('small',`第 ${result.line} 行 · 扫描页 ${pageAt(result.line)??'未标记'}`));
        link.append(document.createTextNode(result.before),node('mark',query),document.createTextNode(result.after));
        link.addEventListener('click',event=>{event.preventDefault();searchCursor=i;sidebarJump(result.line,result.to);});section.append(link);
      }
      $('search-results').append(section);
    }
    $('search-status').textContent=`共 ${searchResults.length} 处${searchResults.length===200?'（最多显示 200 处）':''}`;
    $('search-prev').disabled=$('search-next').disabled=!searchResults.length;
  }
  async function searchBook() {
    clearTimeout(searchTimer);searchTimer=null;
    const token=++searchVersion,book=current,query=compact($('source-search').value);
    searchResults=[];searchCursor=-1;$('search-results').replaceChildren();$('search-prev').disabled=$('search-next').disabled=true;
    if(!book||!(/\p{Script=Han}/u.test(query)||/[a-z].*[a-z]/i.test(query))){$('search-status').textContent='请输入至少 1 个汉字或 2 个字母。';return;}
    try{
      for(let chunk=0;chunk<book.chunkCount;chunk++){
        $('search-status').textContent=`载入原书 ${chunk}/${book.chunkCount}`;
        await loadChunk(book.bookId,chunk);
        if(token!==searchVersion||current!==book)return;
      }
      const segments=[];let text='';
      for(let chunk=0;chunk<book.chunkCount;chunk++){
        const payload=chunks.get(`${book.bookId}/${chunk}`);
        payload.lines.forEach((line,offset)=>{
          if(!'th'.includes(payload.classes[offset])||/^==========第\d+页==========$/.test(line))return;
          const value=compact(line);if(!value)return;
          segments.push({start:text.length,end:text.length+value.length,line:chunk*book.chunkSize+offset+1});text+=value;
        });
      }
      const lineAt=offset=>{let low=0,high=segments.length-1;while(low<high){const mid=Math.floor((low+high)/2);if(segments[mid].end<=offset)low=mid+1;else high=mid;}return segments[low]?.line;};
      let offset=0;
      while(searchResults.length<200&&(offset=text.indexOf(query,offset))!==-1){
        searchResults.push({line:lineAt(offset),to:lineAt(offset+query.length-1),before:text.slice(Math.max(0,offset-20),offset),after:text.slice(offset+query.length,offset+query.length+35)});offset+=query.length;
      }
      renderSearchResults(query);
    }catch(error){if(token===searchVersion)$('search-status').textContent=error.message;}
  }
  function cycleSearch(direction){if(!searchResults.length)return;searchCursor=searchCursor<0?(direction>0?0:searchResults.length-1):(searchCursor+direction+searchResults.length)%searchResults.length;const result=searchResults[searchCursor];sidebarJump(result.line,result.to);}
  $('source-search').addEventListener('input',()=>{clearTimeout(searchTimer);searchVersion++;searchTimer=setTimeout(searchBook,250);});
  $('source-search').addEventListener('keydown',async event=>{if(event.key==='Enter'){event.preventDefault();if(searchTimer)await searchBook();cycleSearch(1);}});
  $('search-prev').addEventListener('click',()=>cycleSearch(-1));$('search-next').addEventListener('click',()=>cycleSearch(1));

  window.addEventListener('hashchange', navigate);
  navigate();
})();
