// 拜访志 · 预警 / 敏感词库 / 跟进记录 / 设置 / 空间
const { all, get, run, now, addLog, uuid, ownerName, resetOwnerCache } = require('./db.js');
const sens = require('./sensitive.js');

const FLAG_SQL = `SELECT f.*, cl.title AS call_title, cl.visited_at,
  (SELECT name FROM customers WHERE id=f.customer_id) AS customer_name
  FROM flags f LEFT JOIN calls cl ON cl.id=f.call_id`;

module.exports = {
  // ── 预警 ─────────────────────────────
  'GET /api/flags': async (req, res, b, q) => {
    const onlyOpen = q.get('open') === '1';
    const open = get("SELECT COUNT(*) c FROM flags WHERE handled=0").c;
    let sql = FLAG_SQL + (onlyOpen ? ' WHERE f.handled=0' : '') + ' ORDER BY f.handled ASC, f.created_at DESC LIMIT 300';
    return { ok: true, open, list: all(sql) };
  },

  'POST /api/flags/:id': async (req, res, b) => {
    const v = b.value ? 1 : 0;
    run('UPDATE flags SET handled=?, handled_at=? WHERE id=?', v, v ? now() : null, req.params.id);
    addLog('flag_' + (v ? 'done' : 'reopen'), req.params.id, b.tag || '');
    return { ok: true };
  },

  // 重扫某通 / 全量重扫（词库增删后）
  'POST /api/flags/rescan': async (req, res, b) => {
    if (b.call_id) {
      const r = sens.scan(b.call_id, true);
      return { ...r, open: get('SELECT COUNT(*) c FROM flags WHERE handled=0').c };
    }
    let hits = 0;
    const rows = all("SELECT id FROM calls WHERE transcript IS NOT NULL AND transcript<>''");
    for (const c of rows) hits += sens.scan(c.id, true).hits;
    return { ok: true, calls: rows.length, hits };
  },

  // ── 敏感词库 ─────────────────────────
  'GET /api/sens': async () => ({ ok: true, list: all('SELECT * FROM sensitives ORDER BY enabled DESC, id') }),

  'POST /api/sens': async (req, res, b) => {
    const a = b.action, word = String(b.word || '').trim();
    if (a === 'add' && word) {
      run(`INSERT INTO sensitives(word,tag,enabled,hit_count,created_at) VALUES(?,?,1,0,?)
           ON CONFLICT(word) DO UPDATE SET tag=excluded.tag, enabled=1`, word, b.tag || '其他', now());
      return { ok: true };
    }
    if (a === 'del' && word) {
      run('DELETE FROM sensitives WHERE word=?', word);
      return { ok: true };
    }
    if (a === 'toggle' && word) {
      run('UPDATE sensitives SET enabled = CASE enabled WHEN 1 THEN 0 ELSE 1 END WHERE word=?', word);
      return { ok: true };
    }
    return { ok: false, err: '未知操作' };
  },

  // ── 跟进记录（编写式）────────────────
  'GET /api/followups': async (req, res, b, q) => {
    const type = q.get('type'), id = q.get('id');
    if (!type || !id) return { ok: false, err: 'missing type/id' };
    return { ok: true, list: all('SELECT * FROM followups WHERE ref_type=? AND ref_id=? ORDER BY id', type, id) };
  },

  'POST /api/followups': async (req, res, b) => {
    if (!b.ref_type || !b.ref_id) return { ok: false, err: 'missing ref' };
    if (!String(b.content || '').trim() && !b.closed) return { ok: false, err: '请写一句跟进内容' };
    const fb = require('./feedback.js');
    const id = fb.addFollowup({
      ref_type: b.ref_type, ref_id: b.ref_id, content: b.content,
      result: b.result, due_date: b.due_date, closed: b.closed, author: b.author,
    });
    return { ok: true, id };
  },

  // ── 设置 / 空间 / 清理 ──────────────
  'GET /api/settings': async () => {
    const rows = all('SELECT * FROM settings');
    const s = {};
    for (const r of rows) s[r.k] = r.v;
    return { ok: true, settings: Object.assign({ model: 'small', keep_audio_days: '30', owner: ownerName() }, s) };
  },

  'POST /api/settings': async (req, res, b) => {
    if (!b.k) return { ok: false, err: 'missing key' };
    run('INSERT INTO settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', b.k, String(b.v ?? ''));
    // owner 改动后必须让 ownerName() 的缓存失效，否则新名字不生效
    if (b.k === 'owner') resetOwnerCache();
    addLog('setting', b.k, String(b.v ?? ''));
    return { ok: true };
  },

  'GET /api/storage': async () => sens.storage(),

  'POST /api/cleanup': async (req, res, b) => {
    const a = await sens.cleanupAudio(true);
    const purged = sens.purgeTmp();
    return { ok: true, ...a, purged, storage: sens.storage() };
  },
};
