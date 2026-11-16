/* 구문단어 시험: 뜻을 보고 영어 단어·구문을 쓴다. 단어 → 구문 순서로 한 화면에 모두 나오고, 시계는 지난 시간을 센다.
   서버는 뜻만 보내고 채점은 서버에서 한다 (대소문자·문장부호·A/B/O/~ing 같은 자리 표시는 따지지 않는다).
   S.exam = { kind: 'voc', set: { id, title, heads, words: [{ n, ko, h }], phrases }, answers: { 'v-1': '…', 'p-3': '…' }, startedAt, limit: 0, endsAt: null, used, ask } */
function viewVocList() {
  const sets = S.vocSets || [];
  if (!sets.length) return `<div class="banner">지금 열려 있는 구문단어 세트가 없어요. 선생님께 문의하세요.</div>`;
  const all = mineList(), best = id => bestText(all && all.filter(a => a.voc && a.voc.id === id), () => '');
  return `<section class="tests">${sets.map(v => `<article class="tcard"><h3><span class="num">${v.id}.</span> ${esc(v.title)}</h3>
    <dl><dt>단어</dt><dd>${v.words}개</dd><dt>구문</dt><dd>${v.phrases}개</dd></dl>
    <div class="best">${best(v.id)}</div>
    <button class="btn primary" data-act="vocStart" data-id="${v.id}"${S.busy ? ' disabled' : ''}>${S.busy === 'voc' + v.id ? '불러오는 중…' : '시작'}</button></article>`).join('')}</section>`;
}
async function startVoc(id) {
  S.err = ''; S.busy = 'voc' + id; render();
  try {
    const j = await api('getVoc', Object.assign(me(), { id }));
    S.exam = { kind: 'voc', set: j.set, showAnswers: j.showAnswers, answers: {}, startedAt: Date.now(), limit: 0, endsAt: null, used: [] };
    persist(); S.screen = 'exam'; window.scrollTo(0, 0);
  } catch (e) { S.err = e.message; }
  S.busy = ''; render();
}
const vocKeys = v => v.words.map(x => 'v-' + x.n).concat(v.phrases.map(x => 'p-' + x.n));
const vocLeft = e => vocKeys(e.set).filter(k => !(e.answers[k] || '').trim()).length;
function vocTopBar() {
  const e = S.exam;
  return `<span class="chip">구문단어</span><span class="chip">${esc(e.set.title)}</span><span class="spacer"></span>
    <span class="timer num up" id="timer" aria-label="지난 시간" title="제한 시간 없음">${fmtTime((Date.now() - e.startedAt) / 1000)}</span>`;
}
function viewVocExam() {
  const e = S.exam, v = e.set, left = vocLeft(e);
  const part = (kind, name, list) => {
    if (!list.length) return '';
    let last = null;
    return `<section class="stack"><h3 class="rvmod">${name} <span class="note">${list.length}개</span></h3><ul class="vlist sheet">${list.map(x => {
      const k = kind + '-' + x.n, hd = x.h !== last && v.heads[x.h] ? `<li class="vhead">${esc(v.heads[x.h])}</li>` : ''; last = x.h;
      return hd + `<li class="vrow vq"><span class="num vn">${x.n}.</span><label class="vko" for="vi${k}">${esc(x.ko)}</label>
        <input class="vin" id="vi${k}" data-vk="${k}" value="${esc(e.answers[k] || '')}" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="next"></li>`; }).join('')}</ul></section>`;
  };
  const submit = e.ask ? `<span class="note">${left ? `아직 <b>${left}개</b>를 쓰지 않았어요. ` : ''}제출하면 고칠 수 없어요.</span><button class="btn" data-act="vocAsk" data-v="">계속 쓰기</button><button class="btn primary" data-act="vocSubmit">제출</button>`
    : `<button class="btn primary" data-act="vocAsk" data-v="1">제출하기</button>`;
  return `<div class="stack"><div class="qhead"><h2>${esc(v.title)}</h2><span class="note num" id="vocLeft">${left ? `남은 칸 ${left}개` : '다 썼어요'}</span></div>
    <p class="note" style="margin:0">뜻을 보고 영어 단어·구문을 쓰세요. 대소문자와 문장부호는 채점하지 않고, 구문의 A · B · O · ~ing 같은 자리 표시는 써도 되고 빼도 돼요. Enter를 누르면 다음 칸으로 가요.</p>
    ${part('v', '단어', v.words)}${part('p', '구문', v.phrases)}
    <div class="toolbar"><span class="spacer"></span>${submit}</div></div>`;
}
function vocSubmit() {
  const e = S.exam; if (!e || e.kind !== 'voc' || e.done) return;
  e.used = [Math.round((Date.now() - e.startedAt) / 1000)]; e.ask = false; persist(); finish();
}

document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act;
  if (act === 'vocStart') startVoc(+b.dataset.id);
  else if (act === 'vocAsk' && S.exam && S.exam.kind === 'voc') { S.exam.ask = !!b.dataset.v; render(); }
  else if (act === 'vocSubmit') vocSubmit();
});
document.addEventListener('input', ev => {
  const el = ev.target, e = S.exam;
  if (!el.dataset || !el.dataset.vk || !e || e.kind !== 'voc') return;
  e.answers[el.dataset.vk] = el.value.slice(0, 200); persist();
  const n = vocLeft(e), c = document.getElementById('vocLeft'); if (c) c.textContent = n ? `남은 칸 ${n}개` : '다 썼어요';
});
// Enter: 다음 칸으로 (마지막 칸이면 제출 버튼으로)
document.addEventListener('keydown', ev => {
  const el = ev.target; if (ev.key !== 'Enter' || ev.isComposing || !el.classList || !el.classList.contains('vin')) return;
  ev.preventDefault();
  const all = [...document.querySelectorAll('input.vin')], next = all[all.indexOf(el) + 1];
  if (next) next.focus(); else { const s = document.querySelector('[data-act="vocAsk"], [data-act="vocSubmit"]'); if (s) s.focus(); }
});
