// 拜访志 · 敏感词扫描 + 空间清理
const fs = require('fs');
const path = require('path');
const { all, get, run, now, addLog, uuid, ROOT, DB_PATH } = require('./db.js');

const SENS_DEFAULTS = [
  ['故障', '故障'], ['坏了', '故障'], ['报修', '故障'], ['维修', '故障'], ['返修', '故障'],
  ['投诉', '投诉'], ['举报', '投诉'],
  ['退货', '售后'], ['退款', '售后'], ['换货', '售后'],
  ['质量问题', '质量'], ['瑕疵', '质量'],
  ['账期', '账期'], ['赊账', '账期'], ['压款', '账期'],
  ['欠款', '回款'], ['回款', '回款'], ['催款', '回款'], ['逾期', '回款'], ['拖款', '回款'],
  ['竞品', '竞争'], ['换供应商', '竞争'],
];
const TAG_COLORS = { 故障: 'r', 投诉: 'r', 售后: 'y', 质量: 'y', 账期: 'y', 回款: 'y', 竞争: 'b' };

function seed() {
  const n = get('SELECT COUNT(*) c FROM sensitives').c;
  if (n > 0) return;
  const ts = now();
  for (const [word, tag] of SENS_DEFAULTS) {
    run('INSERT OR IGNORE INTO sensitives(word,tag,enabled,hit_count,created_at) VALUES(?,?,1,0,?)', word, tag, ts);
  }
}

function snippet(text, i, len) {
  const s = Math.max(0, i - 30);
  const e = Math.min(text.length, i + len + 46);
  return (s > 0 ? '…' : '') + text.slice(s, e) + (e < text.length ? '…' : '');
}

// 扫描一通通话（转写完成自动触发；replace=true 时重建该通话全部预警）
function scan(callId, replace) {
  const c = get('SELECT id, customer_id, transcript, analyze_status FROM calls WHERE id=?', callId);
  if (!c || !c.transcript) return { ok: true, hits: 0 };
  const words = all("SELECT word,tag FROM sensitives WHERE enabled=1");
  const text = c.transcript;
  if (replace) run("DELETE FROM flags WHERE call_id=? AND source='scan'", callId);
  let hits = 0;
  for (const w of words) {
    const i = text.indexOf(w.word);
    if (i < 0) continue;
    const exists = get('SELECT id FROM flags WHERE call_id=? AND word=?', callId, w.word);
    if (exists) {
      run('UPDATE flags SET tag=?, created_at=? WHERE id=?', w.tag, now(), exists.id);
      continue;
    }
    run(`INSERT INTO flags(id,call_id,customer_id,word,tag,snippet,handled,source,created_at)
         VALUES(?,?,?,?,?,?,0,'scan',?)`,
      uuid(), callId, c.customer_id || null, w.word, w.tag, snippet(text, i, w.word.length), now());
    run('UPDATE sensitives SET hit_count=hit_count+1 WHERE word=?', w.word);
    hits++;
  }
  if (hits > 0) addLog('flag_scan', callId, '命中敏感词 ' + hits + ' 个');
  return { ok: true, hits };
}

// 录音保留天数（settings.keep_audio_days，默认 30；0 = 永久）
function keepDays() {
  const s = get("SELECT v FROM settings WHERE k='keep_audio_days'");
  return Math.max(0, Number((s && s.v) || 30));
}

function cleanupAudio(force) {
  const days = keepDays();
  if (!force && days === 0) return { deleted: 0, freedMB: 0 };
  const cut = new Date(Date.now() - days * 864e5);
  const cutStr = cut.toISOString().slice(0, 10);
  const rows = days === 0
    ? all("SELECT id,audio_path,audio_size FROM calls WHERE transcribe_status='done' AND audio_deleted=0 AND audio_path IS NOT NULL")
    : all(`SELECT id,audio_path,audio_size FROM calls
           WHERE transcribe_status='done' AND audio_deleted=0 AND audio_path IS NOT NULL
           AND created_at < ?`, cutStr + ' 00:00:00');
  let freed = 0;
  const deleted = [];
  for (const r of rows) {
    const p = path.join(ROOT, r.audio_path);
    let sz = 0;
    try {
      if (fs.existsSync(p)) { sz = fs.statSync(p).size; fs.unlinkSync(p); }
    } catch (e) { continue; }
    run("UPDATE calls SET audio_deleted=1, updated_at=? WHERE id=?", now(), r.id);
    freed += sz || r.audio_size || 0;
    deleted.push(r.id);
  }
  if (deleted.length) addLog('audio_clean', '', `清理 ${deleted.length} 段原始录音`);
  return { deleted: deleted.length, freedMB: +(freed / 1048576).toFixed(1) };
}

function purgeTmp() {
  const dir = path.join(ROOT, 'data', 'tmp');
  let n = 0;
  try {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      try { if (Date.now() - fs.statSync(p).mtimeMs > 864e5) { fs.unlinkSync(p); n++; } } catch (e) {}
    }
  } catch (e) {}
  return n;
}

// 转写中间 json 保留 3 天（防回退排查），更早即删
function pruneAsr() {
  const dir = path.join(ROOT, 'data', 'asr');
  let n = 0;
  try {
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json')) continue;
      const p = path.join(dir, f);
      try { if (Date.now() - fs.statSync(p).mtimeMs > 3 * 864e5) { fs.unlinkSync(p); n++; } } catch (e) {}
    }
  } catch (e) {}
  return n;
}

function trimLogs() {
  const cut = new Date(Date.now() - 120 * 864e5).toISOString().slice(0, 10);
  const r = run("DELETE FROM logs WHERE ts < ?", cut + ' 00:00:00');
  return r.changes;
}

// 已处理的预警保留 30 天后归档清理（与页面文案一致）
function pruneFlags() {
  const cut = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  const r = run("DELETE FROM flags WHERE handled=1 AND handled_at < ?", cut + ' 00:00:00');
  if (r.changes) addLog('flag_prune', '', `清理已处理预警 ${r.changes} 条`);
  return r.changes;
}

function dirSize(p) {
  try {
    let s = 0;
    for (const f of fs.readdirSync(p)) {
      const fp = path.join(p, f);
      try { s += fs.statSync(fp).isDirectory() ? dirSize(fp) : fs.statSync(fp).size; } catch (e) {}
    }
    return s;
  } catch (e) { return 0; }
}

function storage() {
  const by = (sql, ...a) => (get(sql, ...a) || {}).v || 0;
  const candidates = all(`SELECT audio_size FROM calls
    WHERE transcribe_status='done' AND audio_deleted=0 AND audio_path IS NOT NULL`).length;
  const bDir = path.join(ROOT, 'data', 'backups');
  const bN = (fs.existsSync(bDir) ? fs.readdirSync(bDir).filter(f => f.endsWith('.db')).length : 0);
  const model = (get("SELECT v FROM settings WHERE k='model'") || {}).v || 'small';
  const mSmall = dirSize(path.join(ROOT, 'models', 'small'));
  const mBase = dirSize(path.join(ROOT, 'models', 'base'))
    + dirSize(path.join(process.env.HOME || '', '.cache', 'whisper-models', 'base'));
  return {
    ok: true,
    audio: { totalMB: +(by('SELECT COALESCE(SUM(audio_size),0) v FROM calls WHERE audio_deleted=0') / 1048576).toFixed(1), deletable: candidates },
    backups: { n: bN, mb: +(dirSize(bDir) / 1048576).toFixed(1) },
    model: { cur: model, smallMB: +(mSmall / 1048576).toFixed(0), baseMB: +(mBase / 1048576).toFixed(0) },
    db: { mb: +(fs.existsSync(DB_PATH) ? fs.statSync(DB_PATH).size : 0) / 1048576 },
    asrJson: +(dirSize(path.join(ROOT, 'data', 'asr')) / 1048576).toFixed(2),
    keepDays: keepDays(),
  };
}

function cleanupAll() { purgeTmp(); pruneAsr(); trimLogs(); pruneFlags(); cleanupAudio(false); }

module.exports = { seed, scan, cleanupAudio, cleanupAll, purgeTmp, pruneAsr, trimLogs, storage, keepDays, TAG_COLORS };
