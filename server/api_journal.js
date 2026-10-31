// 拜访志 · 日程速记（线下活动补录）
// 落点：<日程目录>\YYYY-MM-DD.md，每行一条，便于外部自动化读取
// 行格式：HH:MM-HH:MM 事件   或   HH:MM 事件
//
// 目录通过环境变量 VL_JOURNAL_DIR 配置；未配置时落在项目内的 data/journal/，
// 不会写到项目目录之外。
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./db.js');

const DIR = process.env.VL_JOURNAL_DIR
  ? path.resolve(process.env.VL_JOURNAL_DIR)
  : path.join(ROOT, 'data', 'journal');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ITEM_RE = /^(\d{1,2}:\d{2})\s*(?:[-~–—至]\s*(\d{1,2}:\d{2}))?\s+(.+)$/;

const pad = (n) => String(n).padStart(2, '0');
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function normDate(q) {
  const s = (q && q.get('date')) || '';
  return DATE_RE.test(s) ? s : todayStr();
}
function fileOf(date) {
  if (!DATE_RE.test(date)) throw new Error('日期格式应为 YYYY-MM-DD');
  return path.join(DIR, date + '.md');
}
function ensureDir() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
}
function readRaw(date) {
  const f = fileOf(date);
  if (!fs.existsSync(f)) return '';
  return fs.readFileSync(f, 'utf8');
}
function parse(raw) {
  const items = [];
  raw.split(/\r?\n/).forEach((line, i) => {
    const m = line.match(ITEM_RE);
    if (!m) return;
    items.push({ line: i, start: m[1], end: m[2] || '', text: m[3].trim() });
  });
  return items;
}
function sortMarks(items) {
  const k = (t) => {
    if (!t) return 9999;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  return items.slice().sort((a, b) => k(a.start) - k(b.start));
}
function writeRaw(date, raw) {
  ensureDir();
  fs.writeFileSync(fileOf(date), raw, 'utf8');
}
function template(date) {
  return [
    '# ' + date + ' 线下日程速记',
    '',
    '> 格式：一行一条，`开始-结束 事件`（24 小时制）。只记系统里看不见的事——面试、会议、外出、谈话。',
    '',
    '',
  ].join('\n');
}

module.exports = {
  // 读某天速记
  'GET /api/journal': (req, res, payload, q) => {
    const date = normDate(q);
    const raw = readRaw(date);
    const items = sortMarks(parse(raw));
    return {
    ok: true, date, items, count: items.length,
    // 只回传目录名，不回传绝对路径：避免在界面上暴露本机目录结构
    dir: path.basename(DIR),
    exists: !!raw,
  };
  },

  // 追加一条（也可一次传多条）
  'POST /api/journal': (req, res, payload) => {
    const date = DATE_RE.test(payload.date || '') ? payload.date : todayStr();
    let list = Array.isArray(payload.items) ? payload.items : [payload];
    const clean = [];
    for (const it of list) {
      const start = String(it.start || '').trim();
      const end = String(it.end || '').trim();
      const text = String(it.text || '').trim();
      if (!/^\d{1,2}:\d{2}$/.test(start) || !text) continue;
      if (end && !/^\d{1,2}:\d{2}$/.test(end)) continue;
      clean.push(`${start}${end ? '-' + end : ''} ${text}`);
    }
    if (!clean.length) return { ok: false, err: '请填写开始时间（HH:MM）和事件内容' };

    let raw = readRaw(date);
    if (!raw) raw = template(date);
    if (!raw.endsWith('\n')) raw += '\n';
    raw += clean.join('\n') + '\n';
    writeRaw(date, raw);

    const items = sortMarks(parse(raw));
    return { ok: true, date, added: clean.length, items, count: items.length };
  },

  // 按行号删除一条
  'POST /api/journal/del': (req, res, payload) => {
    const date = DATE_RE.test(payload.date || '') ? payload.date : todayStr();
    const line = Number(payload.line);
    const raw = readRaw(date);
    if (!raw) return { ok: false, err: '当天没有速记' };
    const lines = raw.split(/\r?\n/);
    if (!(line >= 0 && line < lines.length) || !ITEM_RE.test(lines[line])) {
      return { ok: false, err: '条目不存在' };
    }
    lines.splice(line, 1);
    writeRaw(date, lines.join('\n'));
    const items = sortMarks(parse(lines.join('\n')));
    return { ok: true, date, items, count: items.length };
  },
};
