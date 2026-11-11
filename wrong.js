/* 약점 분석: 내 기록(지금 열린 회차만)에서 과목별로 유형별 정답률을 보여 주고, 틀렸던 문항을 많이 틀린 것부터 다시 풀게 한다.
   채점은 서버가 하고, 다시 푼 결과는 기록에 남지 않는다.
   문항 키: 리딩 "r|회차|모듈|번호", 빈칸 "w|회차|모듈|번호", 리스닝 "l|회차 ID|모듈|번호" (서버 myWrong·checkWrong과 같다)
   W = { status, err, busy, stats, groups, showAnswers, subj: 'rc'|'lc', answers: { 키: 답 }, res: { 키: { ok, correct, full, ex } }, audio: { "회차|모듈": 'loading'|'ok'|'err' } } */
let W = null;
// 과목과 그 과목의 유형 (stats 키, 이름, 문제 묶음 kind)
const WSUBJ = [['rc', '리딩', [['w', 'Complete the Words'], ['r', 'Reading']]],
  ['lc', '리스닝', [['response', 'Best Response'], ['conversation', 'Conversation'], ['announcement', 'Announcement'], ['talk', 'Academic Talk']]]];
const wSubjOf = g => (g.kind === 'l' ? 'lc' : 'rc');
const wKey = (g, n) => [g.kind, g.t, g.mi, n].join('|');
const wKeys = g => (g.kind === 'w' ? g.ns.map(n => wKey(g, n)) : g.qs.map(q => wKey(g, q.n)));
const wWorst = g => Math.max(...(g.kind === 'w' ? g.counts : g.qs).map(c => c.wrong));
const wTimes = c => `${c.seen}번 중 ${c.wrong}번 틀렸어요`;

async function openWrong() {
  const me_ = W = { status: 'loading', subj: 'rc', answers: {}, res: {}, audio: {} };
  S.screen = 'wrong'; render(); window.scrollTo(0, 0);
  try {
    const j = await api('myWrong', me());
    if (W !== me_) return;
    Object.assign(W, { status: 'ok', stats: j.stats || { rc: {}, lc: {} }, groups: j.groups.sort((a, b) => wWorst(b) - wWorst(a)), showAnswers: j.showAnswers });
    if (!Object.keys(W.stats.rc).length && Object.keys(W.stats.lc).length) W.subj = 'lc';
  } catch (e) { if (W !== me_) return; W.status = 'err'; W.err = e.message; }
  if (S.screen === 'wrong') render();
}
async function checkWrong() {
  const answers = {};
  W.groups.filter(g => wSubjOf(g) === W.subj).flatMap(wKeys).forEach(k => { if (W.answers[k] && !W.res[k]) answers[k] = W.answers[k]; });
  if (!Object.keys(answers).length) { W.err = '새로 고른 답이 없어요. 답을 고른 뒤 채점해 주세요.'; render(); return; }
  W.busy = true; W.err = ''; render();
  try { const j = await api('checkWrong', Object.assign(me(), { answers })); Object.assign(W.res, j.results); W.showAnswers = j.showAnswers; }
  catch (e) { W.err = e.message; }
  W.busy = false; if (S.screen === 'wrong') render();
}
// 리스닝: 그 회차·모듈의 음원 묶음을 받아 다시 보기 재생기(LCR)에 "회차|모듈:음원" 이름으로 더한다
async function wrongAudio(id, mi) {
  const k = id + '|' + mi; if (W.audio[k] === 'loading' || W.audio[k] === 'ok') return;
  if (LCR.key !== 'wrong') { rvRelease(); LCR.key = 'wrong'; }
  lcMediaFree(); W.audio[k] = 'loading'; W.err = ''; render();
  const me_ = W;
  try {
    const j = await api('getAudio', Object.assign(me(), { id, module: mi }));
    if (W !== me_ || LCR.key !== 'wrong') return;
    LCR.clips = LCR.clips || {};
    Object.entries(j.pack.clips).forEach(([c, b64]) => { LCR.clips[k + ':' + c] = URL.createObjectURL(new Blob([b64bytes(b64)], { type: 'audio/mpeg' })); });
    W.audio[k] = 'ok';
  } catch (e) { if (W !== me_) return; W.audio[k] = 'err'; W.err = e.message; }
  if (S.screen === 'wrong') render();
}

function viewWrong() {
  const back = `<button class="btn" data-act="home">처음 화면으로</button>`, head = `<div class="qhead"><h2>약점 분석</h2></div>`;
  if (W.status === 'loading') return `<div class="sheet stack" style="max-width:520px"><h2>기록을 분석하는 중…</h2><div>${back}</div></div>`;
  if (W.status === 'err') return `<div class="sheet stack" style="max-width:520px"><h2>약점 분석을 불러오지 못했어요</h2><div class="banner bad">${esc(W.err)}</div>
    <div class="toolbar"><button class="btn primary" data-act="wrongOpen">다시 시도</button>${back}</div></div>`;
  const [, , types] = WSUBJ.find(x => x[0] === W.subj), st = W.stats[W.subj] || {};
  const list = W.groups.filter(g => wSubjOf(g) === W.subj), keys = list.flatMap(wKeys), done = keys.filter(k => W.res[k]);
  const pct = v => Math.round(v[0] / v[1] * 100), shown = types.filter(([k]) => st[k] && st[k][1]);
  const weakest = shown.length > 1 ? shown.reduce((a, b) => (pct(st[b[0]]) < pct(st[a[0]]) ? b : a))[0] : null;
  const tiles = shown.length ? `<div class="parts">${shown.map(([k, l]) => `<div class="part${k === weakest ? ' weak' : ''}"><div class="lbl">${l}${k === weakest ? ' · 가장 약해요' : ''}</div>
      <div class="val">${pct(st[k])}%</div><div class="note num">${st[k][1]}문항 중 ${st[k][0]}개 맞음</div></div>`).join('')}</div>`
    : `<div class="tablebox"><div class="empty">아직 지금 열린 ${W.subj === 'rc' ? '리딩' : '리스닝'} 회차를 푼 기록이 없어요.</div></div>`;
  // 리딩은 Complete the Words와 Reading으로 나눠 보여 주고, 리스닝은 많이 틀린 순서 그대로 (묶음마다 유형이 적혀 있다)
  const sections = W.subj === 'rc' ? types.map(([k, l]) => { const gs = list.filter(g => g.kind === k); return gs.length ? `<h3 class="rvmod">${l}</h3>${gs.map(wGroup).join('')}` : ''; }).join('') : list.map(wGroup).join('');
  return `<div class="stack">${head}
    <p class="note" style="margin:0">지금 열린 회차에서 낸 기록으로 유형별 정답률을 보고, 틀렸던 문제를 많이 틀린 것부터 다시 풀어요. 다시 푼 결과는 기록에 남지 않아요.</p>
    <div class="tabs" role="tablist">${WSUBJ.map(([k, l]) => `<button class="tab${W.subj === k ? ' on' : ''}" role="tab" aria-selected="${W.subj === k}" data-act="wSubj" data-k="${k}">${l}</button>`).join('')}</div>
    ${tiles}
    <h3 style="margin:6px 0 0">틀린 문제 다시 풀기 <span class="note num" style="font-weight:400">${keys.length}문항</span></h3>
    ${done.length ? `<div class="banner ok">채점한 ${done.length}문제 중 <b class="num">${done.filter(k => W.res[k].ok).length}</b>문제를 맞혔어요.${W.showAnswers ? '' : ' 선생님이 정답 공개를 꺼 두셔서 맞았는지만 보여요.'}</div>` : ''}
    ${sections || `<div class="tablebox"><div class="empty">${shown.length ? '틀린 문제가 없어요. 잘했어요!' : '틀린 문제가 없어요.'}</div></div>`}
    ${W.err ? `<div class="banner bad">${esc(W.err)}</div>` : ''}
    <div class="toolbar">${list.length ? `<button class="btn primary" data-act="wCheck"${W.busy ? ' disabled' : ''}>${W.busy ? '채점 중…' : '채점하기'}</button>` : ''}
      ${done.length ? `<button class="btn" data-act="wReset">처음부터 다시 풀기</button>` : ''}<span class="spacer"></span>${back}</div></div>`;
}
function wGroup(g) {
  const where = g.kind === 'l' ? `${esc(g.title)} · Module ${g.mi + 1}` : `TEST ${esc(g.t)} · Module ${g.mi + 1}`;
  if (g.kind === 'w') return wWords(g, where);
  const cards = g.qs.map(q => wCard(g, q)).join('');
  if (g.kind === 'r') return `<div class="split rvsplit"><div class="sheet passage"><div class="eyebrow">${where}${g.sk ? ' · ' + esc(g.sk) : ''}</div>${g.title ? `<h3>${esc(g.title)}</h3>` : ''}${wPassage(g)}</div>
    <div class="stack">${cards}</div></div>`;
  const k = g.t + '|' + g.mi, a = W.audio[k];
  const audio = a === 'ok' ? rvPlayer(k + ':' + g.clip, g.heading) : a === 'loading' ? `<div class="note">음원을 불러오는 중이에요… (약 ${lcMB(g.mb)}MB)</div>`
    : `<div><button class="btn small" data-act="wAudio" data-id="${esc(g.t)}" data-mi="${g.mi}">음원 불러오기 · 약 ${lcMB(g.mb)}MB</button></div>`;
  return `<section class="stack rvitem"><div class="qhead" style="margin:0"><h3>${esc(g.heading)}</h3><span class="note num">${where} · ${LC_TYPE[g.type] || ''}</span></div>${audio}${cards}</section>`;
}
// 리딩 지문: 문장 넣기 문제가 있으면 ■ 자리를 고르게 하고, 채점한 뒤에는 고른 자리와 정답 자리를 칠한다
function wPassage(g) {
  const ins = g.qs.find(q => q.insert), k = ins && wKey(g, ins.n), x = k && W.res[k];
  let i = 0;
  const mark = () => {
    const L = LET[i++] || '';
    if (x) return `<span class="insmark${W.answers[k] === L ? (x.ok ? ' mine' : ' mine bad') : ''}${x.correct === L ? ' right' : ''}">■ ${L}</span>`;
    return `<button class="ins${W.answers[k] === L ? ' on' : ''}" data-act="wPick" data-k="${esc(k)}" data-v="${L}" aria-label="위치 ${L}">■ ${L}</button>`;
  };
  return g.passage.split(/\n\n/).map(p => { const h = esc(p).replace(/\n/g, '<br>'); return `<p>${ins ? h.replace(/■/g, mark) : h.replace(/ ?■ ?/g, ' ').replace(/ {2,}/g, ' ').trim()}</p>`; }).join('');
}
// 객관식 한 문제: 채점 전에는 고르는 칸, 채점한 뒤에는 다시 보기와 같은 모양(rvChoice)
function wCard(g, q) {
  const k = wKey(g, q.n), x = W.res[k], text = q.insert ? '다음 문장이 들어갈 가장 알맞은 위치를 고르세요.' : q.q || '가장 알맞은 응답을 고르세요.';
  const choices = q.insert ? LET.map(L => `위치 ■ ${L}`) : q.c, extra = (q.insert ? `<div class="insert-sent">${esc(q.insert)}</div>` : '') + `<div class="note">${wTimes(q)}</div>`;
  if (x) return rvChoice(q.n, text, choices, { given: W.answers[k], correct: x.correct, ok: x.ok }, extra, x.ex);
  return `<div class="sheet qs"><fieldset><legend><span class="num">${q.n}.</span>${esc(text)}</legend>${extra}
    ${choices.map((c, ci) => `<label class="opt"><input type="radio" name="w${esc(k)}" data-wk="${esc(k)}" value="${LET[ci]}"${W.answers[k] === LET[ci] ? ' checked' : ''}><b>(${LET[ci]})</b><span>${esc(c)}</span></label>`).join('')}</fieldset></div>`;
}
// 빈칸 지문: 틀렸던 칸만 비어 있다 (나머지 칸은 서버가 채워 보낸다)
function wWords(g, where) {
  let i = 0;
  const html = esc(g.text).replace(/(\S*?)\[(\d+)\]/g, (a, pre, len) => {
    const n = g.ns[i], c = g.counts[i++], k = wKey(g, n), x = W.res[k], given = W.answers[k] || '';
    if (!x) return `<span class="wd">${pre}<input class="blank" data-wk="${esc(k)}" data-len="${len}" maxlength="${len}" style="--n:${len}" value="${esc(given)}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="빈칸 ${n}, ${len}글자, ${wTimes(c)}"></span>`;
    const fix = !x.ok && x.correct ? `<span class="rvb fix">${esc(x.correct)}</span>` : '';
    return `<span class="wd">${pre}<span class="rvb ${x.ok ? 'ok' : 'bad'}">${esc(given)}</span>${fix}<span class="sr"> (${n}번 ${x.ok ? '맞음' : '틀림'}${fix ? ', 정답 ' + esc(x.correct) : ''})</span></span>`;
  });
  const ex = g.ns.map(n => ({ n, x: W.res[wKey(g, n)] })).filter(o => o.x && o.x.ex && o.x.ex.exp);
  return `<div class="sheet words rvwords"><div class="eyebrow">${where} · 틀렸던 칸 ${g.ns.length}개 (가장 많이 ${wWorst(g)}번)</div>${html}</div>
    ${ex.length ? `<div class="rvx"><b>해설</b><ul class="rvwx">${ex.map(o => `<li><span class="num">${o.n}.</span> ${esc(o.x.ex.exp)}</li>`).join('')}</ul></div>` : ''}`;
}

document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act;
  if (act === 'wrongOpen') openWrong();
  if (!W) return;
  if (act === 'wSubj') { W.subj = b.dataset.k; W.err = ''; render(); }
  else if (act === 'wCheck') checkWrong();
  else if (act === 'wReset') { W.groups.filter(g => wSubjOf(g) === W.subj).flatMap(wKeys).forEach(k => { delete W.answers[k]; delete W.res[k]; }); W.err = ''; render(); }
  else if (act === 'wPick') { W.answers[b.dataset.k] = b.dataset.v; render(); }
  else if (act === 'wAudio') wrongAudio(b.dataset.id, +b.dataset.mi);
});
document.addEventListener('change', ev => {
  const el = ev.target;
  if (W && el.type === 'radio' && el.dataset.wk) {
    W.answers[el.dataset.wk] = el.value;
    document.querySelectorAll(`button.ins[data-k="${CSS.escape(el.dataset.wk)}"]`).forEach(x => x.classList.toggle('on', x.dataset.v === el.value));
  }
});
document.addEventListener('input', ev => {
  const el = ev.target;
  if (!W || !el.dataset || !el.dataset.wk || !el.classList.contains('blank')) return;
  el.value = el.value.replace(/[^A-Za-z]/g, '').toLowerCase();
  W.answers[el.dataset.wk] = el.value;
  if (el.value.length >= +el.dataset.len) { const all = [...document.querySelectorAll('input.blank')], i = all.indexOf(el); if (all[i + 1]) all[i + 1].focus(); }
});
