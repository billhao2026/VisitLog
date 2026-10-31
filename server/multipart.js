// 拜访志 · 原生 multipart/form-data 解析（替代 multer，保持零外部依赖）
// 接口对齐 multer().single(field)：产出 req.file { path, originalname, size } 与 req.body
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEST = path.join(__dirname, '..', 'data', 'tmp');
const MAX_SIZE = 512 * 1024 * 1024;

function fieldOf(headers, key) {
  const line = headers.find(h => h.toLowerCase().startsWith(key));
  if (!line) return '';
  const m = /(?:^|;)\s*[^=]+=\s*"?([^";]+)"?/.exec(line.slice(key.length - 1));
  return m ? m[1] : '';
}

function parseHeaders(raw) {
  const lines = raw.split('\r\n').filter(Boolean);
  const cd = lines.find(l => l.toLowerCase().startsWith('content-disposition')) || '';
  const name = /name="?([^";]+)"?/i.exec(cd);
  const filename = /filename\*?=(?:utf-8''|"?)([^";]+)"?/i.exec(cd);
  const ct = lines.find(l => l.toLowerCase().startsWith('content-type'));
  return {
    name: name ? name[1] : '',
    filename: filename ? decodeURIComponent(filename[1]) : '',
    contentType: ct ? ct.split(':')[1].trim() : 'application/octet-stream',
  };
}

// 返回一个 Promise 风格的中间件：(req,res,cb) => void
function single(field) {
  return (req, res, cb) => {
    const done = (err) => { try { cb(err); } catch (e) { console.error('[multipart]', e); } };
    const ct = req.headers['content-type'] || '';
    if (!/multipart\/form-data/i.test(ct)) return done(new Error('请求不是 multipart/form-data'));
    const bm = /boundary=(?:"([^"]+)"|([^;]+))/.exec(ct);
    if (!bm) return done(new Error('缺少 multipart boundary'));

    const openB = Buffer.from('--' + (bm[1] || bm[2].trim()));
    const delim = Buffer.from('\r\n' + '--' + (bm[1] || bm[2].trim()));

    fs.mkdirSync(DEST, { recursive: true });
    const body = {};
    let file = null;
    let size = 0;
    let overflow = false;

    let buf = Buffer.alloc(0);
    let phase = 'head';      // head | body | tail
    let cur = null;          // 当前 part 元信息
    let ws = null;           // 当前文件的写流
    let guard = 0;

    let settled = false;
    const finish = (err) => {
      if (ws) { try { ws.end(); } catch (e) {} ws = null; }
      if (settled) return;
      settled = true;
      if (err) return done(err);
      req.body = body;
      if (file) req.file = Object.assign(file, { size });
      done(null);
    };

    const startPart = (headerRaw) => {
      const h = parseHeaders(headerRaw);
      cur = h;
      if (h.filename) {
        const disk = crypto.randomUUID() + path.extname(h.filename);
        const p = path.join(DEST, disk);
        ws = fs.createWriteStream(p);
        ws.on('error', (e) => finish(e));
        file = { path: p, originalname: h.filename, fieldname: h.name, mimetype: h.contentType };
        size = 0;
      } else {
        ws = null;
        cur.chunks = [];
      }
      phase = 'body';
    };

    const endPart = () => {
      if (cur && ws) ws.end();
      else if (cur) body[cur.name] = Buffer.concat(cur.chunks || []).toString('utf8');
      ws = null;
      cur = null;
      phase = 'head';
    };

    let stripped = false;   // 首个分隔符前没有 CRLF，需单独剥掉
    req.on('data', (chunk) => {
      if (overflow) return;
      let c = chunk;
      if (!stripped) {
        stripped = true;
        const i = c.indexOf(openB);
        if (i >= 0) c = c.slice(i + openB.length);
      }
      buf = buf.length ? Buffer.concat([buf, c]) : c;

      // 主循环：尽可能多地消化缓冲区中的完整分片
      for (guard = 0; guard < 10000; guard++) {
        if (phase === 'head') {
          const i = buf.indexOf('\r\n\r\n');
          if (i < 0) return;                        // header 还不完整，等下一块
          const headRaw = buf.slice(0, i).toString('utf8');
          buf = buf.slice(i + 4);
          startPart(headRaw);
          continue;
        }
        const di = buf.indexOf(delim);
        if (di < 0) {
          // 未见到边界：保守写入，尾部预留 delim 长度防止把半个分隔符写进文件
          const keep = delim.length;
          const upto = Math.max(0, buf.length - keep);
          if (upto > 0) write(buf.slice(0, upto));
          buf = buf.slice(upto);
          return;
        }
        write(buf.slice(0, di));
        buf = buf.slice(di + delim.length);
        endPart();
        if (buf.slice(0, 2).toString() === '--') { phase = 'tail'; return finish(null); }
        continue;
      }
    });

    function write(data) {
      if (!data || !data.length) return;
      if (cur && ws) {
        size += data.length;
        if (size > MAX_SIZE) { overflow = true; finish(new Error('文件超过 512MB 上限')); req.destroy(); return; }
        ws.write(data);
      } else if (cur) {
        (cur.chunks = cur.chunks || []).push(data);
      }
    }

    req.on('end', () => { finish(null); });
    req.on('error', (e) => finish(e));
    req.on('aborted', () => finish(new Error('上传被中断')));
  };
}

module.exports = { single };
