// 拜访志 · 转写调度（串行队列，不并发抢 CPU）
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { ROOT, db, get, run, all, now, addLog } = require('./db.js');
const sens = require('./sensitive.js');

const PY = 'C:/Users/yafo/.workbuddy/binaries/python/envs/training-asr/Scripts/python.exe';
const SCRIPT = path.join(ROOT, 'scripts', 'transcribe.py');
const TMP = path.join(ROOT, 'data', 'asr');
fs.mkdirSync(TMP, { recursive: true });

const queue = [];
let running = false;

function modelPath() {
  const s = get("SELECT v FROM settings WHERE k='model'");
  const name = s ? s.v : 'base';
  if (name === 'small') {
    const p = path.join(ROOT, 'models', 'small');
    if (fs.existsSync(p)) return p;
  }
  return 'C:/Users/yafo/.workbuddy/binaries/whisper-models/base';
}

// 单条术语应用（返回新文本与命中数），供新词入库后重套历史稿件
function applyTerm(text, wrong, right) {
  if (!wrong) return { out: text, hits: 0 };
  const parts = String(text || '').split(wrong);
  const hits = parts.length - 1;
  return { out: hits > 0 ? parts.join(right || '') : text, hits };
}

function applyTerms(text) {
  let out = text || '';
  const rows = all('SELECT id, wrong, "right" AS rt FROM terms WHERE enabled=1');
  const hits = [];
  for (const r of rows) {
    const r1 = applyTerm(out, r.wrong, r.rt);
    if (r1.hits > 0) { out = r1.out; hits.push([r.id, r1.hits]); }
  }
  for (const [id, c] of hits) run('UPDATE terms SET hit_count=hit_count+? WHERE id=?', c, id);
  return out;
}

function schedule(id) {
  if (!queue.includes(id)) queue.push(id);
  pump();
}

function pump() {
  if (running || queue.length === 0) return;
  running = true;
  const id = queue.shift();
  doTranscribe(id).catch(e => console.error('[asr]', e)).finally(() => {
    running = false;
    setTimeout(pump, 300);
  });
}

function doTranscribe(id) {
  return new Promise((resolve) => {
    const row = get('SELECT * FROM calls WHERE id=?', id);
    if (!row) return resolve();
    const audio = path.join(ROOT, row.audio_path);
    if (!fs.existsSync(audio)) {
      run("UPDATE calls SET transcribe_status='error', transcribe_err=?, updated_at=? WHERE id=?", '音频文件缺失', now(), id);
      return resolve();
    }
    const outJson = path.join(TMP, id + '.json');
    run("UPDATE calls SET transcribe_status='transcribing', transcribe_err=NULL, updated_at=? WHERE id=?", now(), id);

    const args = [SCRIPT, audio, outJson, modelPath()];
    const env = {
      ...process.env,
      HF_ENDPOINT: 'https://hf-mirror.com',
      HF_HUB_DISABLE_XET: '1',
      PYTHONIOENCODING: 'utf-8',
      PYTHONUNBUFFERED: '1',
    };
    let proc;
    try {
      proc = spawn(PY, args, { env, windowsHide: true });
    } catch (e) {
      run("UPDATE calls SET transcribe_status='error', transcribe_err=? WHERE id=?", String(e.message), id);
      return resolve();
    }
    // 必须监听 error，否则未捕获异常会崩进程
    proc.on('error', (e) => {
      run("UPDATE calls SET transcribe_status='error', transcribe_err=?, updated_at=? WHERE id=?", String(e.message), now(), id);
      resolve();
    });
    let buf = '';
    proc.stdout.on('data', d => { buf += d.toString(); process.stdout.write(d.toString()); });
    proc.stderr.on('data', d => process.stderr.write(d.toString()));
    proc.on('close', (code) => {
      try {
        if (code !== 0 || !fs.existsSync(outJson)) {
          let err = `转写进程退出码 ${code}`;
          if (fs.existsSync(outJson)) {
            const j = JSON.parse(fs.readFileSync(outJson, 'utf8'));
            if (j.error) err = j.error;
          }
          run("UPDATE calls SET transcribe_status='error', transcribe_err=?, updated_at=? WHERE id=?", err, now(), id);
          addLog('transcribe_error', id, err);
          return resolve();
        }
        const j = JSON.parse(fs.readFileSync(outJson, 'utf8'));
        const raw = j.text || '';
        const fixed = applyTerms(raw);
        run("UPDATE calls SET transcript_raw=?, transcript=?, duration_sec=?, transcribe_status='done', transcribe_at=?, analyze_status='pending', updated_at=? WHERE id=?",
          raw, fixed, Math.round(j.duration || 0), now(), now(), id);
        addLog('transcribe_done', id, `${Math.round(j.duration || 0)}秒 / ${(raw.length / 1000).toFixed(1)}千字`);
        try { sens.scan(id); } catch (e) { console.error('[asr] scan', e.message); }
        try { fs.existsSync(outJson) && fs.unlinkSync(outJson); } catch (e) {} // 中间产物即删，省空间
      } catch (e) {
        run("UPDATE calls SET transcribe_status='error', transcribe_err=?, updated_at=? WHERE id=?", String(e.message), now(), id);
      }
      resolve();
    });
  });
}

// 启动恢复：卡在 transcribing 的重置重跑；pending 的直接重新调度
function retryStuck() {
  const rows = all("SELECT id, transcribe_status AS st FROM calls WHERE transcribe_status IN ('transcribing','pending')");
  for (const r of rows) {
    if (r.st === 'transcribing') {
      run("UPDATE calls SET transcribe_status='pending', updated_at=? WHERE id=?", now(), r.id);
      addLog('retry_stuck', r.id, '进程重启后重置');
    } else {
      addLog('retry_stuck', r.id, '进程重启后恢复调度');
    }
    schedule(r.id);
  }
  if (rows.length) console.log('[asr] 恢复待转写任务', rows.length, '条');
}

module.exports = { schedule, retryStuck, applyTerms, applyTerm, queue, isRunning: () => running };
