/* 스피킹 모의고사 (NEW TOEFL): Listen and Repeat 7문장 → Take an Interview 4질문.
   문제(그림·문장 음성·선생님이 만든 인터뷰 영상·삐 소리)는 시작 전에 묶음 하나로 받아 두고 기기 안에서 튼다 (listening.js와 같은 방식).
   문제가 끝나면 삐 소리가 나고 바로 녹음이 시작되며, 정해진 시간이 지나면 저절로 멈추고 다음으로 넘어간다.
   녹음은 이 창의 메모리에만 있다가 다 끝나면 한꺼번에 낸다 (새로고침하면 처음부터 다시). 낸 뒤에는 내 녹음을 다시 들을 수 있다.
   S.exam (스피킹) = { kind: 'sp', test, showAnswers, step, phase: 'play' | 'beep' | 'rec', recEnds, startedAt, used }
   SP: 받은 묶음(clips: 이름 → 재생 주소), 재생기, 마이크, 녹음(recs: 키 → Blob) */
const SP = { key: '', clips: null, loading: false, got: 0, need: 0, err: '', au: null, vid: null, stream: null, mic: '', rec: null, recs: {}, urls: {}, blocked: false, tok: null, wake: null,
  check: null, checkMsg: '', opt: 0, again: {}, note: '', diag: null };
// 녹음 파일이 이보다 작으면 소리 없는 빈 껍데기다 (아이폰 사파리 WebM이 5바이트만 남긴 적이 있다)
const SP_MIN = 1000;
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
  if (SP.check && SP.check.url) URL.revokeObjectURL(SP.check.url);
  Object.assign(SP, { key: '', clips: null, loading: false, got: 0, need: 0, err: '', stream: null, mic: '', rec: null, recs: {}, blocked: false, tok: null,
    check: null, checkMsg: '', opt: 0, again: {}, note: '', micP: null, diag: { ua: navigator.userAgent.slice(0, 200), check: [], recs: [], ev: [] } });
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
// 마이크를 (다시) 켠다. 켜 둔 마이크가 끊겼거나(트랙 끝남·음소거) 녹음이 비어 나오면 새로 받는다
function spGetMic() {
  if (SP.micP) return SP.micP;  // 동시에 두 번 불려도 마이크는 하나만 켠다
  const d = SP.diag;
  return SP.micP = (async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      // 기다리는 사이 시험을 나갔거나(뒤로·다 냄) 새 시험을 열었으면 이 마이크는 바로 끈다 (켜진 채 남지 않게)
      if (SP.diag !== d || !S.exam || S.exam.kind !== 'sp' || S.exam.done) { s.getTracks().forEach(t => t.stop()); throw new Error('closed'); }
      if (SP.stream) SP.stream.getTracks().forEach(t => t.stop());
      const t = s.getAudioTracks()[0];
      if (t) ['ended', 'mute', 'unmute'].forEach(n => t.addEventListener(n, () => spLog(n)));
      SP.stream = s; SP.mic = 'ok';
    } finally { if (SP.diag === d) SP.micP = null; }  // 나간 시험의 늦은 요청이 새 시험의 요청을 지우지 않게
  })();
}
// 진단 기록: 무슨 일이 몇 번 문제, 시작 몇 초에 있었는지 (녹음 파일과 함께 낸다)
function spLog(what) {
  const e = S.exam && S.exam.kind === 'sp' ? S.exam : null;
  if (SP.diag && SP.diag.ev.length < 100) SP.diag.ev.push(what + '@' + (e ? e.step : '') + ':' + (e && e.startedAt ? Math.round((Date.now() - e.startedAt) / 1000) : ''));
}
const spLive = () => { const t = SP.stream && SP.stream.getAudioTracks()[0]; return !!t && t.readyState === 'live' && !t.muted; };
// 녹음 형식 후보 (앞에서부터 마이크 확인으로 되는 것을 고른다). 아이폰 녹음이 비었던 것은 형식 탓이 아니라 마이크가 멈춘 탓이었다
function spRecOpts() {
  const sup = m => { try { return MediaRecorder.isTypeSupported(m); } catch (x) { return false; } };
  return [{ mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 32000 }, { mimeType: 'audio/mp4', audioBitsPerSecond: 32000 }, { mimeType: 'audio/mp4' }, {}]
    .filter(o => !o.mimeType || sup(o.mimeType));
}
const spOptName = o => (o ? (o.mimeType || 'default') + (o.audioBitsPerSecond ? ' ' + o.audioBitsPerSecond : '') : 'none');
// 정해진 시간만큼 녹음한 Blob (녹음기를 못 만들면 null)
function spRecFor(opts, ms) {
  return new Promise(res => {
    const chunks = []; let rec;
    try {
      rec = new MediaRecorder(SP.stream, opts);
      rec.ondataavailable = ev => { if (ev.data && ev.data.size) chunks.push(ev.data); };
      rec.onstop = () => res(new Blob(chunks, { type: (rec.mimeType || opts.mimeType || 'audio/webm').replace(/\s+/g, '') }));
      rec.start();
    } catch (x) { res(null); return; }
    setTimeout(() => { try { rec.stop(); } catch (x) { res(null); } }, ms);
  });
}
// 녹음이 제대로 됐는지: 크기, 그리고 풀어서 길이와 소리 크기를 본다 (이 브라우저가 못 푸는 형식이면 크기만 본다)
async function spQuality(blob) {
  if (!blob || blob.size < SP_MIN) return { ok: false };
  try {
    const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext, ab = await blob.arrayBuffer(), ctx = new AC(1, 1, 44100);
    const buf = await new Promise((res, rej) => { const p = ctx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); });
    const d = buf.getChannelData(0); let pk = 0; for (let i = 0; i < d.length; i += 4) pk = Math.max(pk, Math.abs(d[i]));
    return { ok: buf.duration >= 1, dur: +buf.duration.toFixed(1), peak: +pk.toFixed(3) };
  } catch (x) { return { ok: true, dur: null, peak: null }; }
}
// 삐 소리 한 번 (묶음을 아직 못 받았으면 건너뛴다)
function spBeep() {
  const url = SP.clips && SP.clips['beep.mp3']; if (!url) return Promise.resolve();
  const au = spAudio();
  return new Promise(res => { const t = setTimeout(res, 3000); au.addEventListener('ended', () => { clearTimeout(t); res(); }, { once: true }); au.src = url; au.play().catch(() => { clearTimeout(t); res(); }); });
}
// 마이크 확인: 시험과 같은 순서(삐 → 녹음)로 3.5초 녹음해서 소리가 담기는지 본다. 안 되면 다른 형식으로 다시
async function spCheck() {
  if (SP.check === 'run') return;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) { SP.mic = 'This browser cannot record. Please update the browser, or use another device.'; render(); return; }
  const au = spAudio(); au.src = lcSilent(); au.play().catch(() => {});  // 이 탭 안에서 재생기를 깨워 둔다 (휴대폰)
  if (SP.check && SP.check.url) URL.revokeObjectURL(SP.check.url);
  const d = SP.diag, gone = () => SP.diag !== d;  // 확인 도중 뒤로 나가거나 다른 시험을 열면 여기서 멈춘다
  SP.check = 'run'; SP.checkMsg = 'Turning on the microphone…'; SP.mic = ''; render();
  try { await spGetMic(); } catch (x) { if (gone()) return; SP.check = null; SP.mic = 'The microphone is not available. Allow microphone access for this site, then try again.'; render(); return; }
  if (gone()) return;
  const opts = spRecOpts();
  for (let i = 0; i < opts.length; i++) {
    if (i) { try { await spGetMic(); } catch (x) {} if (gone()) return; }
    SP.checkMsg = 'Get ready. Speak after the beep.'; render();
    await spBeep();
    if (gone()) return;
    SP.checkMsg = (i ? 'Once more, please. ' : '') + 'Recording… Say a sentence, for example: "Hello, my name is …"'; render();
    const blob = await spRecFor(opts[i], 3500), q = await spQuality(blob);
    if (gone()) return;
    SP.diag.check.push({ o: spOptName(opts[i]), size: blob ? blob.size : -1, mime: blob ? blob.type : '', dur: q.dur, peak: q.peak });
    if (q.ok) { SP.opt = i; SP.check = { url: URL.createObjectURL(blob), low: q.peak != null && q.peak < 0.02 }; render(); return; }
  }
  SP.check = 'fail'; render();
}

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
function spWake() {
  try {
    if (!navigator.wakeLock) { spLog('wl:none'); return; }
    navigator.wakeLock.request('screen').then(l => { SP.wake = l; spLog('wl:ok'); }, () => spLog('wl:err'));
  } catch (x) { spLog('wl:err'); }
}
function spWakeOff() { try { if (SP.wake) SP.wake.release(); } catch (x) {} SP.wake = null; }
// 화면이 꺼지거나 다른 앱으로 가면 아이폰은 마이크를 멈추고, 30초쯤 지나면 아예 끊는다 (그래서 기록해 두고, 돌아오면 화면 켜짐을 다시 요청)
document.addEventListener('visibilitychange', () => {
  if (!S.exam || S.exam.kind !== 'sp' || S.exam.step < 0 || S.exam.done) return;
  spLog('vis:' + document.visibilityState);
  if (document.visibilityState === 'visible') spWake();
});
// 시작 버튼을 누른 순간에 재생기를 깨워 둔다 (휴대폰은 사용자가 누를 때만 소리를 처음 틀 수 있다)
function spBegin() {
  const e = S.exam; if (!e || !SP.clips || !(SP.check && SP.check.url)) return;
  spAudio();  // 첫 안내 음성은 이 클릭 안에서 바로 튼다 (spEnter)
  if (!spLive()) spGetMic().catch(() => {});  // 확인한 뒤 오래 두어 마이크가 끊겼으면 첫 녹음 전에 다시 켠다
  // 인터뷰 영상을 미리 소리 끄고 틀었다 켜는 방법은 쓰지 않는다: 아이폰에서 마이크가 끊기는 원인으로 의심된다.
  // 마이크를 쓰는 중인 페이지는 사파리·크롬 모두 소리 있는 재생을 허락하고, 막히면 ▶ Play 버튼이 나온다
  spVideo();
  spWake();
  e.startedAt = Date.now(); e.step = 0; spEnter();
}
async function spEnter() {
  const e = S.exam, step = e.step, st = spSteps(e.test)[step];
  if (!st) { spDone(); return; }
  e.phase = 'play'; e.recEnds = null; SP.blocked = false; if (!SP.again[st.k]) SP.note = ''; render(); window.scrollTo(0, 0);
  // 마이크가 끊겼으면 문제를 틀기 전에 다시 켠다 (삐 소리 뒤에 켜면 대답 앞부분이 잘린다). 안내 단계는 시작 버튼 클릭 안에서 바로 틀어야 해서 기다리지 않는다
  if (st.t === 'q' && !spLive()) { spLog('relive'); try { await spGetMic(); } catch (x) {} if (S.exam !== e || e.step !== step) return; }
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
async function spRecord(st) {
  const e = S.exam, chunks = [], step = e.step, live = () => S.exam === e && e.step === step;
  if (!spLive()) { try { await spGetMic(); } catch (x) {} if (!live()) return; }  // 마이크가 끊겨 있으면 다시 켜고 녹음
  const opts = spRecOpts()[SP.opt] || {};
  let rec;
  try {
    rec = SP.rec = new MediaRecorder(SP.stream, opts);
    rec.ondataavailable = ev => { if (ev.data && ev.data.size) chunks.push(ev.data); };
    rec.onstop = () => { if (live()) spRecorded(st, new Blob(chunks, { type: (rec.mimeType || opts.mimeType || 'audio/webm').replace(/\s+/g, '') })); };
    rec.start();
  } catch (x) { SP.rec = null; spRecorded(st, null); return; }
  e.phase = 'rec'; e.recEnds = Date.now() + st.secs * 1000; render();
}
// 녹음 하나가 끝났을 때: 소리가 담겼으면(풀어서 1초 이상) 다음으로. 비었으면 마이크를 새로 켜서 같은 문제를 한 번 더
async function spRecorded(st, blob) {
  const e = S.exam, step = e.step, q = await spQuality(blob);
  if (S.exam !== e || e.step !== step) return;
  SP.diag.recs.push({ k: st.k, size: blob ? blob.size : -1, mime: blob ? blob.type : '', dur: q.dur, again: SP.again[st.k] || 0 });
  // 녹음기는 받은 소리만 쓴다 (조용해도 길이는 찬다). 그래서 정한 시간보다 훨씬 짧으면 대답 도중 마이크가 멈춘 것: 다시 묻되, 건너뛸 때를 위해 앞부분은 남긴다
  if (q.ok && q.dur != null && q.dur < st.secs * 0.6) { q.ok = false; SP.recs[st.k] = blob; spLog('short'); }
  if (q.ok) { SP.recs[st.k] = blob; delete SP.again[st.k]; e.step++; spEnter(); return; }
  if (!SP.again[st.k]) {
    SP.again[st.k] = 1; SP.note = 'Your answer was not recorded. The question will play again. Please answer once more.';
    e.phase = 'play'; render();
    try { await spGetMic(); } catch (x) {}
    if (S.exam === e && e.step === step) spEnter();
    return;
  }
  // 두 번 연달아 비었으면 그냥 넘어가지 않고 멈춰서 학생이 직접 마이크를 다시 켜게 한다 (아이폰은 탭으로 켜는 것이 가장 확실하다)
  spLog('dead'); SP.note = ''; e.phase = 'mic'; render();
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
    : `<span class="timer num up" id="timer">${e.phase === 'beep' ? 'Beep' : e.phase === 'mic' || e.phase === 'fix' ? 'Paused' : e.step >= 0 ? 'Listening' : '--:--'}</span>`;
  return `<span class="chip">Speaking ${esc(e.test.title)}</span><span class="chip">${sec}</span><span class="spacer"></span>${timer}`;
}
function viewSpExam() {
  const e = S.exam, t = e.test;
  if (e.step < 0) {
    const ready = SP.clips && SP.check && SP.check.url;
    const pack = SP.err ? `<div class="banner bad">${esc(SP.err)}</div><div><button class="btn" data-act="spRetry">Try again</button></div>`
      : `<div class="note num" id="sptxt">${SP.clips ? 'The test is ready.' : `Downloading the test… ${(SP.got / 1048576).toFixed(1)} MB`}</div>`;
    const c = SP.check, mic = c === 'run' ? `<div class="sprecing"><span class="dot-rec" aria-hidden="true"></span>${esc(SP.checkMsg)}</div>`
      : c && c.url ? `<div class="stack"><div class="note">The microphone works. Listen to your test recording:</div><audio controls src="${c.url}"></audio>
          ${c.low ? '<div class="banner">Your voice was very quiet. Speak louder or move closer to the microphone, then test again.</div>' : ''}
          <div><button class="btn" data-act="spMic">Test again</button></div></div>`
      : `${SP.mic && SP.mic !== 'ok' ? `<div class="banner bad">${esc(SP.mic)}</div>` : ''}${c === 'fail' ? '<div class="banner bad">Your voice could not be recorded. Close other apps that use the microphone, reload this page and try again. If it still fails, try another device.</div>' : ''}
        <div class="note">Microphone check: tap the button, and after the beep say one sentence (about 3 seconds).</div>
        <div><button class="btn" data-act="spMic"${SP.clips ? '' : ' disabled'}>${c === 'fail' ? 'Try again' : 'Check the microphone'}</button></div>`;
    return `<div class="sheet stack lcintro"><div class="eyebrow">Speaking</div><h2>Speaking ${esc(t.title)}</h2>
      <ul class="note lcrules"><li><b>Listen and Repeat</b> (${t.lnr.items.length} sentences): Look at the picture and listen. After the <b>beep</b>, repeat exactly what you heard.</li>
        <li><b>Take an Interview</b> (${t.iv.items.length} questions): Watch the interviewer. After the beep, answer each question for 45 seconds.</li>
        <li>Recording stops automatically when time is up, and the test moves on. Each question plays only once.</li>
        <li>Use earphones in a quiet place. Do not refresh the page during the test, or your recordings will be lost.</li>
        <li>Keep this page open and the screen on until the end. If you lock the phone, switch apps or take a call, the microphone stops.</li></ul>
      ${'wakeLock' in navigator ? '' : '<div class="banner">Your screen may turn off by itself during the test. Set Auto-Lock to Never before you start.</div>'}
      ${pack}${mic}
      <div class="toolbar"><button class="btn primary" data-act="spBegin"${ready ? '' : ' disabled'}>Start</button><button class="btn" data-act="spQuit">Back</button></div></div>`;
  }
  const st = spSteps(t)[e.step]; if (!st) return '<div class="sheet"><h2>Sending your recordings…</h2></div>';
  const blocked = (SP.note ? `<div class="banner">${esc(SP.note)}</div>` : '') + (SP.blocked ? `<div><button class="btn primary" data-act="spPlay">▶ Play</button></div>` : '');
  if (st.t === 'intro') {
    const lnr = st.sec === 'lnr';
    return `<div class="stack"><div class="qhead"><h2>${lnr ? 'Listen and Repeat' : 'Take an Interview'}</h2></div>
      <div class="sheet stack"><p class="note" style="margin:0">${lnr ? 'You will listen as someone speaks to you. Listen carefully and then repeat what you have heard.' : 'An interviewer will ask you questions. Answer the questions and be sure to say as much as you can in the time allowed.'}</p>
        <p style="margin:0">${esc(lnr ? t.lnr.situation : t.iv.situation)}</p>${blocked}</div></div>`;
  }
  const items = st.sec === 'lnr' ? t.lnr.items : t.iv.items, pos = items.findIndex(x => x.n === st.n) + 1;
  const status = e.phase === 'fix' ? '<div class="note">Turning the microphone back on…</div>' : e.phase === 'mic' ? `<div class="banner bad">The microphone stopped recording. Tap the button to turn it back on, then answer this question again.</div>
      ${SP.mic && SP.mic !== 'ok' ? `<div class="banner bad">${esc(SP.mic)}</div>` : ''}
      <div class="toolbar"><button class="btn primary" data-act="spMicFix">Turn the microphone back on</button><button class="btn" data-act="spSkip">Skip this question</button></div>`
    : e.phase === 'rec' ? `<div class="sprecing"><span class="dot-rec" aria-hidden="true"></span>Recording… Speak now.<div class="lcbar thin"><div id="sprecbar" style="width:0%"></div></div></div>`
    : e.phase === 'beep' ? '<div class="note">Start speaking after the beep.</div>' : `<div class="note">${st.sec === 'lnr' ? 'Listen to the sentence.' : 'Listen to the question.'}</div>`;
  const media = st.sec === 'lnr' ? (SP.clips[st.img] ? `<img class="spimg" src="${SP.clips[st.img]}" alt="">` : '') : '<div id="spv" class="spvbox"></div>';
  return `<div class="stack"><div class="qhead"><h2>${st.sec === 'lnr' ? 'Listen and Repeat' : 'Take an Interview'}</h2><span class="note num">Question ${pos} of ${items.length}</span></div>
    <div class="sheet stack spstage">${media}${status}${blocked}</div></div>`;
}
// 멈춘 문제에서 「마이크 다시 켜기」: 탭 안에서 마이크를 새로 켜고 같은 문제를 처음부터 다시
async function spMicFix() {
  const e = S.exam, step = e && e.step, st = e && e.phase === 'mic' && spSteps(e.test)[step]; if (!st) return;
  e.phase = 'fix'; SP.mic = ''; render();  // 두 번 눌러도 한 번만 (버튼이 사라진다)
  const au = spAudio(); au.src = lcSilent(); au.play().catch(() => {});  // 이 탭으로 재생기도 깨운다 (지난 삐 소리를 다시 틀지 않게 무음으로)
  spLog('fix');
  try { await spGetMic(); } catch (x) { if (S.exam !== e || e.phase !== 'fix') return; e.phase = 'mic'; SP.mic = 'The microphone could not be turned on. Allow microphone access for this site, then tap the button again.'; render(); return; }
  if (S.exam !== e || e.step !== step || e.phase !== 'fix') return;
  delete SP.again[st.k]; spEnter();
}
// render() 뒤에 부른다: 인터뷰 화면이면 영상을 제자리에 넣는다
function spAfterRender() { if (S.exam && S.exam.kind === 'sp' && S.screen === 'exam') spPlaceVideo(); }

document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act;
  if (act === 'spStart') startSp(+b.dataset.id);
  else if (act === 'spMic') spCheck();
  else if (act === 'spMicFix') spMicFix();
  else if (act === 'spSkip') { const e = S.exam, st = e && e.phase === 'mic' && spSteps(e.test)[e.step]; if (!st) return; delete SP.again[st.k]; spLog('skip'); e.step++; spEnter(); }
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
