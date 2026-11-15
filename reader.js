'use strict';
(() => {
  const { fulltext, guide, ocr, questions } = JSON.parse(document.getElementById('reader-data').textContent);
  const $ = id => document.getElementById(id);
  const node = (tag, text, className) => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  };
  const link = (text, id) => { const el = node('a', text); el.href = `#${id}`; return el; };
  const button = (text, action) => { const el = node('button', text); el.type = 'button'; el.addEventListener('click', action); return el; };
  const returningQuestion = new URLSearchParams(location.search).get('question');
  if(questions?.ids.includes(returningQuestion)) {
    const back=node('a','← 返回练习题');back.id='reader-question-return';back.href=`./${questions.filename}#q=${returningQuestion}`;
    document.querySelector('.reader-header nav').append(back);
  }
  const knowledge = new Map(guide.knowledge.map(item => [item.id, item]));
  const glossary = new Map(guide.glossary.map(item => [item.id, item]));
  const anchorId = (id, index) => `a-${id}-${index}`;
  const rangesById = new Map();
  const tabs = ['path', 'knowledge', 'glossary', 'outline'];
  let currentTab = 'path';
  let activeStep = -1;
  const progressKey = 'practice-reader-progress-v1';
  let progress = { read: [], mastered: [] };
  let markGlossary = true;
  function saveProgress() {
    try { localStorage.setItem(progressKey, JSON.stringify({ ...progress, markGlossary })); } catch { /* Storage is optional. */ }
  }
  try {
    const saved = JSON.parse(localStorage.getItem(progressKey));
    if (saved && Array.isArray(saved.read) && Array.isArray(saved.mastered)) {
      markGlossary = saved.markGlossary !== false;
      progress.read = saved.read.filter(id => fulltext.paragraphs.some(p => p.id === id));
      progress.mastered = saved.mastered.filter(id => knowledge.has(id));
    }
  } catch { /* Reading remains available when storage is disabled. */ }
  function updateGlossaryMarks() {
    $('mark-glossary').checked = markGlossary;
    document.body.classList.toggle('hide-glossary-marks', !markGlossary);
  }
  updateGlossaryMarks();
  $('mark-glossary').addEventListener('change', event => {
    markGlossary = event.target.checked; updateGlossaryMarks(); saveProgress();
  });
  function updateProgress() {
    $('reader-progress').textContent = `已掌握 ${progress.mastered.length}/${knowledge.size} 知识点 · 已读 ${progress.read.length}/${fulltext.paragraphs.length} 段`;
    document.querySelectorAll('[data-read]').forEach(input => { input.checked = progress.read.includes(input.dataset.read); });
    document.querySelectorAll('[data-mastery]').forEach(el => { el.textContent = progress.mastered.includes(el.dataset.mastery) ? '已掌握 ✓' : '待检验'; });
    guide.path.forEach((step, index) => {
      const done = progress.read.includes(step.para) && step.knowledge.every(id => progress.mastered.includes(id));
      $(`path-state-${index}`).textContent = done ? '已完成 ✓' : '待完成';
    });
    saveProgress();
  }
  $('reset-progress').addEventListener('click', () => {
    progress = { read: [], mastered: [] };
    document.querySelectorAll('.knowledge-card input').forEach(input => { input.checked = false; });
    document.querySelectorAll('.knowledge-card [role="status"]').forEach(el => { el.textContent = ''; });
    updateProgress();
  });
  const canSpeak = typeof window.speechSynthesis?.speak === 'function' && typeof window.SpeechSynthesisUtterance === 'function';
  let activeSpeech;
  const stopSpeech = button('停止朗读', () => cancelSpeech()); stopSpeech.hidden = true;
  function cancelSpeech() {
    activeSpeech = undefined; stopSpeech.hidden = true;
    if (canSpeak) speechSynthesis.cancel();
  }
  function speakButton(text, label) {
    const control = button('🔊', () => {
      cancelSpeech();
      const speech = new SpeechSynthesisUtterance(text); speech.lang = 'zh-CN';
      activeSpeech = speech;
      speech.onstart = () => { if (activeSpeech === speech) stopSpeech.hidden = false; };
      speech.onend = speech.onerror = () => {
        if (activeSpeech === speech) { activeSpeech = undefined; stopSpeech.hidden = true; }
      };
      speechSynthesis.speak(speech);
    });
    control.className = 'reader-speak'; control.setAttribute('aria-label', label); return control;
  }
  if (canSpeak) {
    $('speech-controls').append(stopSpeech);
    window.addEventListener('pagehide', cancelSpeech);
  }
  function selectTab(name) {
    currentTab = name;
    tabs.forEach(tab => {
      $(`panel-${tab}`).hidden = tab !== name;
      $(`tab-${tab}`).setAttribute('aria-selected', String(tab === name));
      $(`tab-${tab}`).tabIndex = tab === name ? 0 : -1;
    });
  }
  tabs.forEach((tab, index) => {
    const el = button(['从这里开始', '知识点', '难词', '结构'][index], () => selectTab(tab));
    el.id = `tab-${tab}`;
    el.setAttribute('role', 'tab');
    el.setAttribute('aria-controls', `panel-${tab}`);
    el.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault(); selectTab(tabs[next]); $(`tab-${tabs[next]}`).focus();
    });
    $('reader-tabs').append(el);
  });
  selectTab('path');
  function focusTarget(el) {
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: el.classList.contains('reader-paragraph') ? 'start' : 'center', behavior: 'instant' });
  }
  function flash(id) {
    document.querySelectorAll('.reader-flash').forEach(el => el.classList.remove('reader-flash'));
    const range = rangesById.get(id);
    if (range) {
      const paragraph = $(range.para);
      paragraph.querySelectorAll('[data-start]').forEach(el => {
        if (Number(el.dataset.start) < range.end && Number(el.dataset.end) > range.start) el.classList.add('reader-flash');
      });
    }
    $(id)?.classList.add('reader-flash');
    focusTarget($(id));
  }
  function firstGlossaryOccurrence(item, text) {
    if (item.kind === 'pattern') {
      for (const sentence of text.matchAll(/[^。！？；]+/g)) {
        if (item.match.every(piece => sentence[0].includes(piece))) {
          return { start: sentence.index + sentence[0].indexOf(item.match[0]), match: item.match[0] };
        }
      }
      return null;
    }
    return item.match.map(match => ({ start: text.indexOf(match), match }))
      .filter(hit => hit.start >= 0).sort((a, b) => a.start - b.start || b.match.length - a.match.length)[0] ?? null;
  }
  function glossaryContent(item) {
    const box = node('div');
    const title = node('h2', item.term); title.id = 'popover-title';
    box.append(title, node('p', item.pinyin, 'glossary-pinyin'), node('p', item.meaning), node('p', `白话：${item.plain}`));
    if (item.example) box.append(node('p', item.example.includes('造句') ? item.example : `造句：${item.example}`));
    box.append(node('h3', '相关知识点'));
    item.knowledge.forEach(id => box.append(link(knowledge.get(id).title, id)));
    box.append(node('h3', '所有出现'));
    const occurrences = node('div', undefined, 'glossary-occurrences');
    for (const p of fulltext.paragraphs) {
      const hit = firstGlossaryOccurrence(item, p.text);
      if (hit) occurrences.append(link(`${p.id}：${p.text.slice(hit.start, hit.start + 24)}…`, p.id));
    }
    box.append(occurrences);
    return box;
  }
  function showGlossary(id) {
    const item = glossary.get(id);
    if (!item) return;
    selectTab('glossary');
    $('popover-content').replaceChildren(glossaryContent(item));
    if (!$('reader-popover').open) $('reader-popover').showModal();
  }
  function showNote(number) {
    const note = fulltext.footnotes.find(item => item.n === number);
    if (!note) return;
    const title = node('h2', `注释 [${number}]`); title.id = 'popover-title';
    $('popover-content').replaceChildren(title, node('p', note.text));
    if (!$('reader-popover').open) $('reader-popover').showModal();
  }
  function showShared(ids) {
    const title = node('h2', '这句话关联的知识点'); title.id = 'popover-title';
    const list = node('div', undefined, 'reader-links');
    ids.forEach(id => list.append(link(knowledge.get(id).title, id)));
    $('popover-content').replaceChildren(title, list);
    $('reader-popover').showModal();
  }
  $('close-popover').addEventListener('click', () => $('reader-popover').close());
  function navigate() {
    const id = location.hash.slice(1);
    if (glossary.has(id)) { showGlossary(id); return; }
    $('reader-popover').close();
    if (knowledge.has(id)) {
      selectTab('knowledge');
      document.querySelectorAll('.knowledge-card').forEach(el => el.classList.toggle('is-active', el.id === id));
      focusTarget($(id));
    } else if (/^n\d+$/.test(id)) showNote(Number(id.slice(1)));
    else if (id === 'reading-path') { selectTab('path'); focusTarget($('reading-path')); }
    else {
      const para = rangesById.get(id)?.para ?? id;
      const step = guide.path.findIndex(item => item.para === para);
      activeStep = step;
      renderStepBar();
      flash(id);
    }
  }
  let visits = [], visitIndex = -1, visitSerial = 0, renderedHash = '';
  function captureVisit() {
    if (visitIndex < 0) return;
    Object.assign(visits[visitIndex], { x: scrollX, y: scrollY, panelY: $('reader-panel').scrollTop, tab: currentTab, step: activeStep, focus: document.activeElement?.id });
  }
  function showVisit(visit) {
    navigate(); renderedHash = location.hash;
    if (visit?.y !== undefined) {
      selectTab(visit.tab); activeStep = visit.step; renderStepBar();
      $(visit.focus)?.focus({ preventScroll: true });
      $('reader-panel').scrollTop = visit.panelY;
      window.scrollTo({ left: visit.x, top: visit.y, behavior: 'instant' });
    }
    $('reader-back').hidden = visitIndex <= 0;
    $('popover-back').disabled = visitIndex <= 0;
  }
  function jump(id) {
    captureVisit();
    visits = visits.slice(0, visitIndex + 1);
    const visit = { key: ++visitSerial };
    visits.push(visit); if (visits.length > 30) visits.shift();
    visitIndex = visits.length - 1;
    history.pushState({ readerVisit: visit.key }, '', `#${id}`);
    showVisit();
  }
  document.addEventListener('click', event => {
    const a = event.target.closest('a[href^="#"]');
    if (a && !event.ctrlKey && !event.metaKey && !event.shiftKey && event.button === 0) { event.preventDefault(); jump(a.hash.slice(1)); }
  });
  $('reader-back').addEventListener('click', () => history.back());
  $('popover-back').addEventListener('click', () => history.back());
  window.addEventListener('popstate', event => {
    captureVisit();
    const existing = visits.findIndex(visit => visit.key === event.state?.readerVisit);
    if (existing >= 0) visitIndex = existing;
    else {
      visits = visits.slice(0, visitIndex + 1);
      visits.push({ key: ++visitSerial });
      if (visits.length > 30) visits.shift();
      visitIndex = visits.length - 1;
      history.replaceState({ readerVisit: visitSerial }, '', location.href);
    }
    showVisit(visits[visitIndex]);
  });
  window.addEventListener('hashchange', () => { if (location.hash !== renderedHash) showVisit(); });
  history.scrollRestoration = 'manual';
  function renderStepBar() {
    const bar = $('path-step-bar'); bar.replaceChildren(); bar.hidden = activeStep < 0;
    if (activeStep < 0) return;
    bar.append(node('strong', `第 ${activeStep + 1}/${guide.path.length} 步`));
    const previous = button('上一步', () => jump(guide.path[activeStep - 1].para)); previous.disabled = activeStep === 0;
    const next = button('下一步', () => jump(guide.path[activeStep + 1].para)); next.disabled = activeStep === guide.path.length - 1;
    previous.id = 'path-previous'; next.id = 'path-next';
    bar.append(previous, next, link('回到路线', 'reading-path'));
  }
  $('reader-subtitle').textContent = `${fulltext.subtitle} ${fulltext.date}`;
  $('reader-source').textContent = `${fulltext.source.site} · ${fulltext.source.note}`;
  for (const paragraph of fulltext.paragraphs) {
    const section = node('section', undefined, 'reader-paragraph'); section.id = paragraph.id; section.tabIndex = -1;
    section.append(link(`${String(paragraph.n).padStart(2, '0')}${paragraph.kind === 'editor-note' ? ' · 编者题解' : ''}`, paragraph.id));
    const text = node('p', undefined, 'original-text');
    const ranges = [];
    const addRange = (quote, values) => {
      const start = paragraph.text.indexOf(quote);
      if (start < 0) return;
      const range = { start, end: start + quote.length, ...values };
      ranges.push(range);
      if (range.id) rangesById.set(range.id, { ...range, para: paragraph.id });
    };
    guide.knowledge.forEach(item => item.anchors.forEach((anchor, index) => {
      if (anchor.para === paragraph.id) addRange(anchor.quote, { kind: 'knowledge', key: item.id, id: anchorId(item.id, index) });
    }));
    Object.entries(guide.excerptMap).forEach(([id, anchor]) => {
      if (anchor.para === paragraph.id) addRange(anchor.quote, { kind: 'excerpt', id: `q-${id}` });
    });
    const help = guide.paragraphs[paragraph.id];
    help?.chunks?.forEach((chunk, index) => addRange(chunk.quote, { kind: 'chunk', id: `chunk-${paragraph.id}-${index}` }));
    const terms = guide.glossary.map(item => ({ item, hit: firstGlossaryOccurrence(item, paragraph.text) }))
      .filter(({ hit }) => hit).sort((a, b) => b.hit.match.length - a.hit.match.length);
    for (const { item, hit } of terms) {
      const start = hit.start, end = start + hit.match.length;
      if (!ranges.some(r => r.kind === 'knowledge' && ((r.start > start && r.start < end) || (r.end > start && r.end < end)))) {
        ranges.push({ start, end, kind: 'glossary', key: item.id });
      }
    }
    for (const match of paragraph.text.matchAll(/\[(\d+)\]/g)) ranges.push({ start: match.index, end: match.index + match[0].length, kind: 'note', key: Number(match[1]) });
    // Split only at annotation boundaries; crossing quotes share text without duplicating it.
    const points = [...new Set([0, paragraph.text.length, ...ranges.flatMap(r => [r.start, r.end])])].sort((a, b) => a - b);
    for (let i = 0; i < points.length - 1; i++) {
      const start = points[i], end = points[i + 1];
      ranges.filter(r => r.id && r.start === start).forEach(r => {
        const ids = ranges.filter(other => other.kind === 'knowledge' && other.start === r.start && other.end === r.end).map(other => other.key);
        const marker = r.kind === 'knowledge' ? button('', () => ids.length > 1 ? showShared(ids) : jump(r.key)) : node('span');
        marker.id = r.id; marker.tabIndex = r.kind === 'knowledge' ? 0 : -1;
        marker.className = r.kind === 'knowledge' ? 'anchor-target' : 'jump-target';
        if (r.kind === 'knowledge') marker.setAttribute('aria-label', `查看知识点：${knowledge.get(r.key).title}`);
        text.append(marker);
      });
      const active = ranges.filter(r => r.start <= start && r.end >= end);
      const chunk = node('span'); chunk.dataset.start = start; chunk.dataset.end = end;
      const words = active.filter(r => r.kind === 'glossary');
      const word = words[0];
      const note = active.find(r => r.kind === 'note');
      const quotes = active.filter(r => r.kind === 'knowledge');
      const value = paragraph.text.slice(start, end);
      if (note) {
        const noteLink = link(value, `n${note.key}`); noteLink.className = 'footnote-marker'; chunk.append(noteLink);
      } else if (word) {
        const a = link(value, word.key); a.className = 'glossary-match'; a.dataset.glossary = [...new Set(words.map(r => r.key))].join(' '); chunk.append(a);
      } else if (quotes.length) {
        const ids = [...new Set(quotes.map(r => r.key))];
        const a = ids.length === 1 ? link(value, ids[0]) : button(value, () => showShared(ids));
        a.className = 'knowledge-highlight'; chunk.append(a);
      } else chunk.textContent = value;
      if (quotes.length) chunk.classList.add('knowledge-quote');
      text.append(chunk);
    }
    section.append(text);
    const actions = node('div', undefined, 'paragraph-actions');
    const readLabel = node('label'); const read = node('input'); read.type = 'checkbox'; read.dataset.read = paragraph.id;
    read.addEventListener('change', () => {
      progress.read = progress.read.filter(id => id !== paragraph.id);
      if (read.checked) progress.read.push(paragraph.id);
      updateProgress();
    });
    readLabel.append(read, document.createTextNode(' 读懂了')); actions.append(readLabel);
    if (canSpeak) actions.append(speakButton(paragraph.text, `朗读第 ${paragraph.n} 段`));
    for (const id of help?.knowledge ?? []) actions.append(link(knowledge.get(id).title, id));
    if (ocr) {
      for (const [id, anchor] of Object.entries(guide.excerptMap)) {
        if (anchor.para !== paragraph.id) continue;
        const excerpt = ocr.excerpts.find(item => item.excerptId === id);
        if (!excerpt) continue;
        const original = node('a', `看 OCR 原书 · ${excerpt.label}`, 'reader-ocr-link');
        original.href = `./source.html#${new URLSearchParams({ book: ocr.bookId, from: excerpt.lineStart, to: excerpt.lineEnd, ref: `practice-reader.html#q-${id}` })}`;
        actions.append(original);
      }
    }
    section.append(actions);
    if (help) {
      const tools = node('div', undefined, 'paragraph-help');
      for (const [field, label] of [['plain', '白话'], ['gist', '要点'], ['readingTip', '读法']]) {
        if (!help[field]) continue;
        const details = node('details'); details.dataset.help = field;
        details.append(node('summary', label));
        if (field === 'plain' && help.chunks?.length) {
          help.chunks.forEach((chunk, index) => {
            const line = node('p', chunk.plain, 'reader-chunk'); line.tabIndex = 0;
            const mark = enabled => {
              const range = rangesById.get(`chunk-${paragraph.id}-${index}`);
              text.querySelectorAll('[data-start]').forEach(el => {
                if (Number(el.dataset.start) < range.end && Number(el.dataset.end) > range.start) el.classList.toggle('chunk-active', enabled);
              });
            };
            line.addEventListener('mouseenter', () => mark(true)); line.addEventListener('mouseleave', () => mark(false));
            line.addEventListener('focus', () => mark(true)); line.addEventListener('blur', () => mark(false));
            if (canSpeak) line.append(speakButton(chunk.quote, '朗读这一句原文'));
            details.append(line);
          });
        } else details.append(node('p', help[field]));
        tools.append(details);
      }
      section.append(tools);
    }
    $('reader-text').append(section);
  }
  $('all-plain').addEventListener('change', event => document.querySelectorAll('[data-help="plain"]').forEach(el => { el.open = event.target.checked; }));
  guide.knowledge.forEach(item => {
    const card = node('section', undefined, 'knowledge-card'); card.id = item.id; card.tabIndex = -1;
    const mastery = node('p'); mastery.dataset.mastery = item.id; card.append(mastery);
    card.append(node('h2', item.title), node('p', item.summary, 'knowledge-summary'), node('p', item.explain));
    if (item.example) card.append(node('h3', '现代类比'), node('p', item.example));
    const terms = node('div', undefined, 'reader-links');
    item.glossary.forEach(id => terms.append(link(glossary.get(id).term, id))); card.append(terms);
    const anchors = node('div', undefined, 'reader-links');
    const questionCount=questions?.knowledgeCounts[item.id]??0;
    if(questionCount){const exercises=node('a',`相关练习 (${questionCount})`);exercises.className='knowledge-questions';exercises.href=`./${questions.filename}#k=${item.id}`;card.append(exercises);}
    item.anchors.forEach((anchor, index) => anchors.append(link(`看原文 · ${anchor.para}（${index + 1}）`, anchorId(item.id, index)))); card.append(anchors);
    const quiz = node('fieldset'); quiz.append(node('legend', item.check.question));
    const feedback = node('p'); feedback.setAttribute('role', 'status');
    item.check.options.forEach((option, index) => {
      const label = node('label'); const input = node('input'); input.type = 'radio'; input.name = `check-${item.id}`;
      input.addEventListener('change', () => { feedback.textContent = `${index === item.check.answerIndex ? '答对了' : '再想一想'}。${item.check.why}`;
        if (index === item.check.answerIndex && !progress.mastered.includes(item.id)) progress.mastered.push(item.id);
        updateProgress(); });
      label.append(input, document.createTextNode(option)); quiz.append(label);
    });
    quiz.append(feedback); card.append(quiz); $('panel-knowledge').append(card);
  });
  for (const [kind, title] of [['word', '词语'], ['function-word', '虚词'], ['pattern', '句式']]) {
    const group = node('section'); group.dataset.kind = kind; group.append(node('h2', title));
    guide.glossary.filter(item => (item.kind ?? 'word') === kind).forEach(item => {
      const row = node('p'); row.append(link(`${item.term} · ${item.pinyin}`, item.id)); group.append(row);
    });
    $('panel-glossary').append(group);
  }
  guide.path.forEach((step, index) => {
    const li = node('li'); li.append(link(`第 ${index + 1} 步 · ${step.para}`, step.para), node('p', step.why));
    const state = node('span'); state.id = `path-state-${index}`; li.append(state);
    const links = node('div', undefined, 'reader-links'); step.knowledge.forEach(id => links.append(link(knowledge.get(id).title, id))); li.append(links);
    $('path-steps').append(li);
  });
  guide.outline.forEach(item => {
    const section = node('section'); section.append(node('h2', item.title), node('p', item.purpose));
    const links = node('div', undefined, 'reader-links'); item.paras.forEach(id => links.append(link(id, id))); section.append(links); $('panel-outline').append(section);
  });
  updateProgress();
  visits.push({ key: ++visitSerial }); visitIndex = 0;
  history.replaceState({ readerVisit: visitSerial }, '', location.href);
  showVisit();
})();
