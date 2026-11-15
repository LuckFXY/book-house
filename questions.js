'use strict';
(() => {
  const data=JSON.parse(document.getElementById('questions-data').textContent);
  const {bank,unit,knowledge}=data, $=id=>document.getElementById(id);
  const node=(tag,text,className)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;};
  const button=(text,action)=>{const el=node('button',text);el.type='button';el.addEventListener('click',action);return el;};
  const questions=new Map(bank.questions.map(q=>[q.id,q])), openQuestions=new Map(bank.open.map(q=>[q.id,q]));
  const key=`question-progress-v1-${unit.id}`;
  const state={v:1,answers:{},open:{}};
  function storage(action){try{return action(localStorage);}catch{$('questions-storage').hidden=false;return null;}}
  function persist(){storage(store=>store.setItem(key,JSON.stringify(state)));}
  let saved;try{saved=JSON.parse(storage(store=>store.getItem(key)));}catch{saved=null;}
  if(saved?.v===1){
    for(const q of bank.questions){const selected=saved.answers?.[q.id]?.selected;if(Number.isInteger(selected)&&selected>=0&&selected<4)state.answers[q.id]={selected};}
    for(const q of bank.open){const value=saved.open?.[q.id];if(value&&typeof value.text==='string')state.open[q.id]={text:value.text.slice(0,20000),revealed:value.revealed===true,checks:q.points.map((_,i)=>value.checks?.[i]===true)};}
  }
  persist();
  let currentId=bank.questions[0]?.id, redo=new Set(), exam=null, timer;
  const types=[...new Set(bank.questions.map(q=>q.type))];
  $('questions-title').textContent=`${unit.title} · 练习题库`;
  for(const type of types){const option=node('option',type);option.value=type;$('filter-type').append(option);}
  for(const k of knowledge){const option=node('option',k.title);option.value=k.id;$('filter-knowledge').append(option);}
  $('knowledge-filter-label').hidden=unit.id!=='practice';
  const wrong=q=>state.answers[q.id]&&state.answers[q.id].selected!==q.answerIndex;
  function filtered(){return bank.questions.filter(q=>(!$('filter-type').value||q.type===$('filter-type').value)&&(!$('filter-difficulty').value||q.difficulty===Number($('filter-difficulty').value))&&(!$('filter-knowledge').value||q.knowledge.includes($('filter-knowledge').value))&&(!$('filter-wrong').checked||wrong(q)||redo.has(q.id)));}
  function material(q){
    const box=node('div',undefined,'question-material');
    if(q.material?.text)box.append(node('p',q.material.text));
    for(const id of q.material?.sourceIds??[]){
      const source=data.materials.find(m=>m.id===id);if(!source)continue;
      const line=node('p',`${source.publisher} · ${source.date} · ${source.title} `,'material-source');
      if(/^https?:\/\//.test(source.url)){const a=node('a','原始报道');a.href=source.url;a.target='_blank';a.rel='noopener noreferrer';line.append(a);}box.append(line);
    }
    return box;
  }
  function basis(q){
    const box=node('div',undefined,'question-basis');box.append(node('h3','依据'));
    for(const item of data.links[q.id]??[]){const a=node('a',item.label);a.href=item.href;a.dataset.basisKind=item.kind;box.append(a);}
    return box;
  }
  function questionCard(q,{mock=false}={}){
    const card=node('article',undefined,'question-card');card.dataset.questionId=q.id;
    const answer=mock?(exam?.submitted?state.answers[q.id]:null):(!redo.has(q.id)?state.answers[q.id]:null);
    card.append(node('p',`${q.type} · 难度 ${q.difficulty}`,'eyebrow'),material(q));
    const form=node('form'),group=node('fieldset'),legend=node('legend',q.stem);group.append(legend);form.addEventListener('submit',event=>event.preventDefault());
    q.options.forEach((option,i)=>{
      const row=node('div',undefined,'question-option'),label=node('label'),radio=node('input');radio.type='radio';radio.name=q.id;radio.value=i;radio.required=true;
      radio.checked=answer?.selected===i||(mock&&!exam.submitted&&exam.choices[q.id]===i);radio.disabled=Boolean(answer);
      radio.addEventListener('change',()=>{if(mock)exam.choices[q.id]=i;});
      label.append(radio,node('span',`${'ABCD'[i]}. ${option.replace(/^[A-D][.．、：:\s]+/u,'')}`));row.append(label);
      if(answer){row.append(node('p',q.whyWrong[i],'option-reason'));row.classList.toggle('correct-option',i===q.answerIndex);}
      group.append(row);
    });form.append(group);
    if(!mock){
      const submit=node('button',answer?'已作答':'确认答案');submit.type='submit';submit.disabled=Boolean(answer);form.append(submit);
      form.addEventListener('submit',event=>{
        event.preventDefault();const selected=new FormData(form).get(q.id);if(selected===null){group.querySelector('input').focus();return;}
        state.answers[q.id]={selected:Number(selected)};redo.delete(q.id);persist();renderProgress();card.replaceWith(questionCard(q));$(`feedback-${q.id}`).focus();
      });
    }
    card.append(form);
    if(answer){
      const feedback=node('div',undefined,'question-feedback');feedback.id=`feedback-${q.id}`;feedback.tabIndex=-1;feedback.setAttribute('role','status');
      feedback.append(node('h3',answer.selected===q.answerIndex?'回答正确':'回答不正确'),node('p',q.explanation),basis(q));
      if(!mock)feedback.append(button('重做本题',()=>{redo.add(q.id);renderWork();document.querySelector('.question-card input')?.focus();}));card.append(feedback);
    }
    return card;
  }
  function selectQuestion(id,retry=false){
    $('question-mode').value='single';exam=null;clearInterval(timer);
    for(const filter of ['filter-type','filter-difficulty','filter-knowledge'])$(filter).value='';$('filter-wrong').checked=false;
    currentId=id;if(retry)redo.add(id);history.replaceState(null,'',`#q=${id}`);renderWork();$('question-work').focus();
  }
  function renderProgress(){
    const answered=bank.questions.filter(q=>state.answers[q.id]),correct=answered.filter(q=>!wrong(q));
    $('questions-progress').textContent=`已答 ${answered.length}/${bank.questions.length} 题 · 答对 ${correct.length} 题`;
    const mistakes=bank.questions.filter(wrong);$('wrong-count').textContent=mistakes.length;$('wrong-list').replaceChildren();
    if(!mistakes.length)$('wrong-list').append(node('p','还没有错题。'));
    for(const q of mistakes){const row=node('p');row.append(node('span',`${q.type} · ${q.stem} `),button('重做',()=>selectQuestion(q.id,true)));$('wrong-list').append(row);}
    $('stats-content').replaceChildren();
    for(const [title,groups] of [['题型',types.map(type=>({title:type,matches:q=>q.type===type}))],['知识点',knowledge.map(k=>({title:k.title,matches:q=>q.knowledge.includes(k.id)}))]]){
      if(!groups.length)continue;
      const table=node('table'),caption=node('caption',title),head=node('tr');['分类','已答','答对'].forEach(text=>head.append(node('th',text)));table.append(caption,head);
      for(const item of groups){const row=node('tr'),done=answered.filter(item.matches);row.append(node('th',item.title),node('td',done.length),node('td',done.filter(q=>!wrong(q)).length));table.append(row);}$('stats-content').append(table);
    }
  }
  function startExam(){
    const pool=filtered().slice();for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
    exam={ids:pool.slice(0,10).map(q=>q.id),choices:{},started:Date.now(),submitted:false};renderWork();
  }
  function elapsed(){return Math.max(0,Math.floor(((exam.finished??Date.now())-exam.started)/1000));}
  function renderWork(){
    clearInterval(timer);const pool=filtered(),work=$('question-work');work.replaceChildren();$('filter-count').textContent=`当前筛选 ${pool.length} 题`;
    if($('question-mode').value==='exam'){
      const start=button(exam?'重新抽取小卷':'抽取 10 题',startExam);start.id='exam-start';start.disabled=!pool.length;work.append(start);
      if(!exam){work.append(node('p','按当前筛选随机抽题；不足 10 题时使用全部匹配题目。提交后统一查看解析。'));return;}
      const clock=node('p',undefined);clock.id='exam-clock';const tick=()=>{clock.textContent=`小卷 ${exam.ids.length} 题 · 已用时 ${elapsed()} 秒`;};tick();work.append(clock);
      if(!exam.submitted)timer=setInterval(tick,1000);
      for(const id of exam.ids)work.append(questionCard(questions.get(id),{mock:true}));
      if(!exam.submitted){
        const submit=button('提交小卷',()=>{
          const missing=exam.ids.find(id=>exam.choices[id]===undefined);
          if(missing){work.querySelector(`[data-question-id="${missing}"] input`).focus();$('filter-count').textContent='请完成所有题目后提交。';return;}
          exam.finished=Date.now();exam.submitted=true;for(const id of exam.ids)state.answers[id]={selected:exam.choices[id]};persist();renderProgress();renderWork();$('exam-result').focus();
        });submit.id='exam-submit';work.append(submit);
      }else{
        const count=exam.ids.filter(id=>exam.choices[id]===questions.get(id).answerIndex).length;
        const result=node('div',`答对 ${count}/${exam.ids.length} 题 · 得分 ${Math.round(count/exam.ids.length*100)} 分 · 用时 ${elapsed()} 秒`,'question-feedback');result.id='exam-result';result.tabIndex=-1;result.setAttribute('role','status');work.prepend(result);
      }
      return;
    }
    if(!pool.length){work.append(node('p','没有匹配的题目，请调整筛选。'));return;}
    if(!pool.some(q=>q.id===currentId))currentId=pool[0].id;
    const index=pool.findIndex(q=>q.id===currentId);work.append(node('p',`第 ${index+1}/${pool.length} 题`),questionCard(questions.get(currentId)));
    const nav=node('div',undefined,'question-actions');
    for(const [label,step] of [['上一题',-1],['下一题',1]]){const move=button(label,()=>{currentId=pool[index+step].id;history.replaceState(null,'',`#q=${currentId}`);renderWork();$('question-work').focus();});move.disabled=index+step<0||index+step>=pool.length;nav.append(move);}work.append(nav);
  }
  function renderOpen(){
    $('open-questions').replaceChildren();
    for(const [index,q] of bank.open.entries()){
      const saved=state.open[q.id]??{text:'',revealed:false,checks:q.points.map(()=>false)};
      const details=node('details');details.id=q.id;details.append(node('summary',`${q.type} · 第 ${index+1} 题`),material(q),node('p',q.prompt));
      const label=node('label','我的作答'),text=node('textarea');text.value=saved.text;text.rows=7;text.maxLength=20000;label.append(text);details.append(label);
      const save=()=>{state.open[q.id]=saved;persist();};text.addEventListener('input',()=>{saved.text=text.value;save();});
      const points=node('div',undefined,'open-points');points.hidden=!saved.revealed;
      q.points.forEach((point,i)=>{const label=node('label'),check=node('input');check.type='checkbox';check.checked=saved.checks[i];check.addEventListener('change',()=>{saved.checks[i]=check.checked;save();});label.append(check,node('span',point));points.append(label);});
      details.append(button('看参考要点',()=>{saved.revealed=true;points.hidden=false;save();}),points,basis(q));$('open-questions').append(details);
    }
  }
  function onHash(){
    const params=new URLSearchParams(location.hash.slice(1)),id=params.get('q');
    if(questions.has(id)){selectQuestion(id);return;}
    if(openQuestions.has(id)){const el=$(id);el.open=true;el.scrollIntoView({block:'start'});el.querySelector('textarea').focus();return;}
    $('filter-knowledge').value=knowledge.some(k=>k.id===params.get('k'))?params.get('k'):'';
    $('filter-type').value=types.includes(params.get('type'))?params.get('type'):'';
    $('filter-difficulty').value='';$('filter-wrong').checked=false;$('question-mode').value='single';
    exam=null;renderWork();
  }
  for(const id of ['filter-type','filter-difficulty','filter-knowledge','filter-wrong','question-mode'])$(id).addEventListener('change',()=>{exam=null;renderWork();const params=new URLSearchParams();if($('filter-knowledge').value)params.set('k',$('filter-knowledge').value);if($('filter-type').value)params.set('type',$('filter-type').value);history.replaceState(null,'',params.size?`#${params}`:location.pathname);});
  $('questions-reset').addEventListener('click',()=>{state.answers={};state.open={};redo.clear();exam=null;persist();renderProgress();renderOpen();renderWork();});
  window.addEventListener('hashchange',onHash);window.addEventListener('pagehide',()=>{persist();clearInterval(timer);});
  renderProgress();renderOpen();onHash();
})();
