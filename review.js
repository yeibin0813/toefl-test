/* 다시 보기 화면 그리기: 학생 페이지(index.html)와 관리자 페이지(admin.html)가 함께 쓴다.
   쓰는 쪽에서 esc, LET, LC_TYPE을 정의한다. V = { r: 기록(rows에 문항별 답), content: 서버가 보낸 문제, onlyWrong, seen: 그린 문항 키 }
   그리는 함수들은 화면에 그린 문항을 V.seen에 적는다. */
// 보기에 붙는 '내 답' 표시 (관리자 페이지는 '학생 답')
let RV_MINE = '내 답';
// 펼친 스크립트는 화면을 다시 그려도 펼친 채로 둔다 (toggle은 버블링되지 않아서 capture로 받는다)
const RV_OPEN = new Set();
document.addEventListener('toggle', ev => { const d = ev.target; if (d.dataset && d.dataset.sk) RV_OPEN[d.open ? 'add' : 'delete'](d.dataset.sk); }, true);

// 리딩 섹션 이름 (서버 RC_SEC_NAME과 같다). 섹션만 골라 푼 예전 기록의 이름에 쓴다
const RC_SEC = { words: 'Complete the Words', daily: 'Daily Life', academic: 'Academic Passage' };
const rcSecNames = secs => (secs || []).map(s => RC_SEC[s] || s).join(' · ');
// 모아 풀기 (서버 PRAC_NAME과 같다). practice.sec이 없으면 빈칸
const PRAC_NAME = { words: '빈칸', daily: 'Daily Life', academic: 'Academic' };
const pracName = p => PRAC_NAME[(p && p.sec) || 'words'] || '빈칸';
const BLANK = /\[(\d+)\]/g;
function blanksOf(set) { const out = []; let i = 0; set.text.replace(BLANK, (a, len) => { out.push({ n: set.start + i++, len: +len }); return a; }); return out; }
const rowMap = rows => { const by = {}; rows.forEach(x => { by[x.k] = x; }); return by; };
// 리딩: 모듈마다 지문 순서대로
function rcReviewBody(V) {
  const r = V.r, by = rowMap(r.rows);
  return V.content.test.modules.map((m, mi) => {
    if (r.module != null && mi !== r.module) return '';
    const html = m.sets.map(s => (s.type === 'words' ? rvWords(s, mi, by, V, '') : rvRead(s, mi, by, V))).join('');
    return html ? `<section class="stack"><h3 class="rvmod">${esc(m.name)}</h3>${html}</section>` : '';
  }).join('');
}
// 구문단어: 단어 → 구문 순서로, 소제목마다 뜻 · 쓴 답 · 정답(틀렸고 정답 공개일 때만 x.correct가 있다). 뜻(ko)과 소제목 번호(h)는 기록 줄에 있다
function vocReviewBody(V) {
  const heads = (V.r.voc && V.r.voc.heads) || [];
  return [['v', '단어'], ['p', '구문']].map(([kind, name]) => {
    const rows = V.r.rows.filter(x => x.kind === kind); rows.forEach(x => V.seen && V.seen.add(x.k));
    const shown = rows.filter(x => !V.onlyWrong || !x.ok);
    if (!shown.length) return '';
    let last = null;
    return `<section class="stack"><h3 class="rvmod">${name} <span class="note num">${rows.filter(x => x.ok).length}/${rows.length}</span></h3><ul class="vlist sheet">${shown.map(x => {
      const hd = x.h !== last && heads[x.h] ? `<li class="vhead">${esc(heads[x.h])}</li>` : ''; last = x.h;
      return hd + `<li class="vrow${x.ok ? '' : ' bad'}"><span class="mark ${x.ok ? 'ok' : 'bad'}">${x.ok ? 'O' : 'X'}<span class="sr">${x.ok ? ' 맞음' : ' 틀림'}</span></span><span class="num vn">${x.n}.</span><span class="vko">${esc(x.ko || '')}</span>
        <span class="vans"><span class="${x.given ? '' : 'note'}">${x.given ? esc(x.given) : '(빈칸)'}</span>${!x.ok && x.correct ? `<span class="tag ok">정답</span><b>${esc(x.correct)}</b>` : ''}</span></li>`; }).join('')}</ul></section>`;
  }).join('');
}
// 모아 풀기: 회차·모듈마다 지문 (빈칸 또는 리딩)
function wordsReviewBody(V) {
  const by = rowMap(V.r.rows);
  return V.content.sets.map(s => { const kp = s.t + '-' + s.mi, where = `TEST ${esc(s.t)} · Module ${s.mi + 1}`;
    return s.type === 'read' ? rvRead(s, kp, by, V, where) : rvWords(s, kp, by, V, where); }).join('');
}
// 리딩 해설 (서버가 정답 공개일 때, 푼 문항 것만 답 키로 보낸다)
const rvX = (V, k) => { const t = V.content && V.content.x && V.content.x[k]; return t ? { exp: t } : null; };
// 빈칸 해설 목록: 틀린 칸은 펼쳐 두고, 맞힌 칸은 접어 둔다 (틀린 것만 보기면 맞힌 칸은 뺀다)
function rvWordsX(bl, xs, kp, V) {
  const all = bl.map((b, j) => ({ b, x: xs[j], t: (rvX(V, kp + '-' + b.n) || {}).exp })).filter(o => o.x && o.t);
  if (!all.length) return '';
  const li = o => `<li><span class="num">${o.b.n}.</span> ${esc(o.t)}</li>`, bad = all.filter(o => !o.x.ok), good = V.onlyWrong ? [] : all.filter(o => o.x.ok);
  if (!bad.length && !good.length) return '';
  return `<div class="rvx"><b>해설</b>${bad.length ? `<ul class="rvwx">${bad.map(li).join('')}</ul>` : ''}${good.length ? `<details class="rvwx"><summary>맞힌 칸 해설 ${good.length}개</summary><ul class="rvwx">${good.map(li).join('')}</ul></details>` : ''}</div>`;
}
// 빈칸 지문 하나: 낸 글자를 채워 넣고, 틀린 칸은 정답(정답 공개일 때)을 옆에 붙인다. kp는 답 키 앞부분 ("0" 또는 "7-0")
function rvWords(set, kp, by, V, title) {
  const bl = blanksOf(set), xs = bl.map(b => by[kp + '-' + b.n]);
  xs.forEach(x => x && V.seen.add(x.k));
  if (!xs.some(Boolean) || (V.onlyWrong && !xs.some(x => x && !x.ok))) return '';
  let i = 0;
  const html = esc(set.text).replace(/(\S*?)\[(\d+)\]/g, (a, pre, len) => {
    const b = bl[i++], x = by[kp + '-' + b.n], gap = '_'.repeat(+len);
    if (!x) return `<span class="wd">${pre}<span class="rvb">${gap}</span></span>`;
    const fix = !x.ok && x.correct ? `<span class="rvb fix">${esc(x.correct)}</span>` : '';
    return `<span class="wd">${pre}<span class="rvb ${x.ok ? 'ok' : x.given ? 'bad' : 'bad none'}">${x.given ? esc(x.given) : gap}</span>${fix}<span class="sr"> (${b.n}번 ${x.ok ? '맞음' : '틀림'}${fix ? ', 정답 ' + esc(x.correct) : ''})</span></span>`;
  });
  return `<div class="sheet words rvwords">${title ? `<div class="eyebrow">${title}</div>` : ''}${html}</div>${rvWordsX(bl, xs, kp, V)}`;
}
// 리딩 지문 하나와 그 문제들. kp는 답 키 앞부분 (모듈 번호 "0" 또는 모아 풀기의 "7-0"), where는 지문 위에 붙일 회차·모듈 표시. 문장 넣기 문제가 있으면 지문의 ■ 자리에 A~D를 붙이고, 내가 고른 자리와 정답 자리를 칠한다.
function rvRead(set, kp, by, V, where) {
  set.questions.forEach(q => { const x = by[kp + '-' + q.n]; if (x) V.seen.add(x.k); });
  const qs = set.questions.filter(q => { const x = by[kp + '-' + q.n]; return x && (!V.onlyWrong || !x.ok); });
  if (!qs.length) return '';
  const ins = set.questions.find(q => q.insert), ix = ins && by[kp + '-' + ins.n];
  let i = 0;
  const mark = () => { const L = LET[i++] || '', c = ix ? (ix.given === L ? (ix.ok ? ' mine' : ' mine bad') : '') + (ix.correct === L ? ' right' : '') : '';
    return `<span class="insmark${c}">■ ${L}</span>`; };
  const passage = set.passage.split(/\n\n/).map(p => {
    const h = esc(p).replace(/\n/g, '<br>');
    return `<p>${ins ? h.replace(/■/g, mark) : h.replace(/ ?■ ?/g, ' ').replace(/ {2,}/g, ' ').trim()}</p>`;
  }).join('');
  const cards = qs.map(q => rvChoice(q.n, q.insert ? '다음 문장이 들어갈 가장 알맞은 위치를 고르세요.' : q.q, q.insert ? LET.map(L => `위치 ■ ${L}`) : q.c,
    by[kp + '-' + q.n], q.insert ? `<div class="insert-sent">${esc(q.insert)}</div>` : '', rvX(V, kp + '-' + q.n))).join('');
  return `<div class="split rvsplit"><div class="sheet passage">${set.kind || where ? `<div class="eyebrow">${where ? where + (set.kind ? ' · ' : '') : ''}${esc(set.kind || '')}</div>` : ''}${set.title ? `<h3>${esc(set.title)}</h3>` : ''}${passage}</div>
    <div class="stack">${cards}</div></div>`;
}
// 객관식 한 문제: 내 답과 정답(정답 공개일 때만 x.correct가 있다)을 표시한다
// ex: 리스닝 해설 { qk 질문 해석, type 문항 유형, ok 보기 해석, ul 보기별 함정 표현, exp 해설 } (정답 공개일 때만 서버가 보낸다)
function rvChoice(n, text, choices, x, extra, ex) {
  ex = ex || {};
  return `<div class="sheet rvq${x.ok ? '' : ' wrong'}"><div class="rvqh"><span class="mark ${x.ok ? 'ok' : 'bad'}">${x.ok ? 'O' : 'X'}<span class="sr">${x.ok ? ' 맞음' : ' 틀림'}</span></span>
    <span><span class="num">${n}.</span> ${esc(text)}${ex.qk ? `<span class="ko">${esc(ex.qk)}</span>` : ''}</span></div>${extra || ''}
    <div class="opts">${choices.map((c, ci) => { const L = LET[ci], mine = x.given === L, right = x.correct === L, ko = ex.ok && ex.ok[ci];
      return `<div class="opt rv${mine ? (x.ok ? ' mine' : ' mine bad') : ''}${right ? ' right' : ''}"><b>(${L})</b><span>${trapText(c, ex.ul && ex.ul[ci])}${ko ? `<span class="ko">${esc(ko)}</span>` : ''}</span>${mine ? `<span class="tag">${RV_MINE}</span>` : ''}${right ? '<span class="tag ok">정답</span>' : ''}</div>`; }).join('')}</div>
    ${x.given ? '' : '<div class="note">답을 고르지 않았어요.</div>'}${ex.exp ? `<div class="rvx"><b>해설</b>${ex.type ? `<span class="rvtype">${esc(ex.type)}</span>` : ''}<p>${rvExp(ex.exp)}</p></div>` : ''}</div>`;
}
// 해설 본문: **굵게**, 줄 첫머리의 "(A) 언급 없음." "(B) 정답." 같은 꼬리표와 "Paraphrasing:"은 굵게
const rvExp = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^(\([A-D]\) [^.\n]{1,20}\.|Paraphrasing:)/gm, '<b class="tagl">$1</b>');
// 보기에서 오답 함정 표현(phrases)에 밑줄. 원문 위치로 표시한 뒤 한 글자씩 이스케이프해서 태그가 겹치지 않게 한다.
function trapText(text, phrases) {
  const low = String(text).toLowerCase(), on = new Array(low.length).fill(false);
  (phrases || []).forEach(p => { p = String(p || ''); const i = p ? low.indexOf(p.toLowerCase()) : -1; for (let k = i; i >= 0 && k < i + p.length; k++) on[k] = true; });
  let out = '', u = false;
  for (let k = 0; k < low.length; k++) { if (on[k] !== u) { out += on[k] ? '<u class="trap">' : '</u>'; u = on[k]; } out += esc(text[k]); }
  return out + (u ? '</u>' : '');
}

// 기록이 다루는 모듈들 (Module 1 + 2 이어 풀기 기록은 module이 null이고, 채점된 문항이 있는 모듈만)
const rvMods = (r, t) => { if (r.module != null) return [r.module];
  const ms = [...new Set(r.rows.map(x => x.mi))].filter(i => i === 0 || i === 1).sort(); return ms.length ? ms : t.modules.map((m, i) => i); };
// 스크립트를 말차례(대화)·한두 문장씩 영어와 해석으로. 문항의 근거 문장(ev) 앞에 ⟨문항-정답⟩ 표시를 붙인다.
function rvLines(lines, qs) {
  const fold = s => String(s).replace(/[’‘]/g, "'").replace(/[“”]/g, '"').replace(/\u2028/g, ' ');
  const marks = lines.map(() => []);
  qs.forEach(([q, e, x]) => {
    if (!e || !e.ev || !x) return;
    for (const probe of [fold(e.ev), fold(e.ev).slice(0, 30)]) {
      const li = lines.findIndex(l => fold(l.en).includes(probe));
      if (li >= 0) { marks[li].push({ at: fold(lines[li].en).indexOf(probe), len: probe.length, tag: `${q.n}-${x.correct || '?'}` }); return; }
    }
  });
  return `<div class="rvlines">${lines.map((l, li) => {
    let en = '', pos = 0;
    marks[li].sort((a, b) => a.at - b.at).forEach(m => { if (m.at < pos) return; en += esc(l.en.slice(pos, m.at)) + `<span class="evmark">⟨${esc(m.tag)}⟩</span><span class="evd">${esc(l.en.slice(m.at, m.at + m.len))}</span>`; pos = m.at + m.len; });
    en += esc(l.en.slice(pos));
    return `<div class="ln"><span class="sp">${l.sp === 'M' ? '남' : l.sp === 'W' ? '여' : ''}</span><div><p class="en">${en}</p><p class="ko">${esc(l.ko)}</p></div></div>`;
  }).join('')}</div>`;
}
// 리스닝 문제: 모듈마다 문항 묶음별로 스크립트(해설이 있으면)와 문제. player(mi, it)는 묶음마다 붙일 재생기 HTML (관리자 화면은 없음)
function lcReviewItems(V, player) {
  // ex: 해설 { i: { "모듈:첫 문항": { s: 원문, l: [{ sp, en, ko }] } }, q: { "모듈-문항": { qk, type, ok, ul, ev, exp } } }
  const r = V.r, t = V.content.test, mods = rvMods(r, t), by = rowMap(r.rows), ex = V.content.extra || { i: {}, q: {} };
  if (!mods.length || mods.some(mi => !t.modules[mi])) return '';
  return mods.map(mi => {
    const items = t.modules[mi].items.map(it => {
      it.questions.forEach(q => { const x = by[mi + '-' + q.n]; if (x) V.seen.add(x.k); });
      const qs = it.questions.filter(q => { const x = by[mi + '-' + q.n]; return x && (!V.onlyWrong || !x.ok); });
      if (!qs.length) return '';
      const ix = ex.i[mi + ':' + it.from] || {}, sk = r.id + '|' + mi + ':' + it.from;
      return `<section class="stack rvitem"><div class="qhead" style="margin:0"><h3>${esc(it.heading)}</h3><span class="note num">${LC_TYPE[it.type] || ''} · ${it.from === it.to ? `Question ${it.from}` : `Questions ${it.from}–${it.to}`}</span></div>
        ${player(mi, it)}
        ${it.type === 'response' || !(ix.l || ix.s) ? '' : `<details class="rvscript" data-sk="${esc(sk)}"${RV_OPEN.has(sk) ? ' open' : ''}>${ix.l
          ? `<summary>스크립트 · 해석 보기</summary>${rvLines(ix.l, it.questions.map(q => [q, ex.q[mi + '-' + q.n], by[mi + '-' + q.n]]))}`
          : `<summary>스크립트 보기</summary><p class="rvplain">${esc(ix.s)}</p>`}</details>`}
        ${qs.map(q => rvChoice(q.n, q.q || (it.type === 'response' && ix.s ? ix.s : '가장 알맞은 응답을 고르세요.'), q.c, by[mi + '-' + q.n], '', ex.q[mi + '-' + q.n])).join('')}</section>`;
    }).join('');
    return items && mods.length > 1 ? `<h3 class="rvmod">${esc(t.modules[mi].name)}</h3>${items}` : items;
  }).join('');
}
// 라이팅 문제 글: 이메일(상황·지시)과 토론(질문·교수·학생 글)
const wrEmail = m => `<p class="wrq">${esc(m.situation)}</p><p class="wrq">${esc(m.task)}</p>`;
const wrDisc = d => `<p class="wrq">${esc(d.question)}</p><div class="wrpost prof"><b>${esc(d.prof.name)}</b><p>${esc(d.prof.text)}</p></div>
  ${d.students.map(s => `<div class="wrpost"><b>${esc(s.name)}</b><p>${esc(s.text)}</p></div>`).join('')}`;
// 라이팅 다시 보기: 재배열은 앞 문장·만든 문장·정답(정답 공개일 때), 이메일·토론은 문제·쓴 글·모범 답안(정답 공개일 때)
function wrReviewBody(V) {
  const by = rowMap(V.r.rows), w = V.content.wr, es = V.content.essays || {}, mine = RV_MINE === '내 답' ? '내 글' : '학생 글';
  const build = w.build.map(b => {
    const x = by['0-' + b.n]; if (!x) return ''; V.seen.add(x.k);
    if (V.onlyWrong && x.ok) return '';
    return `<div class="sheet rvq${x.ok ? '' : ' wrong'}"><div class="rvqh"><span class="mark ${x.ok ? 'ok' : 'bad'}">${x.ok ? 'O' : 'X'}<span class="sr">${x.ok ? ' 맞음' : ' 틀림'}</span></span>
      <span><span class="num">${b.n}.</span> ${esc(b.ctx)}</span></div>
      <div class="wrsent"><span class="tag">${RV_MINE}</span>${x.given ? esc(x.given) : '<span class="note">문장을 만들지 않았어요.</span>'}</div>
      ${x.correct && !x.ok ? `<div class="wrsent ok"><span class="tag ok">정답</span>${esc(x.correct)}</div>` : ''}
      ${wrBuildX(w.x, b.n)}</div>`;
  }).join('');
  const essay = (title, prompt, text, model, xo) => `<section class="stack"><h3 class="rvmod">${title}</h3><div class="sheet stack">${prompt}</div>
    <div class="wrbox"><div class="eyebrow">${mine} · ${(String(text || '').trim().match(/\S+/g) || []).length}단어</div><p>${text ? esc(text) : '<span class="note">쓰지 않았어요.</span>'}</p></div>
    ${model ? `<div class="wrbox model"><div class="eyebrow">모범 답안</div><p>${esc(model)}</p></div>${wrModelX(xo)}` : ''}</section>`;
  const x = w.x || {};
  return `<section class="stack"><h3 class="rvmod">재배열</h3>${build || '<div class="tablebox"><div class="empty">틀린 문항이 없어요.</div></div>'}</section>`
    + essay('이메일', wrEmail(w.email), es.email, w.email.model, x.email) + essay('토론', wrDisc(w.disc), es.disc, w.disc.model, x.disc);
}
// 라이팅 해설 (해설지가 열렸을 때만 서버가 보낸다): 재배열 한 문항의 해설, 모범 답안의 해석·구성·핵심 표현
const wrBuildX = (x, n) => { const t = x && x.build && x.build[n]; return t ? `<div class="rvx"><b>해설</b><p>${esc(t)}</p></div>` : ''; };
function wrModelX(xo) {
  if (!xo || !xo.ko) return '';
  return `<details class="rvscript wrx"><summary>해석 · 구성 · 핵심 표현</summary>
    <p class="rvplain">${esc(xo.ko)}</p>
    ${(xo.plan || []).length ? `<div class="eyebrow">구성</div><ol class="wrplan">${xo.plan.map(p => `<li>${esc(p)}</li>`).join('')}</ol>` : ''}
    ${(xo.expr || []).length ? `<div class="eyebrow">핵심 표현</div><ul class="wrexpr">${xo.expr.map(e => `<li><b>${esc(e.en)}</b> <span>${esc(e.ko)}</span></li>`).join('')}</ul>` : ''}</details>`;
}
// 라이팅 해설지 한 회차: 재배열(앞 문장·정답 문장·해설), 이메일·토론(문제·모범 답안·해석·구성·핵심 표현)
function wrKeyBody(k) {
  const build = k.build.map(b => `<div class="sheet rvq"><div class="rvqh"><span class="num">${b.n}.</span><span>${esc(b.ctx)}</span></div>
    <div class="wrsent ok"><span class="tag ok">정답</span>${esc(b.answer)}</div>${b.x ? `<div class="rvx"><b>해설</b><p>${esc(b.x)}</p></div>` : ''}</div>`).join('');
  const essay = (title, prompt, m) => `<section class="stack"><h3 class="rvmod">${title}</h3><div class="sheet stack">${prompt}</div>
    <div class="wrbox model"><div class="eyebrow">모범 답안</div><p>${esc(m.model)}</p></div>${wrModelX(m.x)}</section>`;
  return `<section class="stack"><h3 class="rvmod">재배열</h3>${build}</section>` + essay('이메일', wrEmail(k.email), k.email) + essay('토론', wrDisc(k.disc), k.disc);
}
// 스피킹 다시 보기: 따라 말하기는 문장(답지)과 내 녹음, 인터뷰는 질문·예시 답안과 내 녹음.
// urls: { 'l-1': 녹음 주소, ... } (아직 받지 않았으면 null — 그때는 녹음 자리를 비워 둔다)
function spReviewBody(V, urls) {
  const c = V.content && V.content.sp; if (!c || !c.lnr) return '';
  // 학생 화면은 실제 시험처럼 영어로, 관리자 화면은 한국어로
  const en = RV_MINE === '내 답', by = rowMap(V.r.rows), mine = en ? 'My recording' : '학생 녹음', model = en ? 'Sample answer' : '예시 답안';
  const rec = k => (!urls ? '' : urls[k] ? `<div class="sprec"><span class="tag">${mine}</span><audio controls preload="metadata" src="${urls[k]}"></audio></div>`
    : `<div class="sprec"><span class="tag">${mine}</span><span class="note">${en ? 'No recording.' : '녹음이 없어요.'}</span></div>`);
  const lnr = c.lnr.items.map(x => { const k = 'l-' + x.n; V.seen && V.seen.add(k); const r = by[k];
    return `<div class="sheet rvq"><div class="rvqh"><span class="num">${x.n}.</span><span>${x.script ? esc(x.script) : `<span class="note">${en ? 'The sentence will appear when your teacher shows the answers.' : '정답 공개가 꺼져 있어 문장은 보이지 않아요.'}</span>`}</span></div>${r ? rec(k) : ''}</div>`; }).join('');
  const iv = c.iv.items.map(x => { const k = 'i-' + x.n; V.seen && V.seen.add(k); const r = by[k];
    return `<div class="sheet rvq"><div class="rvqh"><span class="num">${x.n}.</span><span>${esc(x.script)}</span></div>${r ? rec(k) : ''}
      ${x.model ? `<div class="wrbox model"><div class="eyebrow">${model}</div><p>${esc(x.model)}</p></div>` : ''}</div>`; }).join('');
  return `<section class="stack"><h3 class="rvmod">Listen and Repeat</h3><p class="note" style="margin:0">${esc(c.lnr.situation)}</p>${lnr}</section>
    <section class="stack"><h3 class="rvmod">Take an Interview</h3><p class="note" style="margin:0">${esc(c.iv.situation)}</p>${iv}</section>`;
}
// 녹음 묶음({ clips: { 'l-1': { mime, data } } })을 재생 주소로
function spRecUrls(pack) {
  const out = {};
  Object.entries((pack && pack.clips) || {}).forEach(([k, v]) => { const s = atob(v.data), a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); out[k] = URL.createObjectURL(new Blob([a], { type: v.mime })); });
  return out;
}
