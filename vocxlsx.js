/* 구문단어 엑셀(.xlsx) 읽기 — 관리자 페이지에서만 쓴다. 외부 라이브러리 없이 브라우저의 압축 풀기(DecompressionStream)로 읽는다.
   첫 시트에서 머리글 줄(단어·구문 칸과 뜻 칸이 있는 줄)을 찾아, 영어 칸과 그 오른쪽 뜻 칸을 짝짓는다.
   머리글 예: "단어 영 | 단어 한 | 구문 영 | 구문 한", "번호 | 단어스펠 | 단어뜻 | 구문스펠 | 구문뜻", "단어 | 뜻 | 구문 | 뜻"
   칸이 하나만 찬 줄(예: "① Comparative Advantage")은 소제목으로 본다.
   readVocXlsx(ArrayBuffer, 파일 이름) → { title, heads, words: [{ en, ko, h }], phrases: [{ en, ko, h }], skip: 뜻이 없어 뺀 줄 수 } */
async function vocUnzip(buf, want) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf), out = {};
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('엑셀(.xlsx) 파일이 아니에요.');
  let p = dv.getUint32(eocd + 16, true);
  const n = dv.getUint16(eocd + 10, true), dec = new TextDecoder();
  for (let k = 0; k < n && dv.getUint32(p, true) === 0x02014b50; k++) {
    const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true);
    const el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
    p += 46 + nl + el + cl;
    if (!want(name)) continue;
    const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), raw = u8.subarray(start, start + size);
    if (method === 0) out[name] = dec.decode(raw);
    else if (method === 8) out[name] = await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  }
  return out;
}
const vocXml = s => String(s).replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (a, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1))
  : { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e.toLowerCase()]));
// <t> 글자만 이어 붙인다 (일본어 읽기 표시 <rPh>는 뺀다)
const vocText = x => vocXml(String(x).replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').match(/<t\b[^>]*>[\s\S]*?<\/t>/g)?.map(t => t.replace(/<[^>]+>/g, '')).join('') || '');
const vocCol = ref => [...ref].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
// 파일 이름에서 세트 제목: 확장자, " (2)" 같은 사본 표시, "구문단어"라는 말과 _를 뺀다
const vocTitle = name => String(name).normalize('NFC').replace(/\.xlsx$/i, '').replace(/\s*\(\d+\)\s*$/, '').replace(/구문\s*단어|단어\s*구문/g, ' ').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

async function readVocXlsx(buf, fileName) {
  const files = await vocUnzip(buf, n => n === 'xl/workbook.xml' || n === 'xl/_rels/workbook.xml.rels' || n === 'xl/sharedStrings.xml' || /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  // 첫 시트: workbook.xml의 첫 <sheet>가 가리키는 파일
  const rid = ((files['xl/workbook.xml'] || '').match(/<sheet\b[^>]*\br:id="([^"]+)"/) || [])[1];
  const target = rid && ((files['xl/_rels/workbook.xml.rels'] || '').match(new RegExp('<Relationship\\b[^>]*Id="' + rid + '"[^>]*Target="([^"]+)"')) || (files['xl/_rels/workbook.xml.rels'] || '').match(new RegExp('<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="' + rid + '"')) || [])[1];
  const sheetXml = (target && files['xl/' + target.replace(/^\/?xl\//, '').replace(/^\//, '')]) || files['xl/worksheets/sheet1.xml'];
  if (!sheetXml) throw new Error('시트를 찾지 못했어요.');
  const shared = (files['xl/sharedStrings.xml'] || '').match(/<si\b[^>]*>[\s\S]*?<\/si>/g)?.map(vocText) || [];
  const rows = (sheetXml.match(/<row\b[^>]*>[\s\S]*?<\/row>/g) || []).map(r => {
    const row = [];
    (r.match(/<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []).forEach(c => {
      const ref = (c.match(/\br="([A-Z]+)\d+"/) || [])[1], t = (c.match(/\bt="(\w+)"/) || [])[1], v = (c.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      if (!ref) return;
      const val = t === 's' ? shared[+v] : t === 'inlineStr' ? vocText(c) : v != null ? vocXml(v) : '';
      row[vocCol(ref)] = String(val == null ? '' : val).replace(/\s+/g, ' ').trim();
    });
    return row;
  });
  // 머리글 줄: 단어·구문 칸과 뜻 칸이 함께 있는 첫 줄 (위 15줄 안)
  const isKo = h => /뜻|한\s*\)?\s*$|meaning|korean/i.test(h || '');
  const isEn = h => !isKo(h) && /단어|구문|word|phrase/i.test(h || '');
  const hi = rows.slice(0, 15).findIndex(r => r.some(isEn) && r.some(isKo));
  if (hi < 0) throw new Error('머리글(단어 · 뜻 · 구문 · 뜻) 줄을 찾지 못했어요.');
  const head = rows[hi], pairs = [];
  head.forEach((h, i) => {
    if (!isEn(h)) return;
    let j = i + 1; while (j < head.length && !isKo(head[j]) && !isEn(head[j])) j++;
    if (isKo(head[j])) pairs.push({ kind: /구문|phrase/i.test(h) ? 'p' : 'w', en: i, ko: j });
  });
  if (!pairs.length) throw new Error('단어·구문 칸과 뜻 칸을 짝짓지 못했어요.');
  const heads = [], words = [], phrases = [], seen = { w: new Set(), p: new Set() };
  let skip = 0;
  rows.slice(hi + 1).forEach(r => {
    const filled = r.filter(x => x);
    if (filled.length === 1 && !/^\d+\.?$/.test(filled[0]) && !pairs.some(pr => r[pr.en] && r[pr.ko])) { heads.push(filled[0].slice(0, 200)); return; }
    pairs.forEach(pr => {
      const en = r[pr.en], ko = r[pr.ko];
      if (en && !ko && !/^\d+\.?$/.test(en)) skip++;
      if (!en || !ko || /^\d+\.?$/.test(en)) return;
      const key = en.toLowerCase();
      if (seen[pr.kind].has(key)) return;  // 같은 세트에서 겹치면 처음 것만
      seen[pr.kind].add(key);
      (pr.kind === 'p' ? phrases : words).push({ en, ko, h: heads.length - 1 });
    });
  });
  if (!words.length && !phrases.length) throw new Error('단어도 구문도 읽지 못했어요.');
  return { title: vocTitle(fileName), heads, words, phrases, skip };
}
if (typeof module !== 'undefined') module.exports = { readVocXlsx, vocTitle };
