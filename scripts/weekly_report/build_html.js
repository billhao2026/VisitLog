// 拜访志周报 · HTML 生成器 v2（宽版深度版）
// 视觉：档案纸风（与拜访志统一）+ 周报印章特色；邮件安全：零 JS、内联 CSS、内联 SVG
// 输入：collect_data.js 的 JSON（文件参数）；输出：HTML 到 stdout
const fs = require('fs');
const input = fs.readFileSync(process.argv[2] || 0, 'utf8');
const D = JSON.parse(input);

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtDur = sec => { sec = sec || 0; if (sec < 60) return sec + ' 秒'; const m = Math.round(sec / 60); return m >= 60 ? Math.floor(m / 60) + ' 小时 ' + (m % 60) + ' 分' : m + ' 分钟'; };
const fmtHM = sec => { sec = sec || 0; const m = Math.round(sec / 60); return m >= 60 ? (m / 60).toFixed(1) + 'h' : m + '分'; };
const fmtDateCn = d => d ? d.slice(5).replace('-', '/') : '';
const pad = n => String(n).padStart(2, '0');
const fmtDateLocal = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const prio = p => p === '高' || p === 'high' ? '高' : p === '中' || p === 'medium' ? '中' : '低';
// 情绪归一化兜底（旧数据可能未在采集层归一）
const sentMap = { positive: '正面', 积极: '正面', neutral: '中性', 中性: '中性', negative: '负面', 消极: '负面' };

const S = D.stats;
const W_START = D.weekStartDay || (D.weekStart || '').slice(0, 10);
const W_END = D.weekEndDay || (D.weekEnd || '').slice(0, 10);
const periodLabel = `${fmtDateCn(W_START)} ~ ${fmtDateCn(W_END)}`;
const WF = '日一二三四五六';
const wd = d => '周' + WF[new Date(d).getDay()];

// ══════════ ① 下周重点 ══════════
const today = W_END;
const next7 = new Date(new Date(today).getTime() + 7 * 864e5).toISOString().slice(0, 10);
const openTodos = D.todos.todosOpen || [];
const overdue = openTodos.filter(t => t.overdue === 1);
const highOpen = openTodos.filter(t => prio(t.priority) === '高' && t.overdue !== 1);
const dueSoon = openTodos.filter(t => t.overdue !== 1 && prio(t.priority) !== '高' && t.due_date && t.due_date <= next7);
const stuck = openTodos.filter(t => t.fu_last_at && t.fu_last_res !== '已闭环' &&
  (new Date(today) - new Date(t.fu_last_at.slice(0, 10))) / 864e5 > 2);
const nextWeek = [
  ...overdue.map(t => ({ ...t, badge: '超期', bcls: 'b-red' })),
  ...highOpen.map(t => ({ ...t, badge: '高优', bcls: 'b-org' })),
  ...dueSoon.map(t => ({ ...t, badge: '7天内到期', bcls: 'b-blu' })),
].slice(0, 12);
const badgeSpan = t => `<span class="badge ${t.bcls}">${t.badge}</span>`;

// ══════════ ② 总览 ══════════
// 近 4 期趋势（上期）
const tr = D.trend || [];
const prev = tr.length >= 2 ? tr[tr.length - 2] : null;
const cur = tr.length ? tr[tr.length - 1] : null;
const delta = (a, b) => { if (b == null || b === 0) return a > 0 ? '＋' + a : ''; const p = Math.round((a - b) / b * 100); return p >= 0 ? '＋' + p + '%' : '−' + Math.abs(p) + '%'; };
const sentDist = S.sentDist || {};
const posN = sentDist['正面'] || 0, neuN = sentDist['中性'] || 0, negN = sentDist['负面'] || 0, unmarked = sentDist['未标记'] || 0;

// 每日通话（8 个日历日）
function weekBars() {
  const days = [];
  for (let d = new Date(W_START + 'T00:00:00'); fmtDateLocal(d) <= W_END; d = new Date(d.getTime() + 864e5)) {
    const key = fmtDateLocal(d);
    const inWin = c => {
      const v = c.visited_at || '';
      if (key === W_START) return v > D.weekStart;
      if (key === W_END) return v <= D.weekEnd;
      return v.slice(0, 10) === key;
    };
    days.push({ key, label: '周' + WF[d.getDay()], sub: key.slice(5).replace('-', '/'), n: (D.calls || []).filter(inWin).length });
  }
  const max = Math.max(...days.map(x => x.n), 1);
  const bw = 64, gap = 18, base = 108, top = 34, H = 150;
  let s = '';
  days.forEach((d2, i) => {
    const h = d2.n ? Math.max(6, Math.round(d2.n / max * (base - top))) : 2;
    const x = 6 + i * (bw + gap);
    const hot = d2.n === max && d2.n > 0;
    s += `<rect x="${x}" y="${base - h}" width="${bw}" height="${h}" rx="5" fill="${d2.n ? (hot ? '#C2410C' : '#B4AB9C') : '#E4DCCC'}"/>` +
      `<text x="${x + bw / 2}" y="${base - h - 8}" font-size="15" font-weight="bold" fill="${hot ? '#C2410C' : '#1A1815'}" text-anchor="middle">${d2.n}</text>` +
      `<text x="${x + bw / 2}" y="${base + 18}" font-size="12" fill="#4A443C" text-anchor="middle">${d2.label} ${d2.sub}</text>`;
  });
  return `<svg width="${6 + days.length * (bw + gap)}" height="${H}" xmlns="http://www.w3.org/2000/svg" style="font-family:'Microsoft YaHei',sans-serif">${s}</svg>`;
}

// 趋势双行图（上行通话数柱、下行时长线，拆开不叠加）
function trendSVG() {
  const items = tr.slice(-4);
  if (items.length < 2) return '';
  const W = 640, gap = 16, top1 = 26, base1 = 78, top2 = 128, base2 = 178, H = 210;
  const colW = Math.min(90, (W - 20) / items.length - gap);
  const maxC = Math.max(...items.map(i => i.calls), 1);
  const maxS = Math.max(...items.map(i => i.sec), 1);
  let s = '';
  items.forEach((it, i) => {
    const x = 10 + i * (colW + gap) + 4;
    const h1 = it.calls ? Math.max(4, it.calls / maxC * (base1 - top1)) : 2;
    s += `<rect x="${x}" y="${base1 - h1}" width="${colW - 8}" height="${h1}" rx="4" fill="${i === items.length - 1 ? '#C2410C' : '#B4AB9C'}"/>` +
      `<text x="${x + (colW - 8) / 2}" y="${base1 - h1 - 7}" font-size="13" font-weight="bold" fill="#1A1815" text-anchor="middle">${it.calls}</text>` +
      `<text x="${x + (colW - 8) / 2}" y="${base1 + 16}" font-size="12" fill="#4A443C" text-anchor="middle">${esc(it.label)}</text>`;
    // 下行：时长折线
    const cx = x + (colW - 8) / 2, cy = base2 - (it.sec / maxS * (base2 - top2));
    s += `<circle cx="${cx}" cy="${cy}" r="4.5" fill="${i === items.length - 1 ? '#C2410C' : '#4D7C5F'}"/>` +
      `<text x="${cx}" y="${cy - 10}" font-size="12" fill="#4D7C5F" text-anchor="middle">${fmtHM(it.sec)}</text>`;
  });
  // 时长连线
  const pts = items.map((it, i) => {
    const x = 10 + i * (colW + gap) + 4 + (colW - 8) / 2;
    return [x, base2 - (it.sec / maxS * (base2 - top2))];
  });
  let path = '';
  for (let i = 0; i < pts.length; i++) path += (i ? 'L' : 'M') + pts[i][0] + ' ' + pts[i][1] + ' ';
  s += `<path d="${path}" fill="none" stroke="#4D7C5F" stroke-width="2" stroke-dasharray="1 0" opacity="0.85"/>`;
  // 分隔线与标签
  s += `<line x1="10" y1="${base1 + 30}" x2="${W - 10}" y2="${base1 + 30}" stroke="#E4DCCC" stroke-width="1"/>` +
    `<text x="${W - 10}" y="16" font-size="11" fill="#8A8175" text-anchor="end">通话数（通）</text>` +
    `<text x="${W - 10}" y="${base1 + 46}" font-size="11" fill="#8A8175" text-anchor="end">总时长</text>`;
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" style="font-family:'Microsoft YaHei',sans-serif">${s}</svg>`;
}

// ══════════ ③ 深度剖析 ══════════
const topCustomers = (D.activeCustomers || []).slice(0, 8);
function hbars(items, opt = {}) {
  if (!items || !items.length) return '<div class="empty">本周无数据</div>';
  const max = Math.max(...items.map(i => i.value)) || 1;
  const bw = 18, gap = 7, left = opt.left || 150, right = 110;
  const H = items.length * (bw + gap) + gap, W = opt.width || 640;
  const plot = W - left - right;
  let bars = '', labels = '';
  items.forEach((it, i) => {
    const y = gap + i * (bw + gap);
    const w = Math.max(2, it.value / max * plot);
    bars += `<rect x="${left}" y="${y}" width="${w}" height="${bw}" rx="3" fill="${it.color || '#B4AB9C'}"/>` +
      `<text x="${left + w + 6}" y="${y + bw / 2 + 4}" font-size="12" fill="#4A443C">${esc(it.suffix || String(it.value))}</text>`;
    labels += `<text x="${left - 8}" y="${y + bw / 2 + 4}" font-size="12" fill="#1A1815" text-anchor="end">${esc(String(it.label).slice(0, opt.cut || 12))}</text>`;
  });
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" style="font-family:'Microsoft YaHei',sans-serif">${labels}${bars}</svg>`;
}
const catItems = Object.entries(D.catAgg || {}).sort((a, b) => b[1] - a[1]).slice(0, 7)
  .map(([label, value]) => ({ label, value }));
const catColors = ['#C2410C', '#4D7C5F', '#2F5D7C', '#9A3412', '#B45309', '#7C5CBF', '#4A443C'];
catItems.forEach((it, i) => it.color = catColors[i % catColors.length]);
const fuByResult = {};
for (const f of D.followups || []) fuByResult[f.result || '未标记'] = (fuByResult[f.result || '未标记'] || 0) + 1;
const notMoving = (D.followups || []).filter(f => f.result === '无进展');
const breakthrough = (D.followups || []).filter(f => f.result === '有突破');
// 销售榜
const salesItems = (D.salesActive || []).map(s => ({ label: s.sales + '（' + s.cust_n + '客户）', value: s.call_n, suffix: s.call_n + ' 通 · ' + fmtHM(s.sec), color: '#2F5D7C' }));
// 沉淀分布
const hlOrder = ['机会', '风险', '需求', '承诺', '决策', '结论', '事实', '待办', '异议'];
const hlColors = { 机会: '#4D7C5F', 风险: '#9B2C2C', 需求: '#2F5D7C', 承诺: '#B45309', 决策: '#7C5CBF', 结论: '#4A443C', 事实: '#B4AB9C', 待办: '#8A8175', 异议: '#C2410C' };
const hlItems = hlOrder.filter(k => (D.hlWeekDist || {})[k]).map(k => ({ label: k, value: D.hlWeekDist[k], color: hlColors[k] || '#B4AB9C', suffix: String(D.hlWeekDist[k]) + ' 条' }));
// 质量分布
const qKeys = Object.keys(D.qDist || {}).sort();
const qItems = qKeys.map(k => ({ label: k + ' 分', value: D.qDist[k], color: k >= 8 ? '#4D7C5F' : k >= 7 ? '#2F5D7C' : k >= 6 ? '#B45309' : '#9B2C2C', suffix: D.qDist[k] + ' 通' }));
// 到期日历
const dueItems = (D.dueCal || []).map(d => ({ label: fmtDateCn(d.due_date) + ' ' + wd(d.due_date), value: d.n, color: d.high_n > 0 ? '#C2410C' : '#B4AB9C', suffix: d.n + ' 项' + (d.high_n ? '（含高优 ' + d.high_n + '）' : '') }));

// ══════════ ④ 遗留 ══════════
const openFlags = D.flags || [];
const pinnedHl = (D.highlightsOpen || []).filter(h => h.pinned === 1).slice(0, 6);
const impHl = (D.highlightsOpen || []).filter(h => h.pinned !== 1).sort((a, b) => (b.importance || 0) - (a.importance || 0)).slice(0, 4);

// ══════════ ⑤ 特色 ══════════
const salesAllMap = {};
for (const r of D.salesAll || []) salesAllMap[r.sales] = r.n;
const activeSalesN = (D.salesActive || []).length;
const totalSalesN = Object.keys(salesAllMap).filter(k => k !== '未指派').length;
const topQ = D.topCalls || [];
const talkKing = topCustomers[0] || {};
const longestCall = (D.calls || []).slice().sort((a, b) => (b.duration_sec || 0) - (a.duration_sec || 0))[0] || {};
const fuRate = S.fuCount && S.callCount ? Math.round(S.fuCount / S.callCount * 10) / 10 : 0;
const fuCloseRate = S.fuCount ? Math.round(S.fuClosed / S.fuCount * 100) : 0;

// ── 洞察卡（数据驱动生成，禁止编造）──
function insightBlocks() {
  const arr = [];
  // 1. 趋势对比
  if (prev && cur) {
    const dc = delta(cur.calls, prev.calls);
    arr.push({ icon: '📈', title: '通话量环比', text: `上期 ${prev.calls} 通 → 本期 ${cur.calls} 通（${dc || '持平'}），总时长 ${fmtHM(prev.sec)} → ${fmtHM(cur.sec)}。` });
  }
  // 2. 闭环率
  arr.push({ icon: '✅', title: '跟进闭环率', text: `${S.fuClosed}/${S.fuCount} 条跟进已闭环（${fuCloseRate}%），${notMoving.length ? `有 ${notMoving.length} 条无进展需关注` : '无停滞跟进'}。` });
  // 3. 高优积压
  arr.push({ icon: '⚠️', title: '高优待办', text: `当前 ${S.highOpenPrio} 项高优未完成${overdue.length ? `、${overdue.length} 项已超期` : '、无超期'}；下周建议优先消化「下周重点」前 3 项。` });
  // 4. 到期扎堆
  const peak = (D.dueCal || []).slice().sort((a, b) => b.n - a.n)[0];
  if (peak) arr.push({ icon: '🗓', title: '到期高峰日', text: `${fmtDateCn(peak.due_date)}（${wd(peak.due_date)}）有 ${peak.n} 项待办集中到期${peak.high_n ? `、含高优 ${peak.high_n} 项` : ''}，建议提前 2 天分批推进。` });
  // 5. 销售覆盖
  if (totalSalesN) arr.push({ icon: '👥', title: '销售覆盖面', text: `${totalSalesN} 位建档销售中 ${activeSalesN} 位本周有通话（覆盖率 ${Math.round(activeSalesN / totalSalesN * 100)}%），未活跃 ${totalSalesN - activeSalesN} 位。` });
  // 6. 情绪面
  if (posN + neuN + negN) arr.push({ icon: '😊', title: '沟通情绪面', text: `正面 ${posN} / 中性 ${neuN} / 负面 ${negN}${negN ? '——存在负面信号，建议回听对应录音' : '——整体平稳向好'}。` });
  // 7. 休假日（非工作日）：说明断档非异常
  if ((D.nonWorkdays || []).length) {
    arr.push({ icon: '📅', title: '本期休假日', text: `本期含休假日 ${D.nonWorkdays.length} 天（${D.nonWorkdays.join('、')}）——属非工作日，非跟进断档；通话量与超期统计已按工作日顺延。` });
  }
  return arr;
}

// ══════════ HTML ══════════
const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>拜访志周报 ${W_START} ~ ${W_END}</title>
<style>
:root{--paper:#FBF9F5;--paper2:#F5F1E9;--ink:#1A1815;--ink2:#4A443C;--ink3:#8A8175;--ink4:#B4AB9C;--rule:#E4DCCC;--rule2:#D6CBB6;--accent:#C2410C;--accent2:#9A3412;--soft:#FCEFE4;--green:#4D7C5F;--gsoft:#EDF3EE;--amber:#B45309;--asoft:#FBF1E1;--red:#9B2C2C;--rsoft:#F9EBEA;--blue:#2F5D7C;--bsoft:#EBF1F5;--serif:Georgia,"Songti SC","Noto Serif SC",serif;--sans:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);font-size:14px;line-height:1.7;-webkit-font-smoothing:antialiased;background-image:radial-gradient(circle at 1px 1px,rgba(180,171,156,.16) 1px,transparent 0);background-size:22px 22px}
.wrap{max-width:1080px;margin:0 auto;padding:30px 24px 60px}
.stamp{display:inline-block;transform:rotate(-3deg);border:2.5px solid rgba(194,65,12,.75);color:rgba(194,65,12,.8);font-family:var(--serif);font-size:13px;letter-spacing:3px;padding:3px 12px;border-radius:4px;margin-left:14px;vertical-align:middle;font-weight:700}
.hero{border-bottom:2px solid var(--ink);padding-bottom:18px;margin-bottom:22px;position:relative}
.hero .mark{width:50px;height:50px;display:grid;place-items:center;background:var(--accent);color:#fff;font-family:var(--serif);font-size:26px;border-radius:4px;float:left;margin-right:16px}
.hero h1{font-family:var(--serif);font-size:30px;margin:0 0 4px;line-height:1.25}
.hero .sub{font-size:13px;color:var(--ink2);margin:0 0 8px}
.hero .meta{display:flex;flex-wrap:wrap;gap:6px}
.tag{border:1px solid var(--rule2);background:var(--paper2);border-radius:100px;padding:1px 11px;font-size:11.5px;color:var(--ink2);white-space:nowrap}
.tag.hot{background:var(--soft);border-color:var(--accent);color:var(--accent)}
.tag.g{background:var(--gsoft);border-color:var(--green);color:var(--green)}
.tag.r{background:var(--rsoft);border-color:var(--red);color:var(--red)}
.tag.b{background:var(--bsoft);border-color:var(--blue);color:var(--blue)}
h2{font-family:var(--serif);font-size:22px;margin:34px 0 6px;padding-left:12px;border-left:4px solid var(--accent);line-height:1.3}
h2 .no{color:var(--accent);margin-right:8px;font-size:14px;letter-spacing:1px;vertical-align:middle}
.hint{font-size:12px;color:var(--ink3);margin:0 0 12px;padding-left:16px}
.card{border:1px solid var(--rule);border-radius:6px;background:rgba(255,255,255,.55);padding:18px 20px}
.grid{display:grid;gap:12px;margin:14px 0}
.g2{grid-template-columns:repeat(auto-fit,minmax(340px,1fr))}
.g3{grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.g4{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}
.kpi{border:1px solid var(--rule);border-radius:6px;background:rgba(255,255,255,.6);padding:14px 18px;text-align:center}
.kpi .v{font-family:var(--serif);font-size:30px;font-weight:700;color:var(--ink);line-height:1.2}
.kpi .v small{font-size:15px;color:var(--ink3);font-weight:400}
.kpi .k{font-size:12px;color:var(--ink3);margin-top:2px}
.kpi .d{font-size:11px;margin-top:4px;color:var(--ink3)}
.kpi .d.up{color:var(--red)}
.kpi .d.down{color:var(--green)}
.row{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0}
.chip{border:1px solid var(--rule2);background:var(--paper2);border-radius:100px;padding:2px 12px;font-size:12px;color:var(--ink2)}
.chip b{color:var(--ink)}
.item{padding:10px 0;border-bottom:1px solid var(--rule)}
.item:last-child{border-bottom:none}
.item .t{font-size:14px;line-height:1.55}
.item .m{font-size:12px;color:var(--ink3);margin-top:3px}
.badge{display:inline-block;font-size:11px;padding:1px 8px;border-radius:8px;margin-right:6px;vertical-align:1px}
.b-red{background:var(--rsoft);color:var(--red)}
.b-org{background:var(--soft);color:var(--accent2)}
.b-blu{background:var(--bsoft);color:var(--blue)}
.b-grn{background:var(--gsoft);color:var(--green)}
.b-gry{background:var(--paper2);color:var(--ink2)}
.insight{border:1px dashed var(--rule2);border-radius:6px;padding:10px 14px;background:rgba(255,255,255,.5)}
.insight .it{font-weight:700;font-size:13px}
.insight .ix{font-size:12.5px;color:var(--ink2);line-height:1.65}
.tw{overflow-x:auto;margin:12px 0}
table{border-collapse:collapse;width:100%;font-size:12.5px;background:rgba(255,255,255,.5)}
th{font-family:var(--serif);font-weight:600;text-align:left;background:var(--paper2);border-bottom:2px solid var(--rule2);padding:7px 12px;white-space:nowrap}
td{border-bottom:1px solid var(--rule);padding:7px 12px;vertical-align:top;color:var(--ink2)}
td.c,th.c{text-align:center}
.empty{font-size:13px;color:var(--ink3);padding:6px 0}
.ok{color:var(--green);font-weight:600}
.warn{color:var(--red);font-weight:600}
.subhd{font-family:var(--serif);font-size:15px;font-weight:600;margin:16px 0 8px;color:var(--ink)}
.subhd .n{font-size:11px;color:var(--ink3);font-family:var(--sans);font-weight:400;margin-left:8px}
footer{margin-top:40px;text-align:center;font-size:11px;color:var(--ink4);border-top:1px solid var(--rule);padding-top:12px;line-height:2}
</style>
</head>
<body>
<div class="wrap">

<header class="hero">
  <div style="overflow:hidden">
    <div class="mark">访</div>
    <h1>拜访志周报<span class="stamp">周 报 归 档</span></h1>
    <p class="sub">统计周期 ${esc(periodLabel)}（每周五 18:00 切换）· 共 ${S.callCount} 通 / ${S.callCustomers} 位客户 / ${fmtHM(S.totalSec)}</p>
    <div class="meta">
      <span class="tag hot">第 ${tr.length ? Math.max(1, tr.length) : 1} 期</span>
      <span class="tag">AI 分析 ${S.analyzed}/${S.callCount}</span>
      <span class="tag g">闭环 ${fuCloseRate}%</span>
      <span class="tag ${negN ? 'r' : ''}">情绪 正${posN}/中${neuN}${negN ? '/负' + negN : ''}</span>
      <span class="tag b">质量均分 ${S.qAvg || '—'}</span>
      <span class="tag">生成于 ${new Date().toLocaleString('zh-CN', { hour12: false })}</span>
    </div>
  </div>
</header>

<!-- ① 下周重点 -->
<h2><span class="no">第 01 章</span>下周重点</h2>
<p class="hint">口径：超期未完成 &gt; 高优先级 &gt; 7 天内到期 &gt; 跟进停滞（截取前 12 项，完整清单见待办系统）</p>
<div class="card">
  ${nextWeek.length ? nextWeek.map((t, i) => `
  <div class="item">
    <div class="t"><b style="color:var(--accent);font-family:var(--serif);">${String(i + 1).padStart(2, '0')}</b>　${badgeSpan(t)}<b>${esc(t.customer_name || '未关联客户')}</b> · ${esc(t.content)}</div>
    <div class="m">到期：${esc(t.due_date || '无')}${t.fu_last ? ' ｜ 最近跟进：' + esc(t.fu_last_res || '') + '（' + fmtDateCn(t.fu_last_at || '') + '）' : ' ｜ <span style="color:var(--red);">尚无跟进记录</span>'}</div>
  </div>`).join('') : '<div class="empty ok">✅ 无超期、无高优积压，节奏健康</div>'}
  ${stuck.length ? `<div style="margin-top:12px;font-size:12.5px;color:var(--amber);border-top:1px dashed var(--rule2);padding-top:10px;">⏳ 跟进停滞提醒（&gt;2 天无新进展，共 ${stuck.length} 项）：${stuck.slice(0, 8).map(t => esc(t.customer_name || String(t.content).slice(0, 10))).join('、')}${stuck.length > 8 ? ' 等' : ''}</div>` : ''}
</div>

<!-- ② 本周数据总览 -->
<h2><span class="no">第 02 章</span>本周数据总览</h2>
<p class="hint">${esc(periodLabel)} · 数据直读本地库，与 8897 系统实时一致</p>
<div class="grid g4">
  <div class="kpi"><div class="v">${S.callCount}<small> 通</small></div><div class="k">通话录音</div>${prev ? `<div class="d ${cur && cur.calls >= prev.calls ? 'up' : 'down'}">环比 ${delta(cur.calls, prev.calls) || '持平'}</div>` : ''}</div>
  <div class="kpi"><div class="v">${S.callCustomers}<small> 位</small></div><div class="k">沟通客户数</div>${prev ? `<div class="d ${cur && cur.customers >= prev.customers ? 'up' : 'down'}">环比 ${delta(cur.customers, prev.customers) || '持平'}</div>` : ''}</div>
  <div class="kpi"><div class="v">${fmtHM(S.totalSec)}</div><div class="k">通话总时长</div>${prev ? `<div class="d ${cur && cur.sec >= prev.sec ? 'up' : 'down'}">环比 ${delta(cur.sec, prev.sec) || '持平'}</div>` : ''}</div>
  <div class="kpi"><div class="v">${Math.round(S.avgSec / 60)}<small> 分钟</small></div><div class="k">平均单通</div><div class="d">最长 ${fmtDur(S.longest)}</div></div>
</div>
<div class="row">
  <span class="chip">跟进 <b>${S.fuCount}</b> 条</span>
  <span class="chip">闭环 <b>${S.fuClosed}</b> 项</span>
  <span class="chip">新待办 <b>${S.todosNew}</b> / 完成 <b>${S.todosDone}</b> / 未完 <b>${S.todosOpen}</b></span>
  <span class="chip">超期 <b style="color:var(--red);">${S.overdue}</b></span>
  <span class="chip">高优未完 <b style="color:var(--accent2);">${S.highOpenPrio}</b></span>
  <span class="chip">敏感预警 <b>${S.flagsOpen}</b></span>
  <span class="chip">质量均分 <b>${S.qAvg || '—'}</b>/10</span>
  <span class="chip">情绪 正${posN}/中${neuN}${negN ? '/负' + negN : ''}${unmarked ? '/未标' + unmarked : ''}</span>
</div>
<div class="grid g2">
  <div class="card"><div class="subhd">每日通话量<span class="n">周期内 8 个日历日（首末日为周五切换点）</span></div>${weekBars()}</div>
  <div class="card"><div class="subhd">近 4 期趋势<span class="n">上行：通话数 ｜ 下行：总时长</span></div>${trendSVG() || '<div class="empty">历史数据不足</div>'}</div>
</div>

<!-- ③ 沟通深度剖析 -->
<h2><span class="no">第 03 章</span>沟通深度剖析</h2>
<p class="hint">客户 / 销售 / 话题 / 跟进结果 / 通话质量 / 情绪六个切面</p>
<div class="grid g2">
  <div class="card">
    <div class="subhd">沟通最多客户 TOP8<span class="n">按通话数</span></div>
    ${topCustomers.length ? hbars(topCustomers.map(c => ({ label: c.name, value: c.call_n, suffix: c.call_n + ' 通 · ' + fmtDur(c.total_sec) })), { width: 480, cut: 14 }) : '<div class="empty">本周无通话</div>'}
  </div>
  <div class="card">
    <div class="subhd">销售活跃榜<span class="n">按通话数（建档 ${totalSalesN} 位销售）</span></div>
    ${salesItems.length ? hbars(salesItems, { width: 480, left: 130, cut: 16 }) : '<div class="empty">本周无通话</div>'}
  </div>
  <div class="card">
    <div class="subhd">话题分布<span class="n">通话可多分类</span></div>
    ${catItems.length ? hbars(catItems, { width: 480, left: 100 }) : '<div class="empty">本周无分类数据</div>'}
  </div>
  <div class="card">
    <div class="subhd">通话质量分布<span class="n">AI 质量评分 · 均分 ${S.qAvg || '—'}</span></div>
    ${qItems.length ? hbars(qItems, { width: 480, left: 80 }) : '<div class="empty">本周无评分</div>'}
    <div class="subhd">沟通情绪<span class="n">AI 判定</span></div>
    <div class="row">${Object.entries(sentDist).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span class="chip" style="${k === '正面' ? 'background:var(--gsoft);border-color:var(--green);color:var(--green)' : k === '负面' ? 'background:var(--rsoft);border-color:var(--red);color:var(--red)' : ''}">${esc(k)} <b>${v}</b></span>`).join('')}</div>
  </div>
</div>
<div class="card">
  <div class="subhd">跟进动态拆解<span class="n">共 ${S.fuCount} 条 · 闭环率 ${fuCloseRate}%</span></div>
  <div class="row">${Object.entries(fuByResult).sort((a, b) => b[1] - a[1]).map(([k, v]) =>
    `<span class="chip" style="${k === '已闭环' ? 'background:var(--gsoft);border-color:var(--green);color:var(--green)' : k === '无进展' ? 'background:var(--rsoft);border-color:var(--red);color:var(--red)' : k === '有突破' ? 'background:var(--asoft);border-color:var(--amber);color:var(--amber)' : ''}">${esc(k)} <b>${v}</b></span>`).join('')}</div>
  ${notMoving.length ? `<div class="item" style="color:var(--red);font-size:13px;">⚠ 无进展 ${notMoving.length} 项：${notMoving.slice(0, 5).map(f => esc(f.customer_name || (f.todo_content || f.content || '').slice(0, 14))).join('、')}</div>` : ''}
  ${breakthrough.length ? `<div class="item" style="color:var(--green);font-size:13px;">🚀 有突破 ${breakthrough.length} 项：${breakthrough.slice(0, 5).map(f => esc(f.customer_name || (f.todo_content || f.content || '').slice(0, 14))).join('、')}${breakthrough.length > 5 ? ' 等' : ''}</div>` : ''}
  <div class="subhd">未来两周待办到期日历<span class="n">红色含高优</span></div>
  ${dueItems.length ? hbars(dueItems, { width: 640, left: 130, cut: 16 }) : '<div class="empty">未来两周无到期待办</div>'}
</div>

<!-- ④ 遗留问题 -->
<h2><span class="no">第 04 章</span>遗留问题</h2>
<p class="hint">敏感预警 / 未闭环重点 / 沉睡客户</p>
<div class="card">
  ${openFlags.length ? `<div class="subhd" style="color:var(--red);">⚠ 未处理敏感预警（${openFlags.length}）</div>
  ${openFlags.slice(0, 8).map(f => `<div class="item" style="font-size:13px;">【${esc(f.tag)}·${esc(f.word)}】${esc(String(f.call_title || '').split('_')[0])}${f.customer_name ? ' · ' + esc(f.customer_name) : ''}<span style="color:var(--ink3);">（${fmtDateCn(f.created_at || '')}）</span></div>`).join('')}` :
  '<div class="empty ok">✅ 敏感预警已全部处理</div>'}
  <div class="subhd" style="color:var(--amber);">📌 未闭环重点事项<span class="n">置顶 ${pinnedHl.length} 项 + 高价值 ${(D.highlightsOpen || []).length} 项</span></div>
  ${pinnedHl.length || impHl.length ? [...pinnedHl, ...impHl].slice(0, 10).map(h => `
  <div class="item" style="font-size:13px;">
    <span class="badge ${h.pinned ? 'b-org' : 'b-gry'}">${h.pinned ? '置顶' : esc(h.kind)}</span>${h.importance >= 4 ? `<span class="badge b-gry">★${h.importance}</span>` : ''}<b>${esc(h.customer_name || '未关联')}</b> · ${esc(h.content)}
  </div>`).join('') : '<div class="empty ok">✅ 重点事项池已清空</div>'}
  <div class="subhd" style="color:var(--blue);">💤 沉睡客户<span class="n">30 天未回访 · 活跃档</span></div>
  ${(D.stale || []).length ? D.stale.slice(0, 8).map(c => `<div class="item" style="font-size:13px;">${esc(c.name)} <span style="color:var(--ink3);">（${esc(c.level || '')}，最后拜访 ${fmtDateCn(c.last_visit_at)}，未结待办 ${c.open_todos}）</span></div>`).join('') : '<div class="empty ok">✅ 无沉睡客户</div>'}
</div>

<!-- ⑤ 特色概览 -->
<h2><span class="no">第 05 章</span>特色概览</h2>
<p class="hint">话痨榜 / 单通最长 / 待办净增 / 高质量通话 / 本周沉淀</p>
<div class="grid g3">
  <div class="card" style="border-left:3px solid var(--accent);">
    <div class="subhd">🏆 本周话痨榜</div>
    <div style="font-family:var(--serif);font-size:16px;">${esc(talkKing.name || '—')}</div>
    <div style="font-size:12.5px;color:var(--ink3);">${(talkKing.call_n || 0)} 通 / ${fmtDur(talkKing.total_sec || 0)}</div>
    <div style="font-size:12.5px;color:var(--ink3);margin-top:8px;">⏱ 单通最长：<b style="color:var(--ink);">${fmtDur(S.longest)}</b>${longestCall.customer_name ? '（' + esc(String(longestCall.customer_name).slice(0, 14)) + '）' : ''}</div>
    <div style="font-size:12.5px;color:var(--ink3);margin-top:4px;">📈 待办净增：<b style="color:${S.todosNew > S.todosDone ? 'var(--red)' : 'var(--green)'};">${S.todosNew > S.todosDone ? '+' : ''}${S.todosNew - S.todosDone}</b>（新 ${S.todosNew} / 完 ${S.todosDone}）</div>
    <div style="font-size:12.5px;color:var(--ink3);margin-top:4px;">🗣 跟进产出率：<b style="color:var(--ink);">${fuRate}</b> 条/通</div>
  </div>
  <div class="card" style="border-left:3px solid var(--green);">
    <div class="subhd">🎤 高质量通话榜<span class="n">质量分 ≥7</span></div>
    ${topQ.length ? topQ.map(c => `<div class="item" style="font-size:12.5px;padding:6px 0;"><b style="color:var(--green);">q${c.quality}</b> ${esc(String(c.customer || '').slice(0, 16))}<span style="color:var(--ink3);"> · ${fmtHM(c.sec)} · ${esc(c.date)}</span></div>`).join('') : '<div class="empty">本周无 7 分以上通话</div>'}
  </div>
  <div class="card" style="border-left:3px solid var(--blue);">
    <div class="subhd">🗂 本周沉淀分布<span class="n">AI 提炼 ${Object.values(D.hlWeekDist || {}).reduce((a, b) => a + b, 0)} 条</span></div>
    ${hlItems.length ? hbars(hlItems, { width: 300, left: 60, right: 60 }) : '<div class="empty">本周无沉淀</div>'}
  </div>
</div>

<!-- ⑥ 一页洞察 -->
<h2><span class="no">第 06 章</span>一页洞察</h2>
<p class="hint">全部由本周数据计算生成</p>
<div class="grid g3">
  ${insightBlocks().map(b => `<div class="insight"><div class="it">${b.icon} ${esc(b.title)}</div><div class="ix">${esc(b.text)}</div></div>`).join('')}
</div>

<footer>拜访志 VisitLog · 周报归档 第 ${tr.length || 1} 期 · ${esc(periodLabel)}（每周五 18:00 切换） · 数据截至生成时刻 · 本报告由系统自动生成</footer>
</div>
</body>
</html>`;

fs.writeFileSync(process.stdout.fd, html);
