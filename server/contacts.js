// 拜访志 · 联系人提炼：从录音标题/转写稿解析 客户姓名 + 客户电话
const { all, get, run, now, addLog, ownerName } = require('./db.js');

const COMPANY_WORDS = /公司|科技|商贸|集团|有限|新兴|实业|数码|电子|办公|文化|股份|商行|批发|经销/;

function extractPhone(text) {
  const t = String(text || '').replace(/[—–\-_\s]/g, '');
  const m = t.match(/1[3-9]\d{9}/);
  if (m) return m[0];
  const m2 = t.match(/0\d{2,3}\d{7,8}/);
  return m2 ? m2[0] : '';
}

// 从文件名/标题提炼联系人姓名（含称呼归一，尽力而为）
function parseName(title, phone) {
  const base = String(title || '').replace(/\.[^.]+$/, '');
  const segs = base.split(/[_\-\s]+/).filter(Boolean);
  const phoneStart = phone ? base.indexOf(phone) : -1;
  // 候选人 = 汉字 2-6 字 token，且（有电话时）结束位置在电话之前
  const cands = segs.map((s, i) => {
    const pre = s; // 该 token 自身（电话号码可能与姓名同 token，如 张三13XXXXXXXXX）
    return { s: pre, i };
  }).filter(x => /[\u4e00-\u9fa5]{2,}/.test(x.s) && !COMPANY_WORDS.test(x.s));
  // 若姓名与电话粘连在同一 token（张三13XXXXXXXXX），从 token 中把电话截掉
  const cleaned = cands.map(c => {
    let s = c.s;
    if (phone && s.includes(phone)) s = s.replace(phone, '');
    s = s.replace(/\d+/g, '').trim();
    return { ...c, s };
  }).filter(c => /^[\u4e00-\u9fa5]{2,6}$/.test(c.s));
  if (!cleaned.length) return '';
  // 选最靠近电话的（end 最大且 < phoneStart，否则就取最后一个汉字 token）
  let pick = cleaned[cleaned.length - 1];
  if (phoneStart > 0) {
    for (const c of cleaned) {
      const end = base.indexOf(c.s) + c.s.length;
      if (end <= phoneStart) pick = c;
    }
  }
  let n = pick.s;
  // 称呼归一：某某总 → 某某；某经理 → 某经理(2字)保留；某姐/某女士 → 原样保留
  const m = n.match(/^(.+?)(?:总|经理|姐|哥|老板|先生|女士)$/);
  if (m) {
    if (m[1].length >= 2) {
      n = m[1];
      // 全名+尊称重叠（张三+张总=张三张总）：去尾字后若首尾同字再删尾
      if (n.length >= 3 && n[0] === n[n.length - 1]) n = n.slice(0, -1);
    }
  }
  return n;
}

// 回填一个客户（不覆盖已有人工填写的值；phone 顺带从转写稿补充）
function enrichCustomer(custId) {
  const cust = get('SELECT * FROM customers WHERE id=?', custId);
  if (!cust) return { name: '', phone: '' };
  let title = '';
  let transcript = '';
  const row = get(`SELECT audio_name, title, transcript FROM calls
                   WHERE customer_id=? AND audio_name IS NOT NULL ORDER BY created_at DESC LIMIT 1`, custId);
  if (row) { title = row.audio_name || row.title || ''; transcript = row.transcript || ''; }
  const phone = extractPhone(title) || extractPhone(transcript);
  let name = parseName(title, phone);
  // 解析结果与客户名重叠（如公司名被当姓名）→ 弃用
  if (name && (name === cust.name || (cust.name || '').includes(name) || (name.includes(cust.name) && cust.name.length >= 2))) name = '';
  const up = [];
  const args = [];
  if (!(cust.contact_name || '').trim() && name) { up.push('contact_name=?'); args.push(name); }
  if (!(cust.contact_phone || '').trim() && phone) { up.push('contact_phone=?'); args.push(phone); }
  if (up.length) {
    args.push(now(), custId);
    run(`UPDATE customers SET ${up.join(',')}, updated_at=? WHERE id=?`, ...args);
    addLog('contact_enrich', custId, up.join(','));
    return { name, phone };
  }
  return { name: cust.contact_name, phone: cust.contact_phone };
}

// 全库回填：为所有还没有 姓名/电话 的客户跑一遍（启动时 + 上传时增量调）
function enrichAll() {
  const rows = all(`SELECT id FROM customers WHERE (contact_name='' OR contact_name IS NULL) OR (contact_phone='' OR contact_phone IS NULL)`);
  let n = 0;
  for (const r of rows) {
    const o = enrichCustomer(r.id);
    if (o.name || o.phone) n++;
  }
  return n;
}

// 老"备注"字段一次性迁入客户级跟进记录（改版后备注区升级为跟进记录）
function migrateNotes() {
  const done = get("SELECT v FROM settings WHERE k='note_migrated'");
  if (done) return 0;
  const rows = all("SELECT id, name, note FROM customers WHERE note IS NOT NULL AND note<>''");
  let n = 0;
  const ts = now();
  for (const r of rows) {
    run(`INSERT INTO followups(ref_type,ref_id,content,result,due_date,closed,author,created_at,updated_at)
         VALUES('customer',?,?,?,'',0,?,?,?)`,
      r.id, String(r.note).trim(), '', ownerName(), ts, ts);
    n++;
  }
  run("INSERT INTO settings(k,v) VALUES('note_migrated','1') ON CONFLICT(k) DO UPDATE SET v='1'");
  if (n) addLog('note_migrate', '', `备注迁入跟进记录 ${n} 条`);
  return n;
}

module.exports = { extractPhone, parseName, enrichCustomer, enrichAll, migrateNotes };
