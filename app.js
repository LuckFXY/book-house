'use strict';
(() => {
  const data = JSON.parse(document.getElementById('book-data').textContent);
  const presentation = data.article.presentation;
  const $ = id => document.getElementById(id);
  const excerpts = new Map(data.excerpts.map(item => [item.id, item]));
  const setText = (id, text) => { $(id).textContent = text; };
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const location = item => `${data.book.source.kind === 'txt-scan-markers' ? '文本扫描页' : '扫描页'} ${item.scanPageStart}${item.scanPageEnd !== item.scanPageStart ? `–${item.scanPageEnd}` : ''} · 第 ${item.lineStart}${item.lineEnd !== item.lineStart ? `–${item.lineEnd}` : ''} 行`;
  const sourceLink = id => {
    const item = excerpts.get(id);
    const a = element('a', 'source-link', `${item.label} ↗`);
    a.href = `#excerpt-${id}`;
    a.dataset.excerptId = id;
    return a;
  };
  const referenceLinks = ids => {
    const links = element('div', 'source-links');
    ids.forEach(id => links.append(sourceLink(id)));
    return links;
  };
  const quote = item => {
    const block = element('figure', 'source-quote');
    block.append(element('figcaption', 'excerpt-label', item.label));
    block.append(element('blockquote', '', item.text));
    const a = element('a', 'quote-location', `${location(item)} ↗`);
    a.href = `#excerpt-${item.id}`;
    a.dataset.excerptId = item.id;
    block.append(a);
    return block;
  };
  setText('article-date', data.article.date);
  setText('article-subtitle', data.article.subtitle);
  setText('core-question', data.article.question);
  setText('article-intro', data.article.intro);
  setText('article-background', data.article.background);
  $('background-refs').append(referenceLinks(data.article.backgroundExcerptIds));
  setText('editorial-note', `阅读说明 · ${data.article.editorialNote}`);
  setText('version-note', data.article.versionNote);
  setText('source-name', data.book.source.file.split('/').pop());
  setText('source-total', `${data.excerpts.length} 条精选引文`);
  setText('source-library-label', `展开全部 ${data.excerpts.length} 条精选引文`);
  setText('hero-hint', `${data.stages.length} 个${presentation ? '节点' : '阶段'} · 原文对照 · ${data.quiz.length} 道练习`);
  setText('exercise-count', `${data.quiz.length} 道情境判断`);
  $('stage-tabs').style.setProperty('--stage-count', data.stages.length);
  if (presentation) {
    document.body.classList.add('unit-page');
    const fields = {
      'book-title': data.book.title, 'entry-title': data.article.title,
      'entry-label': presentation.entryLabel, 'scope-note': presentation.scopeNote,
      'edition-label': presentation.editionLabel, 'article-subject': presentation.subject,
      'hero-title': presentation.heroTitle, 'article-author': data.book.author,
      'background-title': presentation.backgroundTitle, 'background-label': presentation.backgroundLabel,
      'route-title': presentation.routeTitle, 'route-nav': '走一遍论证的路',
      'concepts-nav': '对照关键概念', 'concepts-title': '对照关键概念。',
      'route-intro': presentation.routeIntro, 'analogy-label': presentation.analogyLabel,
      'sources-intro': presentation.sourcesIntro, 'source-location-note': ` · ${presentation.sourceLocationNote}`,
      'quote-footnote': presentation.quoteFootnote, 'exercise-intro': presentation.exerciseIntro,
      'footer-from': presentation.footerFrom, 'footer-to': presentation.footerTo,
      'footer-title': `《${data.book.title}》· ${data.article.title}`
    };
    Object.entries(fields).forEach(([id, text]) => setText(id, text));
    $('stage-tabs').setAttribute('aria-label', presentation.routeAriaLabel);
    const groups = presentation.mapGroups;
    $('map-annotation').style.gridTemplateColumns = groups.map(group => `${group.span}fr`).join(' ');
    $('map-annotation').replaceChildren(...groups.map(group => element('span', '', group.label)));
    $('map-return').hidden = !presentation.returnLabel;
    if (presentation.returnLabel) $('map-return').querySelector('span').textContent = presentation.returnLabel;
    const art = $('hero-art');
    art.classList.add('unit-hero-art');
    art.setAttribute('aria-label', presentation.heroCaption);
    art.replaceChildren();
    const flow = element('div', 'hero-flow');
    groups.forEach((group, index) => {
      const step = element('div', 'hero-flow-step');
      step.append(element('span', 'hero-flow-number', String(index + 1).padStart(2, '0')), element('span', '', group.label));
      flow.append(step);
    });
    art.append(flow, element('span', 'art-caption', presentation.heroCaption));
  }
  if (data.article.visual) {
    const visual = data.article.visual;
    const container = $('core-visual');
    const heading = element('h2', '', visual.title);
    heading.id = 'visual-title';
    const table = element('table', 'argument-table');
    table.append(element('caption', '', visual.caption));
    const head = document.createElement('thead');
    const headRow = document.createElement('tr');
    visual.columns.forEach(title => {
      const cell = element('th', '', title);
      cell.scope = 'col';
      headRow.append(cell);
    });
    head.append(headRow);
    const body = document.createElement('tbody');
    visual.rows.forEach(row => {
      const tr = document.createElement('tr');
      row.forEach(text => tr.append(element('td', '', text)));
      body.append(tr);
    });
    table.append(head, body);
    container.append(element('span', 'content-label', '结构图解 · 对照阅读'), heading, table, referenceLinks(visual.excerptIds));
    container.hidden = false;
  }
  data.book.upcoming.forEach((title, i) => {
    const row = element('div', 'upcoming-entry');
    row.append(element('span', 'entry-num', `0${i + 2}`), element('span', '', title), element('span', 'upcoming-state', '待制作'));
    $('upcoming').append(row);
  });
  let activeStage = 0;
  const stageTabs = data.stages.map((stage, index) => {
    const button = element('button', 'stage-tab');
    button.type = 'button';
    button.id = `stage-tab-${index}`;
    button.dataset.stageIndex = String(index);
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-controls', 'stage-panel');
    button.append(element('span', 'stage-number', String(index + 1).padStart(2, '0')), element('span', 'stage-name', stage.title), element('span', 'stage-mini', stage.mini ?? ['接触与行动', '感觉与印象', '概念与推理', '检验与修正', '继续向前'][index]));
    button.addEventListener('click', () => selectStage(index));
    button.addEventListener('keydown', event => {
      let next;
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % data.stages.length;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = (index + data.stages.length - 1) % data.stages.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = data.stages.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      selectStage(next);
      stageTabs[next].focus();
    });
    $('stage-tabs').append(button);
    return button;
  });
  function selectStage(index) {
    activeStage = index;
    const stage = data.stages[index];
    stageTabs.forEach((button, i) => {
      button.setAttribute('aria-selected', String(i === index));
      button.tabIndex = i === index ? 0 : -1;
    });
    $('stage-panel').setAttribute('aria-labelledby', stageTabs[index].id);
    setText('stage-tag', `编辑解释 / ${stage.tag}`);
    setText('stage-count', `${String(index + 1).padStart(2, '0')} / ${String(data.stages.length).padStart(2, '0')}`);
    setText('stage-summary', stage.summary);
    setText('stage-explanation', stage.explanation);
    setText('stage-analogy', stage.analogy);
    setText('stage-prompt', stage.prompt);
    $('stage-excerpts').replaceChildren(...stage.excerptIds.map(id => quote(excerpts.get(id))));
    $('previous-stage').disabled = index === 0;
    $('next-stage').disabled = index === data.stages.length - 1;
    setText('stage-announcement', `第 ${index + 1} 阶段：${stage.title}。${stage.summary}`);
  }
  $('previous-stage').addEventListener('click', () => {
    if (activeStage > 0) selectStage(activeStage - 1);
    if ($('previous-stage').disabled) $('stage-panel').focus({ preventScroll: true });
  });
  $('next-stage').addEventListener('click', () => {
    if (activeStage < data.stages.length - 1) selectStage(activeStage + 1);
    if ($('next-stage').disabled) $('stage-panel').focus({ preventScroll: true });
  });
  selectStage(0);
  data.comparisons.forEach((item, index) => {
    const article = element('article', 'comparison');
    const heading = element('h3', 'comparison-heading');
    heading.append(element('span', '', `0${index + 1}`), document.createTextNode(item.title));
    article.append(heading);
    const pair = element('div', 'comparison-pair');
    for (const side of ['left', 'right']) {
      const column = element('div', `comparison-side ${side}`);
      column.append(element('h4', '', item[`${side}Title`]), element('p', '', item[side]));
      pair.append(column);
    }
    article.append(pair, element('p', 'comparison-relation', item.relation), referenceLinks(item.excerptIds));
    $('comparison-list').append(article);
  });
  data.excerpts.forEach((item, index) => {
    const li = element('li', 'excerpt-item');
    li.id = `excerpt-${item.id}`;
    li.tabIndex = -1;
    const header = element('div', 'excerpt-item-head');
    header.append(element('span', 'excerpt-index', String(index + 1).padStart(2, '0')), element('h3', '', item.label));
    li.append(header, element('blockquote', '', item.text), element('p', 'excerpt-source', `${item.sourceType} · OCR 原文 · ${location(item)}`));
    $('excerpt-list').append(li);
  });
  function revealExcerpt(id) {
    const target = $(`excerpt-${id}`);
    if (!target) return;
    $('source-library').open = true;
    requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: 'instant', block: 'start' });
      target.focus({ preventScroll: true });
    });
  }
  document.addEventListener('click', event => {
    const link = event.target.closest('a[data-excerpt-id]');
    if (!link) return;
    event.preventDefault();
    window.location.hash = `excerpt-${link.dataset.excerptId}`;
    revealExcerpt(link.dataset.excerptId);
  });
  const revealHash = () => {
    const match = window.location.hash.match(/^#excerpt-(.+)$/);
    if (match && excerpts.has(match[1])) revealExcerpt(match[1]);
  };
  window.addEventListener('hashchange', revealHash);
  revealHash();
  data.quiz.forEach((item, index) => {
    const fieldset = element('fieldset', 'quiz-question');
    fieldset.id = item.id;
    const legend = element('legend');
    legend.append(element('span', 'question-number', `问题 0${index + 1}`), document.createTextNode(item.question));
    fieldset.append(legend);
    item.options.forEach((option, optionIndex) => {
      const label = element('label', 'quiz-option');
      const input = document.createElement('input');
      input.type = 'radio';
      input.name = item.id;
      input.value = String(optionIndex);
      input.id = `${item.id}-${optionIndex}`;
      input.required = true;
      label.append(input, element('span', 'option-letter', String.fromCharCode(65 + optionIndex)), element('span', '', option));
      fieldset.append(label);
    });
    const feedback = element('div', 'question-feedback');
    feedback.id = `${item.id}-feedback`;
    feedback.hidden = true;
    fieldset.append(feedback);
    $('quiz-questions').append(fieldset);
  });
  let submitted = false;
  function clearResults() {
    data.quiz.forEach(item => {
      const fieldset = $(item.id);
      fieldset.classList.remove('is-correct', 'is-incorrect', 'is-unanswered');
      fieldset.removeAttribute('aria-describedby');
      const feedback = $(`${item.id}-feedback`);
      feedback.hidden = true;
      feedback.replaceChildren();
    });
    setText('quiz-submit', '提交，看看理解到哪一步 ↗');
    setText('quiz-status', '');
    $('quiz-status').classList.remove('complete');
    submitted = false;
  }
  $('quiz-form').addEventListener('submit', event => {
    event.preventDefault();
    const answers = new FormData($('quiz-form'));
    const missing = data.quiz.filter(item => !answers.has(item.id));
    if (missing.length) {
      clearResults();
      missing.forEach(item => $(item.id).classList.add('is-unanswered'));
      setText('quiz-status', `还没有完成：请先回答全部 ${data.quiz.length} 道题（尚有 ${missing.length} 道未作答），再提交查看解释。`);
      $(missing[0].id).querySelector('input').focus({ preventScroll: true });
      $('quiz-status').scrollIntoView({ behavior: 'instant', block: 'center' });
      return;
    }
    let correct = 0;
    data.quiz.forEach(item => {
      const fieldset = $(item.id);
      const isCorrect = Number(answers.get(item.id)) === item.answerIndex;
      correct += Number(isCorrect);
      fieldset.classList.remove('is-correct', 'is-incorrect', 'is-unanswered');
      fieldset.classList.add(isCorrect ? 'is-correct' : 'is-incorrect');
      const feedback = $(`${item.id}-feedback`);
      const result = element('p', 'answer-result', isCorrect ? '✓ 理解正确' : `再想一步 · 正确选项为 ${String.fromCharCode(65 + item.answerIndex)}`);
      feedback.replaceChildren(result, element('p', '', item.explanation), referenceLinks(item.excerptIds));
      feedback.hidden = false;
      fieldset.setAttribute('aria-describedby', feedback.id);
    });
    submitted = true;
    setText('quiz-status', correct === data.quiz.length ? `${correct} / ${data.quiz.length} · 全部答对。你已走完这条${presentation ? '阅读' : '认识'}的路；也可以回到原文，继续深化理解。` : `${correct} / ${data.quiz.length} · 已完成本次练习。看看下面各题的解释，调整选项后可再次提交。`);
    $('quiz-status').classList.toggle('complete', correct === data.quiz.length);
    setText('quiz-submit', '再次提交，检验理解 ↗');
    $('quiz-status').scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  $('quiz-form').addEventListener('change', event => {
    if (event.target.type !== 'radio') return;
    if (submitted) {
      clearResults();
      setText('quiz-status', '选项已修改，请重新提交查看本次结果。');
    }
    event.target.closest('fieldset').classList.remove('is-unanswered');
  });
  $('quiz-reset').addEventListener('click', () => {
    $('quiz-form').reset();
    clearResults();
    setText('quiz-status', '练习已重置，可以重新作答。');
  });
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      document.querySelectorAll('.section-nav a').forEach(a => {
        if (a.hash === `#${visible.target.id}`) a.setAttribute('aria-current', 'location');
        else a.removeAttribute('aria-current');
      });
    }, { rootMargin: '-10% 0px -60% 0px', threshold: [0, 0.1, 0.3] });
    ['overview', 'route', 'concepts', 'sources', 'exercise'].forEach(id => observer.observe($(id)));
  }
})();
