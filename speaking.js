/* 스피킹 모의고사 (NEW TOEFL): Listen and Repeat 7문장 → Take an Interview 4질문.
   문제(그림·문장 음성·선생님이 만든 인터뷰 영상·삐 소리)는 시작 전에 묶음 하나로 받아 두고 기기 안에서 튼다 (listening.js와 같은 방식).
   문제가 끝나면 삐 소리가 나고 바로 녹음이 시작되며, 정해진 시간이 지나면 저절로 멈추고 다음으로 넘어간다.
   녹음은 이 창의 메모리에만 있다가 다 끝나면 한꺼번에 낸다 (새로고침하면 처음부터 다시). 낸 뒤에는 내 녹음을 다시 들을 수 있다.
   S.exam (스피킹) = { kind: 'sp', test, showAnswers, step, phase: 'play' | 'beep' | 'rec', recEnds, startedAt, used }
   SP: 받은 묶음(clips: 이름 → 재생 주소), 재생기, 마이크, 녹음(recs: 키 → Blob) */
const SP = { key: '', clips: null, loading: false, got: 0, need: 0, err: '', au: null, vid: null, stream: null, mic: '', rec: null, recs: {}, urls: {}, blocked: false, tok: null, wake: null };
const SP_MIME = n => (/\.mp4$/.test(n) ? 'video/mp4' : /\.jpg$/.test(n) ? 'image/jpeg' : 'audio/mpeg');
// 화면 순서: 따라 말하기 안내 → 7문장 → 인터뷰 안내 → 4질문
function spSteps(t) {
  return [{ t: 'intro', sec: 'lnr', clip: 'intro1.mp3' }].concat(t.lnr.items.map(x => ({ t: 'q', sec: 'lnr', n: x.n, secs: x.secs, clip: `q${x.n}.mp3`, img: `img${x.n}.jpg`, k: 'l-' + x.n })),
    [{ t: 'intro', sec: 'iv', clip: 'intro8.mp3' }], t.iv.items.map(x => ({ t: 'q', sec: 'iv', n: x.n, secs: x.secs, clip: `q${x.n}.mp4`, k: 'i-' + x.n })));
}

function viewSpList() {
  const tests = S.spTests || [];
  if (!tests.length) return `<div class="banner">No speaking tests are open right now. Please ask your teacher.</div>`;
  const all = mineList(), best = id => bestText(all && all.filter(a => a.sp && a.sp.id === id), () => '');
  return `<section class="tests">${tests.map(t => `<article class="tcard"><h3>${esc(t.title)}</h3>
    <dl><dt>Listen and Repeat</dt><dd>${t.lnr} sentences</dd><dt>Take an Interview</dt><dd>${t.iv} questions</dd></dl>
    <div class="best">${best(t.id)}</div>
    <button class="btn primary" data-act="spStart" data-id="${t.id}"${S.busy ? ' disabled' : ''}>${S.busy === 'sp' + t.id ? 'Loading…' : 'Start'}</button></article>`).join('')}</section>`;
}
async function startSp(id) {
  S.err = ''; S.busy = 'sp' + id; render();
  try {
    const j = await api('getSpeaking', Object.assign(me(), { id }));
    spRelease();
    S.exam = { kind: 'sp', test: j.test, showAnswers: j.showAnswers, step: -1, phase: null, recEnds: null, startedAt: null, used: [] };
    S.screen = 'exam'; window.scrollTo(0, 0);
    spLoad();
  } catch (e) { S.err = e.message; }
  S.busy = ''; render();
}
// 시험을 그만두거나 끝나면 마이크를 끄고 받은 묶음을 버린다 (낸 녹음 주소 SP.urls는 결과 화면에서 쓰려고 남긴다)
function spRelease() {
  try { if (SP.rec && SP.rec.state !== 'inactive') SP.rec.stop(); } catch (e) {}
  if (SP.stream) SP.stream.getTracks().forEach(t => t.stop());
  if (SP.au) { try { SP.au.pause(); SP.au.removeAttribute('src'); SP.au.load(); } catch (e) {} }
  if (SP.vid) { try { SP.vid.pause(); SP.vid.removeAttribute('src'); SP.vid.load(); } catch (e) {} }
  if (SP.clips) Object.values(SP.clips).forEach(u => URL.revokeObjectURL(u));
  spWakeOff();
  Object.assign(SP, { key: '', clips: null, loading: false, got: 0, need: 0, err: '', stream: null, mic: '', rec: null, recs: {}, blocked: false, tok: null });
}
function spQuit() { spRelease(); S.exam = null; S.screen = 'home'; render(); window.scrollTo(0, 0); }

/* ---------- 준비: 묶음 받기, 마이크 켜기 ---------- */
async function spLoad() {
  const e = S.exam; if (!e || e.kind !== 'sp') return;
  const tok = SP.tok = {}, live = () => SP.tok === tok;
  SP.key = String(e.test.id); SP.loading = true; SP.err = ''; SP.got = 0; render();
  try {
    const res = await fetch(window.API_URL, { method: 'POST', body: JSON.stringify(Object.assign({ action: 'getSpPack' }, me(), { id: e.test.id })) });
    let text;
    if (res.body && res.body.getReader) {
      const reader = res.body.getReader(), parts = [];
      for (;;) { const { done, value } = await reader.read(); if (done) break; parts.push(value); if (live()) { SP.got += value.length; spProgress(); } }
      text = await new Blob(parts).text();
    } else text = await res.text();
    const j = JSON.parse(text);
    if (!j.ok) throw new Error(j.error || 'Could not download the test.');
    const clips = {};
    Object.entries(j.pack.clips).forEach(([k, b64]) => { clips[k] = URL.createObjectURL(new Blob([b64bytes(b64)], { type: SP_MIME(k) })); });
    if (live()) SP.clips = clips; else Object.values(clips).forEach(u => URL.revokeObjectURL(u));
  } catch (x) { if (live()) SP.err = 'Could not download the test. Check your internet connection and try again.'; }
  if (!live()) return;
  SP.loading = false;
  if (S.exam && S.exam.kind === 'sp' && S.screen === 'exam') render();
}
function spProgress() { const t = document.getElementById('sptxt'); if (t) t.textContent = `Downloading the test… ${(SP.got / 1048576).toFixed(1)} MB`; }
async function spMic() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) { SP.mic = 'This browser cannot record. Please open the test in the latest Chrome or Safari.'; render(); return; }
  try { SP.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } }); SP.mic = 'ok'; }
  catch (x) { SP.mic = 'The microphone is not available. Allow microphone access in your browser, then try again.'; }
  render();
}
// 녹음 형식: 크롬은 webm(opus), 사파리는 mp4(aac)
const spRecType = () => ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || '';

/* ---------- 진행 ---------- */
function spAudio() {
  if (SP.au) return SP.au;
  const au = SP.au = new Audio(); au.preload = 'auto';
  au.addEventListener('ended', () => spMediaDone(au));
  au.addEventListener('error', () => { if (au.getAttribute('src')) spMediaDone(au); });
  au.addEventListener('pause', () => spPaused(au));
  return au;
}
function spVideo() {
  if (SP.vid) return SP.vid;
  const v = SP.vid = document.createElement('video');
  v.playsInline = true; v.setAttribute('playsinline', ''); v.disablePictureInPicture = true; v.setAttribute('controlslist', 'nodownload noplaybackrate'); v.className = 'spvid';
  v.addEventListener('contextmenu', ev => ev.preventDefault());
  v.addEventListener('ended', () => spMediaDone(v));
  v.addEventListener('error', () => { if (v.getAttribute('src')) spMediaDone(v); });
  v.addEventListener('pause', () => spPaused(v));
  return v;
}
// 기기가 재생을 멈추면(이어폰이 빠짐, 전화, 이어폰 버튼) ▶ 버튼을 보여 준다. 끝까지 들어서 멈춘 것과 다음 음원으로 바뀌며 멈춘 것은 빼고
function spPaused(el) {
  const e = S.exam, st = e && e.kind === 'sp' && S.screen === 'exam' && e.step >= 0 && spSteps(e.test)[e.step];
  if (!st || el.ended || (e.phase !== 'play' && e.phase !== 'beep') || !SP.clips || el.src !== SP.clips[e.phase === 'beep' ? 'beep.mp3' : st.clip]) return;
  SP.blocked = true; render();
}
// 손을 대지 않고 푸는 시험이라 휴대폰 화면이 꺼지지 않게 한다 (화면을 다시 켜면 다시 요청)
function spWake() { try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(l => { SP.wake = l; }, () => {}); } catch (x) {} }
function spWakeOff() { try { if (SP.wake) SP.wake.release(); } catch (x) {} SP.wake = null; }
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.exam && S.exam.kind === 'sp' && S.exam.step >= 0 && !S.exam.done) spWake(); });
// 시작 버튼을 누른 순간에 재생기를 깨워 둔다 (휴대폰은 사용자가 누를 때만 소리를 처음 틀 수 있다)
function spBegin() {
  const e = S.exam; if (!e || !SP.clips || SP.mic !== 'ok') return;
  spAudio();  // 첫 안내 음성은 이 클릭 안에서 바로 튼다 (spEnter)
  const v = spVideo(); v.muted = true; v.src = SP.clips['q8.mp4']; v.play().then(() => { v.pause(); v.muted = false; }).catch(() => { v.muted = false; });
  spWake();
  e.startedAt = Date.now(); e.step = 0; spEnter();
}
function spEnter() {
  const e = S.exam, st = spSteps(e.test)[e.step];
  if (!st) { spDone(); return; }
  e.phase = 'play'; e.recEnds = null; SP.blocked = false; render(); window.scrollTo(0, 0);
  spPlay(st.clip);
}
function spPlay(name) {
  const url = SP.clips && SP.clips[name], isVid = /\.mp4$/.test(name), el = isVid ? spVideo() : spAudio();
  if (!url) { spMediaDone(el); return; }
  if (isVid) { if (SP.au) SP.au.pause(); spPlaceVideo(); }
  el.src = url; el.currentTime = 0;
  el.play().catch(x => { if (x && x.name === 'NotAllowedError') { SP.blocked = true; render(); } else spMediaDone(el); });
}
// 화면을 다시 그리면 영상 자리(#spv)가 새로 생기므로 같은 영상 요소를 다시 넣는다 (재생이 끊기지 않게)
function spPlaceVideo() { const box = document.getElementById('spv'); if (box && SP.vid && SP.vid.parentNode !== box) box.appendChild(SP.vid); }
function spMediaDone(el) {
  const e = S.exam; if (!e || e.kind !== 'sp' || S.screen !== 'exam') return;
  const st = spSteps(e.test)[e.step]; if (!st) return;
  if (e.phase === 'play') { if (st.t === 'intro') { e.step++; spEnter(); return; } e.phase = 'beep'; render(); spPlay('beep.mp3'); return; }
  if (e.phase === 'beep' && el === SP.au) spRecord(st);
}
function spRecord(st) {
  const e = S.exam, chunks = [], step = e.step;
  let rec;
  try {
    const type = spRecType(); rec = SP.rec = new MediaRecorder(SP.stream, type ? { mimeType: type, audioBitsPerSecond: 32000 } : { audioBitsPerSecond: 32000 });
    rec.ondataavailable = ev => { if (ev.data && ev.data.size) chunks.push(ev.data); };
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
      if (blob.size) SP.recs[st.k] = blob;
      if (S.exam === e && e.step === step) { e.step++; spEnter(); }
    };
    rec.start();
  } catch (x) { SP.rec = null; e.step++; spEnter(); return; }  // 녹음을 못 하면 이 문항은 녹음 없이 넘어간다 (멈춰 서지 않게)
  e.phase = 'rec'; e.recEnds = Date.now() + st.secs * 1000; render();
}
function spStop() { const r = SP.rec; if (r && r.state === 'recording') r.stop(); }
// index.html의 0.5초 타이머가 부른다: 녹음 남은 시간을 고치고, 다 되면 멈춘다
function spTick() {
  const e = S.exam; if (e.phase !== 'rec' || !e.recEnds) return;
  const left = (e.recEnds - Date.now()) / 1000, el = document.getElementById('timer'), bar = document.getElementById('sprecbar');
  if (el) { el.textContent = fmtTime(Math.ceil(Math.max(0, left))); el.classList.toggle('low', left <= 5); }
  if (bar) { const st = spSteps(e.test)[e.step]; bar.style.width = Math.max(0, Math.min(100, (1 - left / st.secs) * 100)) + '%'; }
  if (left <= 0) spStop();
}
function spDone() {
  const e = S.exam;
  e.used = [Math.round((Date.now() - (e.startedAt || Date.now())) / 1000)];
  if (SP.stream) SP.stream.getTracks().forEach(t => t.stop());
  spWakeOff();
  SP.urls = {}; Object.entries(SP.recs).forEach(([k, b]) => { SP.urls[k] = URL.createObjectURL(b); });
  finish();
}
// 낼 녹음: { 키: { mime, data: base64 } }
async function spRecsB64() {
  const out = {};
  for (const [k, b] of Object.entries(SP.recs)) {
    const a = new Uint8Array(await b.arrayBuffer()); let s = '';
    for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
    out[k] = { mime: (b.type || 'audio/webm').replace(/\s+/g, ''), data: btoa(s) };
  }
  return out;
}

/* ---------- 화면 ---------- */
function spTopBar() {
  const e = S.exam, st = e.step >= 0 && spSteps(e.test)[e.step];
  const sec = st ? (st.sec === 'lnr' ? 'Listen and Repeat' : 'Take an Interview') : 'Speaking';
  const timer = e.phase === 'rec' && e.recEnds ? `<span class="timer num" id="timer" aria-label="Recording time left">${fmtTime(Math.ceil((e.recEnds - Date.now()) / 1000))}</span>`
    : `<span class="timer num up" id="timer">${e.phase === 'beep' ? 'Beep' : e.step >= 0 ? 'Listening' : '--:--'}</span>`;
  return `<span class="chip">Speaking ${esc(e.test.title)}</span><span class="chip">${sec}</span><span class="spacer"></span>${timer}`;
}
function viewSpExam() {
  const e = S.exam, t = e.test;
  if (e.step < 0) {
    const ready = SP.clips && SP.mic === 'ok';
    const pack = SP.err ? `<div class="banner bad">${esc(SP.err)}</div><div><button class="btn" data-act="spRetry">Try again</button></div>`
      : `<div class="note num" id="sptxt">${SP.clips ? 'The test is ready.' : `Downloading the test… ${(SP.got / 1048576).toFixed(1)} MB`}</div>`;
    const mic = SP.mic === 'ok' ? '<div class="note">The microphone is ready.</div>'
      : `${SP.mic ? `<div class="banner bad">${esc(SP.mic)}</div>` : ''}<div><button class="btn" data-act="spMic">Turn on the microphone</button></div>`;
    return `<div class="sheet stack lcintro"><div class="eyebrow">Speaking</div><h2>Speaking ${esc(t.title)}</h2>
      <ul class="note lcrules"><li><b>Listen and Repeat</b> (${t.lnr.items.length} sentences): Look at the picture and listen. After the <b>beep</b>, repeat exactly what you heard.</li>
        <li><b>Take an Interview</b> (${t.iv.items.length} questions): Watch the interviewer. After the beep, answer each question for 45 seconds.</li>
        <li>Recording stops automatically when time is up, and the test moves on. Each question plays only once.</li>
        <li>Use earphones in a quiet place. Do not refresh the page during the test, or your recordings will be lost.</li></ul>
      ${pack}${mic}
      <div class="toolbar"><button class="btn primary" data-act="spBegin"${ready ? '' : ' disabled'}>Start</button><button class="btn" data-act="spQuit">Back</button></div></div>`;
  }
  const st = spSteps(t)[e.step]; if (!st) return '<div class="sheet"><h2>Sending your recordings…</h2></div>';
  const blocked = SP.blocked ? `<div><button class="btn primary" data-act="spPlay">▶ Play</button></div>` : '';
  if (st.t === 'intro') {
    const lnr = st.sec === 'lnr';
    return `<div class="stack"><div class="qhead"><h2>${lnr ? 'Listen and Repeat' : 'Take an Interview'}</h2></div>
      <div class="sheet stack"><p class="note" style="margin:0">${lnr ? 'You will listen as someone speaks to you. Listen carefully and then repeat what you have heard.' : 'An interviewer will ask you questions. Answer the questions and be sure to say as much as you can in the time allowed.'}</p>
        <p style="margin:0">${esc(lnr ? t.lnr.situation : t.iv.situation)}</p>${blocked}</div></div>`;
  }
  const items = st.sec === 'lnr' ? t.lnr.items : t.iv.items, pos = items.findIndex(x => x.n === st.n) + 1;
  const status = e.phase === 'rec' ? `<div class="sprecing"><span class="dot-rec" aria-hidden="true"></span>Recording… Speak now.<div class="lcbar thin"><div id="sprecbar" style="width:0%"></div></div></div>`
    : e.phase === 'beep' ? '<div class="note">Start speaking after the beep.</div>' : `<div class="note">${st.sec === 'lnr' ? 'Listen to the sentence.' : 'Listen to the question.'}</div>`;
  const media = st.sec === 'lnr' ? (SP.clips[st.img] ? `<img class="spimg" src="${SP.clips[st.img]}" alt="">` : '') : '<div id="spv" class="spvbox"></div>';
  return `<div class="stack"><div class="qhead"><h2>${st.sec === 'lnr' ? 'Listen and Repeat' : 'Take an Interview'}</h2><span class="note num">Question ${pos} of ${items.length}</span></div>
    <div class="sheet stack spstage">${media}${status}${blocked}</div></div>`;
}
// render() 뒤에 부른다: 인터뷰 화면이면 영상을 제자리에 넣는다
function spAfterRender() { if (S.exam && S.exam.kind === 'sp' && S.screen === 'exam') spPlaceVideo(); }

document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act;
  if (act === 'spStart') startSp(+b.dataset.id);
  else if (act === 'spMic') spMic();
  else if (act === 'spRetry') spLoad();
  else if (act === 'spBegin') spBegin();
  else if (act === 'spQuit') spQuit();
  else if (act === 'spPlay') {  // 휴대폰이 재생을 막았을 때: 누르면 그 자리부터 다시 튼다
    const e = S.exam, st = e && spSteps(e.test)[e.step]; if (!st) return;
    SP.blocked = false; render(); spPlay(e.phase === 'beep' ? 'beep.mp3' : st.clip);
  }
});
// 시험 중에 창을 닫거나 새로고침하면 녹음이 사라진다고 알린다
// 다 풀고 보내는 중이거나 보내지 못한 때도 묻는다 (녹음은 이 창에만 있다). 다 보내면 S.exam이 비어서 묻지 않는다
window.addEventListener('beforeunload', ev => { if (S.exam && S.exam.kind === 'sp' && S.exam.step >= 0) { ev.preventDefault(); ev.returnValue = ''; } });
