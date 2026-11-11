/* 라이팅: NEW TOEFL 3 라이팅 회차 = 재배열(Build a Sentence) 10문항 → 이메일 → 토론. 파트마다 제한 시간이 있고, 시간이 끝나면 다음 파트로 넘어간다.
   재배열만 서버가 채점하고, 이메일·토론 글은 제출해 선생님이 관리자 화면에서 읽는다. 정답 공개면 결과에 모범 답안이 나온다.
   S.exam = { kind: 'wr', test, part: 0|1|2, item, pick: { 문항 번호: [빈칸마다 고른 조각 번호 또는 null] }, email, disc, partEnds, partStart, startedAt, used: [초, 초, 초], ask } */
const WR_PARTS = [['재배열', 6], ['이메일', 7], ['토론', 10]];  // 파트 이름, 제한 시간(분)
const wrWords = s => (String(s || '').trim().match(/\S+/g) || []).length;

function viewWrList() {
  const tests = S.wrTests || [];
  if (!tests.length) return `<div class="banner">지금 열려 있는 라이팅 회차가 없어요. 선생님께 문의하세요.</div>`;
  const all = mineList(), best = id => bestText(all && all.filter(a => a.wr && a.wr.id === id), () => '재배열 ');
  return `<section class="tests">${tests.map(t => `<article class="tcard"><h3>${esc(t.title)}</h3>
    <dl>${WR_PARTS.map(([l, min], i) => `<dt>${l}</dt><dd>${i === 0 ? `${t.build}문항 · ` : ''}${min}분</dd>`).join('')}</dl>
    <div class="best">${best(t.id)}</div>
    <button class="btn primary" data-act="wrStart" data-id="${t.id}"${S.busy ? ' disabled' : ''}>${S.busy === 'wr' + t.id ? '불러오는 중…' : '시작'}</button></article>`).join('')}</section>`;
}
async function startWr(id) {
  S.err = ''; S.busy = 'wr' + id; render();
  try {
    const j = await api('getWriting', Object.assign(me(), { id }));
    const now = Date.now();
    S.exam = { kind: 'wr', test: j.test, showAnswers: j.showAnswers, part: 0, item: 0, pick: {}, email: '', disc: '', startedAt: now, partStart: now, partEnds: now + WR_PARTS[0][1] * 60000, used: [] };
    persist(); S.screen = 'exam'; window.scrollTo(0, 0);
  } catch (e) { S.err = e.message; }
  S.busy = ''; render();
}
// 다음 파트로 (마지막 파트였으면 제출). 쓴 시간을 파트마다 남긴다
function wrNextPart() {
  const e = S.exam; if (!e || e.kind !== 'wr' || e.done) return;
  const now = Date.now();
  e.used[e.part] = Math.round((now - e.partStart) / 1000); e.ask = false;
  if (e.part >= WR_PARTS.length - 1) { persist(); finish(); return; }
  e.part++; e.item = 0; e.partStart = now; e.partEnds = now + WR_PARTS[e.part][1] * 60000;
  persist(); render(); window.scrollTo(0, 0);
}
// 제출할 답: 재배열은 빈칸 순서대로 고른 조각의 글자
function wrAnswers(e) {
  const build = {};
  e.test.build.forEach(b => { const p = e.pick[b.n]; if (p && p.some(v => v != null)) build[b.n] = p.map(v => (v == null ? '' : b.bank[v])); });
  return { build, email: e.email, disc: e.disc };
}
function wrTick() {
  const e = S.exam, el = document.getElementById('timer'), left = (e.partEnds - Date.now()) / 1000;
  if (el) { el.textContent = fmtTime(left); el.classList.toggle('low', left < 60); }
  if (left <= 0 && !e.done) wrNextPart();
}

// 시험 중 위 막대: 회차, 파트, 그 파트의 남은 시간
function wrTopBar() {
  const e = S.exam;
  return `<span class="chip num">${esc(e.test.title)}</span><span class="chip">${WR_PARTS[e.part][0]} (${e.part + 1}/3)</span><span class="spacer"></span>
    <span class="timer num" id="timer" aria-label="남은 시간">${fmtTime((e.partEnds - Date.now()) / 1000)}</span>`;
}
function viewWrExam() {
  const e = S.exam, t = e.test, [name] = WR_PARTS[e.part];
  const head = `<div class="qhead"><h2>${name}</h2><span class="note num">${e.part === 0 ? `Question ${t.build[e.item].n} of ${t.build.length}` : e.part === 1 ? 'Question 11' : 'Question 12'}</span></div>`;
  const next = e.part < 2 ? `<button class="btn primary" data-act="wrNext">${['이메일로', '토론으로'][e.part]} 넘어가기</button>`
    : e.ask ? `<span class="note">제출하면 고칠 수 없어요.</span><button class="btn" data-act="wrAsk" data-v="">계속 쓰기</button><button class="btn primary" data-act="wrNext">제출</button>`
    : `<button class="btn primary" data-act="wrAsk" data-v="1">제출하기</button>`;
  if (e.part === 0) {
    const b = t.build[e.item], pick = e.pick[b.n] || [], used = new Set(pick.filter(v => v != null));
    let bi = 0;
    const line = b.slots.map(x => {
      if (x.w != null) return `<span class="wrfix">${esc(x.w)}${esc(x.end)}</span>`;
      const i = bi++, v = pick[i];
      return v == null ? `<span class="wrslot empty" aria-label="빈칸 ${i + 1}">&nbsp;</span>${esc(x.end)}`
        : `<button class="wrslot" data-act="wrUnpick" data-i="${i}" aria-label="빈칸 ${i + 1}: ${esc(b.bank[v])} (누르면 빼기)">${esc(b.bank[v])}</button>${esc(x.end)}`;
    }).join(' ');
    const dots = t.build.map((x, i) => { const p = e.pick[x.n] || []; const full = p.length && p.filter(v => v != null).length === x.slots.filter(s => s.w == null).length;
      return `<button class="dot${full ? ' done' : ''}${i === e.item ? ' cur' : ''}" data-act="wrItem" data-i="${i}">${x.n}</button>`; }).join('');
    return `<div class="stack">${head}
      <p class="note" style="margin:0">Make an appropriate sentence. 아래 조각을 순서대로 눌러 빈칸을 채우세요. 채운 조각을 누르면 빠져요. 쓰지 않는 조각도 있어요.</p>
      <div class="sheet stack wrbuild"><div class="wrctx"><span class="who">A</span><p>${esc(b.ctx)}</p></div>
        <div class="wrctx me"><span class="who">B</span><p class="wrline">${line}</p></div>
        <div class="wrbank">${b.bank.map((w, i) => `<button class="wrchip" data-act="wrPick" data-i="${i}"${used.has(i) ? ' disabled' : ''}>${esc(w)}</button>`).join('')}</div>
        ${pick.some(v => v != null) ? `<div><button class="btn small" data-act="wrClear">다시 고르기</button></div>` : ''}</div>
      <div class="navrow"><button class="btn" data-act="wrItem" data-i="${e.item - 1}"${e.item === 0 ? ' disabled' : ''}>이전</button><div class="dots">${dots}</div>
        ${e.item < t.build.length - 1 ? `<button class="btn primary" data-act="wrItem" data-i="${e.item + 1}">다음</button>` : next}</div></div>`;
  }
  const box = (k, ph) => `<label class="field">답안 <span class="note" id="wrCount">${wrWords(e[k])}단어</span>
    <textarea class="wrtext" id="wrText" data-wr="${k}" rows="14" spellcheck="false" autocapitalize="off" autocorrect="off" placeholder="${ph}">${esc(e[k])}</textarea></label>`;
  const body = e.part === 1 ? `<div class="sheet stack">${wrEmail(t.email)}</div>${box('email', 'Write your email here.')}`
    : `<div class="sheet stack">${wrDisc(t.disc)}</div>${box('disc', 'Write your post here.')}`;
  return `<div class="stack">${head}${body}<div class="toolbar"><span class="spacer"></span>${next}</div></div>`;
}

document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act;
  if (act === 'wrStart') { startWr(+b.dataset.id); return; }
  const e = S.exam; if (!e || e.kind !== 'wr' || S.screen !== 'exam') return;
  const item = e.test.build[e.item], blanks = item ? item.slots.filter(x => x.w == null).length : 0;
  const pick = item && (e.pick[item.n] || (e.pick[item.n] = Array(blanks).fill(null)));
  if (act === 'wrPick') { const i = pick.indexOf(null); if (i >= 0) pick[i] = +b.dataset.i; persist(); render(); }
  else if (act === 'wrUnpick') { pick[+b.dataset.i] = null; persist(); render(); }
  else if (act === 'wrClear') { e.pick[item.n] = Array(blanks).fill(null); persist(); render(); }
  else if (act === 'wrItem') { e.item = Math.max(0, Math.min(e.test.build.length - 1, +b.dataset.i)); persist(); render(); }
  else if (act === 'wrAsk') { e.ask = !!b.dataset.v; render(); }
  else if (act === 'wrNext') wrNextPart();
});
document.addEventListener('input', ev => {
  const el = ev.target, e = S.exam;
  if (!el.dataset || !el.dataset.wr || !e || e.kind !== 'wr') return;
  e[el.dataset.wr] = el.value; persist();
  const c = document.getElementById('wrCount'); if (c) c.textContent = wrWords(el.value) + '단어';
});
