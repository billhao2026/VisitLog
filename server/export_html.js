// 拜访志 · 客户档案离线分享 HTML（自包含单文件：零外链 / 零 JS / 打印友好）
// 供 /api/export/customer/:id 调用：客户档案 + 拜访记录 + 待办 + 沉淀要点 + 跟进时间线
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const fmtDT = s => s ? String(s).slice(5, 16) : '';   // 2026-09-08 18:29:36 → 09-08 18:29
const fmtD = s => s ? String(s).slice(0, 10) : '';
const dur = sec => { if (!sec) return ''; const m = Math.floor(sec / 60), r = sec % 60; return m ? (r ? m + '分' + r + '秒' : m + '分钟') : r + '秒'; };
const SENT_CLS = { '积极': 'g', '消极': 'r' };
const KIND_CLS = { '风险': 'r', '异议': 'r', '待办': 'a', '承诺': 'b', '决策': 'b', '机会': 'g', '需求': 'g' };
const RES_CLS = { '推进中': 'a', '有突破': 'b', '已闭环': 'g' };

const CSS = `
:root{--paper:#FBF9F5;--paper2:#F5F1E9;--ink:#1A1815;--ink2:#4A443C;--ink3:#8A8175;--ink4:#B4AB9C;--rule:#E4DCCC;--rule2:#D6CBB6;--accent:#C2410C;--accent2:#9A3412;--soft:#FCEFE4;--green:#4D7C5F;--gsoft:#EDF3EE;--amber:#B45309;--asoft:#FBF1E1;--red:#9B2C2C;--rsoft:#F9EBEA;--blue:#2F5D7C;--bsoft:#EBF1F5;--serif:Georgia,"Songti SC","Noto Serif SC",serif;--sans:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);font-size:14px;line-height:1.7;-webkit-font-smoothing:antialiased;background-image:radial-gradient(circle at 1px 1px,rgba(180,171,156,.16) 1px,transparent 0);background-size:22px 22px}
.wrap{max-width:880px;margin:0 auto;padding:30px 22px 70px}
.head{display:flex;gap:14px;align-items:flex-start;border-bottom:2px solid var(--ink);padding-bottom:16px}
.mark{width:46px;height:46px;display:grid;place-items:center;background:var(--accent);color:#fff;font-family:var(--serif);font-size:25px;border-radius:3px;flex:0 0 auto}
h1{font-family:var(--serif);font-size:26px;margin:0 0 8px;line-height:1.25}
.tags{display:flex;flex-wrap:wrap;gap:6px}
.tag{border:1px solid var(--rule2);background:var(--paper2);border-radius:100px;padding:1px 10px;font-size:11.5px;color:var(--ink2);white-space:nowrap}
.tag.g{background:var(--gsoft);border-color:var(--green);color:var(--green)}
.tag.r{background:var(--rsoft);border-color:var(--red);color:var(--red)}
.tag.a{background:var(--asoft);border-color:var(--amber);color:var(--amber)}
.tag.b{background:var(--bsoft);border-color:var(--blue);color:var(--blue)}
.tag.hot{background:var(--soft);border-color:var(--accent);color:var(--accent)}
.statbar{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:18px 0 8px}
@media(max-width:640px){.statbar{grid-template-columns:repeat(2,1fr)}}
.st{border:1px solid var(--rule);background:rgba(255,255,255,.55);border-radius:4px;padding:10px 14px}
.st b{display:block;font-family:var(--serif);font-size:20px}
.st.hot b{color:var(--accent)}
.st span{font-size:11px;color:var(--ink3)}
h3{font-family:var(--serif);font-size:17px;margin:28px 0 10px;padding-left:10px;border-left:3px solid var(--accent)}
h3 i{font-style:normal;font-size:11.5px;color:var(--ink3);font-family:var(--sans);font-weight:400;margin-left:8px}
.call{border:1px solid var(--rule);border-left:3px solid var(--rule2);border-radius:4px;background:rgba(255,255,255,.55);padding:10px 14px;margin-bottom:8px}
.call .cm{font-size:11.5px;color:var(--ink3);display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-bottom:3px}
.call .cm .tag{padding:0 8px}
.call .ct{font-weight:600;font-size:13.5px}
.call .cs{font-size:13px;color:var(--ink2);margin-top:4px}
.todo{display:flex;gap:10px;padding:9px 4px;border-bottom:1px dotted var(--rule2)}
.todo:last-child{border-bottom:none}
.todo .dot{flex:0 0 auto;width:15px;height:15px;border:1.6px solid var(--rule2);border-radius:4px;margin-top:4px}
.todo.done .dot{background:var(--green);border-color:var(--green)}
.todo.done .tx{text-decoration:line-through;color:var(--ink4)}
.todo .tx{font-size:13.5px;flex:1}
.todo .meta,.hl .meta{font-size:11px;color:var(--ink3);margin-top:2px}
.od{color:var(--red);font-weight:600}
.hl{padding:9px 4px;border-bottom:1px dotted var(--rule2)}
.hl:last-child{border-bottom:none}
.hl .row1{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.hl .imp{font-size:8px;letter-spacing:2.5px;color:var(--accent)}
.hl .pin{font-size:12px}
.hl .tx{font-size:13.5px;margin-top:3px}
.fu{border:1px solid var(--rule);border-radius:4px;background:var(--paper2);padding:8px 12px;margin-bottom:8px}
.fu .fh{display:flex;gap:8px;align-items:center;font-size:11.5px;flex-wrap:wrap}
.fu .src{color:var(--accent2);font-weight:600}
.fu .who{font-weight:600;color:var(--ink2)}
.fu .dt{margin-left:auto;color:var(--ink4)}
.fu .tx{font-size:13px;margin-top:3px;white-space:pre-wrap}
.empty{padding:14px;color:var(--ink4);font-size:12.5px}
.note{border:1px dashed var(--rule2);background:var(--asoft);border-radius:4px;padding:10px 14px;font-size:12.5px;color:var(--ink2);margin-top:28px;line-height:1.8}
footer{margin-top:30px;text-align:center;font-size:11px;color:var(--ink4);border-top:1px solid var(--rule);padding-top:12px}
@media print{body{background:#fff;background-image:none}.call,.fu{background:#fff}}
`;

/* ── 分段渲染 ─────────────────────────── */

function renderHead(c, calls, todos, hls, fus) {
  const openN = todos.filter(t => t.status === 'open').length;
  const tags = [
    c.region && `<span class="tag">${esc(c.region)}</span>`,
    c.type && `<span class="tag">${esc(c.type)}</span>`,
    c.level && `<span class="tag hot">${esc(c.level)}</span>`,
    `<span class="tag ${c.status === '活跃' ? 'g' : ''}">${esc(c.status || '活跃')}</span>`,
  ].filter(Boolean).join('');
  const kv = [
    ['联系人', c.contact_name], ['电话', c.contact_phone], ['对接业务员', c.sales],
    ['跟进人', c.owner || opts.owner || ''], ['首次拜访', fmtD(c.first_visit_at)], ['累计拜访', (c.visit_count || 0) + ' 次'],
  ].filter(x => x[1]).map(x => `<span class="tag">${esc(x[0])}：${esc(x[1])}</span>`).join('');
  return `
<header class="head">
  <div class="mark">访</div>
  <div style="flex:1;min-width:0">
    <h1>${esc(c.name)}</h1>
    <div class="tags">${tags}</div>
    <div class="tags" style="margin-top:8px">${kv}</div>
  </div>
</header>
<div class="statbar">
  <div class="st ${openN ? 'hot' : ''}"><b>${openN}</b><span>未完成待办</span></div>
  <div class="st"><b>${calls.length}</b><span>拜访记录</span></div>
  <div class="st"><b>${hls.length}</b><span>沉淀要点</span></div>
  <div class="st"><b>${fus.length}</b><span>跟进记录</span></div>
</div>`;
}

function renderCalls(calls) {
  if (!calls.length) return '<h3>拜访记录<i>0 通</i></h3><div class="empty">暂无拜访记录</div>';
  const rows = calls.map(x => `
  <div class="call">
    <div class="cm"><span>${esc(fmtDT(x.visited_at))}</span>
      ${x.visit_type ? `<span class="tag">${esc(x.visit_type)}</span>` : ''}
      ${dur(x.duration_sec) ? `<span>${esc(dur(x.duration_sec))}</span>` : ''}
      ${x.sentiment ? `<span class="tag ${SENT_CLS[x.sentiment] || ''}">${esc(x.sentiment)}</span>` : ''}
      ${x.quality_score ? `<span>质量 ${x.quality_score}/10</span>` : ''}</div>
    <div class="ct">${esc(x.title || '未命名通话')}</div>
    ${x.summary ? `<div class="cs">${esc(x.summary)}</div>` : '<div class="cs" style="color:var(--ink4)">（无摘要）</div>'}
  </div>`).join('');
  return `<h3>拜访记录<i>${calls.length} 通</i></h3>${rows}`;
}

function renderTodos(todos) {
  const open = todos.filter(t => t.status === 'open');
  const done = todos.filter(t => t.status !== 'open');
  const od = (t) => t.due_date && t.status === 'open' && t.due_date < todayStr() ? ' <span class="od">已逾期</span>' : '';
  const row = (t, isDone) => `
  <div class="todo ${isDone ? 'done' : ''}">
    <div class="dot"></div>
    <div class="tx">${esc(t.content)}
      <div class="meta">${t.due_date ? esc(fmtD(t.due_date)) : '无期限'} · ${esc(t.priority || '中')}优先${od(t)}${t.done_by ? ' · ' + esc(t.done_by) + ' 完成' : ''}</div>
    </div>
  </div>`;
  let out = `<h3>未完成待办<i>${open.length} 条</i></h3>`;
  out += open.length ? open.map(t => row(t, false)).join('') : '<div class="empty">✅ 没有未完成待办</div>';
  if (done.length) {
    out += `<h3 style="margin-top:20px">已完成待办<i>${done.length} 条</i></h3>${done.map(t => row(t, true)).join('')}`;
  }
  return out;
}

function renderHls(hls) {
  if (!hls.length) return '<h3>沉淀要点<i>0 条</i></h3><div class="empty">暂无要点</div>';
  const rows = hls.map(h => `
  <div class="hl" ${h.status === 'archived' ? 'style="opacity:.6"' : ''}>
    <div class="row1">
      <span class="tag ${KIND_CLS[h.kind] || ''}">${esc(h.kind || '结论')}</span>
      ${h.pinned ? '<span class="pin">📌</span>' : ''}
      ${h.importance >= 5 ? '<span class="tag r">重要</span>' : h.importance >= 4 ? '<span class="tag a">重点关注</span>' : ''}
      <span class="imp">${'●'.repeat(Math.max(1, Math.min(5, h.importance || 3)))}</span>
      <span style="font-size:11px;color:var(--ink4)">${esc(fmtD(h.created_at))}</span>
    </div>
    <div class="tx">${esc(h.content)}</div>
  </div>`).join('');
  return `<h3>沉淀要点<i>${hls.length} 条</i></h3>${rows}`;
}

function renderFus(fus) {
  if (!fus.length) return '';
  const SRC = { customer: '客户跟进', todo: '待办跟进', highlight: '要点跟进' };
  const rows = fus.map(f => `
  <div class="fu">
    <div class="fh"><span class="src">「${SRC[f.ref_type] || f.ref_type}」</span>
      <span class="who">${esc(f.author || '')}</span>
      ${f.result ? `<span class="tag ${RES_CLS[f.result] || ''}">${esc(f.result)}</span>` : ''}
      <span class="dt">${esc(fmtDT(f.created_at))}</span></div>
    ${f.content ? `<div class="tx">${esc(f.content)}</div>` : ''}
  </div>`).join('');
  return `<h3>跟进记录<i>${fus.length} 条</i></h3>${rows}`;
}

/* ── 组装导出 ─────────────────────────── */

function todayStr() { return new Date().toISOString().slice(0, 10); }

function buildCustomerHTML(c, calls, todos, hls, fus, opts = {}) {
  const genAt = new Date();
  const genStr = `${genAt.getFullYear()}-${String(genAt.getMonth() + 1).padStart(2, '0')}-${String(genAt.getDate()).padStart(2, '0')} ${String(genAt.getHours()).padStart(2, '0')}:${String(genAt.getMinutes()).padStart(2, '0')}`;
  const body = [
    renderHead(c, calls, todos, hls, fus),
    renderCalls(calls),
    renderTodos(todos),
    renderHls(hls),
    renderFus(fus),
    `<div class="note">📌 <b>这是 ${esc(genStr)} 生成的离线快照</b>——内容截至此刻，后续更新不会自动同步。<br>
    你可以直接在微信/邮件里回复反馈（说清楚是哪条待办/要点即可），负责人收到后会在系统里操作跟进。</div>`,
  ].filter(Boolean).join('\n');
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(c.name)} · 客户档案分享</title>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">
${body}
<footer>由拜访志 VisitLog 生成 · ${esc(genStr)} · 内容快照仅供指定接收人查看，请勿外传</footer>
</div>
</body>
</html>`;
}

module.exports = { buildCustomerHTML };


