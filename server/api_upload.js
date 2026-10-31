// 拜访志 · 上传 + 通话接口
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { ROOT, db, all, get, run, now, today, addLog, uuid } = require('./db.js');
const asr = require('./asr.js');
const nm = require('./normalize.js');
const contacts = require('./contacts.js');

const RAW = path.join(ROOT, 'audio', 'raw');
fs.mkdirSync(RAW, { recursive: true });
const upload = multer({ dest: path.join(ROOT, 'data', 'tmp'), limits: { fileSize: 512 * 1024 * 1024 }, defParamCharset: 'utf8' });

const okTypes = ['.m4a', '.mp3', '.wav', '.ogg', '.flac', '.amr', '.3gp', '.mp4', '.aac', '.opus', '.wma'];

function sha1File(p) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha1');
    fs.createReadStream(p).on('data', d => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

function callRow(r) {
  if (!r) return null;
  const cust = r.customer_id ? get('SELECT id,name,level,status FROM customers WHERE id=?', r.customer_id) : null;
  const cats = all('SELECT category_id,is_primary,confidence,reason,source FROM call_categories WHERE call_id=?', r.id);
  return { ...r, customer: cust, categories: cats };
}

module.exports = {
  'POST /api/upload': async (req, res) => {
    const gate = await new Promise((resolve) => {
      upload.single('audio')(req, res, (err) => {
        resolve(err ? String(err.message || err) : null);
      });
    });
    if (gate) return { ok: false, err: '上传失败：' + gate };
    if (!req.file) return { ok: false, err: '没有收到文件' };
    const tmp = req.file.path;
    try {
      const sha = await sha1File(tmp);
      const dup = get('SELECT id,title,visited_at FROM calls WHERE audio_sha1=?', sha);
      if (dup) {
        fs.unlinkSync(tmp);
        return { ok: false, duplicate: true, err: `这段录音已存在（${dup.title || dup.visited_at}）`, id: dup.id };
      }
      const ext = (path.extname(req.file.originalname) || '.m4a').toLowerCase();
      if (!okTypes.includes(ext)) {
        // 不因扩展名误杀：未知格式也照常尝试，仅记录提示
      }
      const id = uuid();
      const diskName = id + ext;
      fs.renameSync(tmp, path.join(RAW, diskName));
      const ts = now();
      const meta = req.body || {};
      run(`INSERT INTO calls(id,title,audio_path,audio_name,audio_sha1,audio_size,visit_type,visited_at,
           transcribe_status,analyze_status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,'pending','pending',?,?)`,
        id, meta.title || req.file.originalname, 'audio/raw/' + diskName, req.file.originalname,
        sha, req.file.size, meta.visit_type || '电话', meta.visited_at || ts, ts, ts);
      addLog('upload', id, `${req.file.originalname} / ${(req.file.size / 1048576).toFixed(1)}MB`);
      if (meta.customer_name) {
        const cid = nm.resolveCustomer(meta.customer_name);
        run('UPDATE calls SET customer_id=? WHERE id=?', cid, id);
        nm.touch(cid);
        contacts.enrichCustomer(cid); // 从录音文件名/标题提炼联系人姓名与电话
      }
      asr.schedule(id);
      return { ok: true, id };
    } catch (e) {
      try { fs.existsSync(tmp) && fs.unlinkSync(tmp); } catch (_) {}
      return { ok: false, err: String(e.message || e) };
    }
  },

  'GET /api/calls': async (req, res, body, q) => {
    const limit = Number(q.get('limit') || 50);
    const rows = all('SELECT * FROM calls ORDER BY created_at DESC LIMIT ?', limit);
    // 未处理预警按通话聚合（红色徽标用）
    const flagMap = {};
    for (const f of all("SELECT call_id,word,tag FROM flags WHERE handled=0")) {
      (flagMap[f.call_id] = flagMap[f.call_id] || []).push({ word: f.word, tag: f.tag });
    }
    return { ok: true, list: rows.map(r => ({
      id: r.id, title: r.title, visited_at: r.visited_at, visit_type: r.visit_type,
      duration_sec: r.duration_sec, transcribe_status: r.transcribe_status,
      analyze_status: r.analyze_status, summary: r.summary,
      audio_deleted: r.audio_deleted || 0,
      flags: flagMap[r.id] || [],
      customer: r.customer_id ? get('SELECT id,name FROM customers WHERE id=?', r.customer_id) : null,
    })) };
  },

  'GET /api/calls/:id': async (req) => {
    const r = get('SELECT * FROM calls WHERE id=?', req.params.id);
    if (!r) return { ok: false, err: 'not found' };
    return {
      ok: true, call: callRow(r),
      flags: all('SELECT * FROM flags WHERE call_id=? ORDER BY handled ASC, created_at DESC', r.id),
      highlights: all('SELECT * FROM highlights WHERE call_id=? ORDER BY pinned DESC, importance DESC, created_at', r.id),
      todos: all('SELECT * FROM todos WHERE call_id=? ORDER BY due_date', r.id),
      logs: all('SELECT * FROM logs WHERE target=? ORDER BY id DESC LIMIT 30', r.id),
    };
  },

  'POST /api/calls/:id': async (req, res, body) => {
    const id = req.params.id;
    const f = body.field, v = body.value;
    if (!f) return { ok: false, err: 'missing field' };
    const allowed = ['title', 'visit_type', 'visited_at', 'summary', 'quality_score', 'sentiment', 'next_followup_days', 'note'];
    if (allowed.includes(f)) {
      const old = get('SELECT * FROM calls WHERE id=?', id);
      run(`UPDATE calls SET ${f}=?, updated_at=? WHERE id=?`, v, now(), id);
      addLog('edit', id, `${f}: ${String(old[f] ?? '').slice(0, 60)} → ${String(v ?? '').slice(0, 60)}`);
      return { ok: true };
    }
    if (f === 'customer') {
      const cid = v ? nm.resolveCustomer(v) : null;
      run('UPDATE calls SET customer_id=?, updated_at=? WHERE id=?', cid, now(), id);
      addLog('edit', id, `客户 → ${v || '（空）'}`);
      return { ok: true, customer_id: cid };
    }
    return { ok: false, err: 'unsupported field: ' + f };
  },
};
