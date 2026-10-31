// 拜访志周报 · HTML 生成器（邮件安全：零 JS、内联 CSS、内联 SVG）
// 输入：collect_data.js 的 JSON（stdin 或文件参数）；输出：HTML 到 stdout
const fs = require('fs');
const input = fs.readFileSync(process.argv[2] || 0, 'utf8');
const D = JSON.parse(input);

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmtDur = sec => { if (!sec) return '0 分钟'; const m = Math.round(sec / 60); return m >= 60 ? Math.floor(m / 60) + ' 小时 ' + (m % 60) + ' 分' : m + ' 分钟'; };
const fmtDateCn = d => d ? d.slice(5).replace('-', '/') : '';
const pad = n => String(n).padStart(2, '0');
const fmtDateLocal = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

const S = D.stats;

// 周期：上周五 18:00 ~ 本周五 18:00（滚动 7 天）
const W_START = D.weekStartDay || (D.weekStart || '').slice(0, 10);   // 周期首日
const W_END = D.weekEndDay || (D.weekEnd || '').slice(0, 10);         // 周期末日
const periodLabel = `${fmtDateCn(W_START)} ~ ${fmtDateCn(W_END)}（每周五 18:00 切换）`;

// ── 下周重点：超期/高优/近 7 天到期未闭环 ──
const today = W_END;
const next7 = new Date(new Date(today).getTime() + 7 * 864e5).toISOString().slice(0, 10);
const openTodos = D.todos.todosOpen || [];
const overdue = openTodos.filter(t => t.overdue === 1);
const highOpen = openTodos.filter(t => t.priority === '高' && t.overdue !== 1);
const dueSoon = openTodos.filter(t => t.overdue !== 1 && t.priority !== '高' && t.due_date && t.due_date <= next7);
// 卡住的跟进：TODO 类待办最近一次跟进超 2 天且结果不是已闭环
const stuck = openTodos.filter(t => t.fu_last_at && t.fu_last_res !== '已闭环' &&
  (new Date(today) - new Date(t.fu_last_at.slice(0, 10))) / 864e5 > 2).slice(0, 5);

const nextWeek = [
  ...overdue.map(t => ({ ...t, badge: '超期', cls: 'b-red' })),
  ...highOpen.map(t => ({ ...t, badge: '高优', cls: 'b-org' })),
  ...dueSoon.map(t => ({ ...t, badge: '7天内到期', cls: 'b-blu' })),
].slice(0, 10);

// ── 本周沟通最多的客户 ──
const topCustomers = (D.activeCustomers || []).slice(0, 6);

// ── 深度剖析素材 ──
const fuByResult = {};
for (const f of D.followups || []) fuByResult[f.result || '未标记'] = (fuByResult[f.result || '未标记'] || 0) + 1;
const notMoving = (D.followups || []).filter(f => f.result === '无进展');
const breakthrough = (D.followups || []).filter(f => f.result === '有突破');

// 遗留问题：未处理预警 + 未闭环重点 + 沉睡客户
const openFlags = D.flags || [];
const pinnedHl = (D.highlightsOpen || []).filter(h => h.pinned === 1).slice(0, 5);
const impHl = (D.highlightsOpen || []).filter(h => h.pinned !== 1).slice(0, 5);

// ── SVG 生成器 ──
function hbarSVG(items, opts = {}) {
  // 横向条形图：items=[{label,value,color?}]
  if (!items || !items.length) return '';
  const max = Math.max(...items.map(i => i.value)) || 1;
  const bw = 20, gap = 6, left = 120, right = 40;
  const H = items.length * (bw + gap) + gap;
  const W = opts.width || 560;
  const plot = W - left - right;
  let bars = '';
  items.forEach((it, i) => {
    const y = gap + i * (bw + gap);
    const w = Math.max(2, Math.round(it.value / max * plot));
    bars += `<rect x="${left}" y="${y}" width="${w}" height="${bw}" rx="3" fill="${it.color || '#4C6EF5'}"/>` +
      `<text x="${left + w + 6}" y="${y + bw / 2 + 4}" font-size="12" fill="#5f6368">${esc(it.value)}${esc(it.suffix || '')}</text>`;
  });
  const labels = items.map((it, i) =>
    `<text x="${left - 6}" y="${gap + i * (bw + gap) + bw / 2 + 4}" font-size="12" fill="#333" text-anchor="end">${esc(String(it.label).slice(0, 10))}</text>`).join('');
  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" style="font-family:'Microsoft YaHei',sans-serif">${labels}${bars}</svg>`;
}

// 周期每日通话量：从周期首日遍历到末日（含两端周五，共 8 个日历日；首日只计 18:00 后）
function weekBarSVG() {
  const days = [];
  for (let d = new Date(W_START + 'T00:00:00'); fmtDateLocal(d) <= W_END; d = new Date(d.getTime() + 864e5)) {
    const key = fmtDateLocal(d);
    const inWin = c => {
      const v = c.visited_at || '';
      if (key === W_START) return v > D.weekStart;             // 首日：仅 18:00 之后
      if (key === W_END) return v <= D.weekEnd;                // 末日：截至 18:00
      return v.slice(0, 10) === key;
    };
    days.push({ key, label: '周' + '日一二三四五六'[d.getDay()] + ' ' + key.slice(5).replace('-', '/'), n: (D.calls || []).filter(inWin).length });
  }
  const max = Math.max(...days.map(x => x.n), 1);
  const bw = 52, gap = 12, H = 130, base = 100;
  let bars = '';
  days.forEach((d2, i) => {
    const h = Math.round(d2.n / max * 70) || (d2.n ? 4 : 2);
    const x = 10 + i * (bw + gap);
    bars += `<rect x="${x}" y="${base - h}" width="${bw}" height="${h}" rx="4" fill="${d2.n ? '#4C6EF5' : '#E8EAF6'}"/>` +
      `<text x="${x + bw / 2}" y="${base - h - 6}" font-size="13" font-weight="bold" fill="#333" text-anchor="middle">${d2.n}</text>` +
      `<text x="${x + bw / 2}" y="${base + 16}" font-size="11" fill="#666" text-anchor="middle">${esc(d2.label)}</text>`;
  });
  return `<svg width="${10 + days.length * (bw + gap)}" height="${H}" xmlns="http://www.w3.org/2000/svg" style="font-family:'Microsoft YaHei',sans-serif">${bars}</svg>`;
}

const catItems = Object.entries(D.catAgg || {}).sort((a, b) => b[1] - a[1]).slice(0, 7)
  .map(([label, value]) => ({ label, value }));
const catColors = ['#4C6EF5', '#12B886', '#FA8231', '#E84393', '#F7B731', '#845EF7', '#20C997'];
catItems.forEach((it, i) => it.color = catColors[i % catColors.length]);

// ── 邮件 HTML ──
const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>拜访志周报 ${W_START} ~ ${W_END}</title>
</head>
<body style="margin:0;padding:0;background:#f0f2f5;font-family:'Microsoft YaHei','PingFang SC',Arial,sans-serif;color:#333;">
<div style="max-width:680px;margin:0 auto;padding:16px 12px;">

  <!-- ① 下周重点（最顶部）-->
  <div style="background:#fff;border-radius:12px;padding:20px 22px;margin-bottom:14px;border-top:4px solid #E03131;">
    <div style="font-size:18px;font-weight:bold;color:#1a1a1a;">🎯 下周重点（已按优先级排序）</div>
    <div style="font-size:12px;color:#888;margin:4px 0 12px;">口径：超期未完成 &gt; 高优先级 &gt; 7 天内到期 &gt; 跟进停滞</div>
    ${nextWeek.length ? nextWeek.map((t, i) => `
    <div style="padding:9px 0;border-bottom:1px solid #f2f2f2;">
      <div style="font-size:14px;line-height:1.5;">
        <span style="color:#E03131;font-weight:bold;">${i + 1}.</span>
        <span style="background:${t.cls === 'b-red' ? '#FFE3E3' : t.cls === 'b-org' ? '#FFF4E6' : '#E7F0FF'};color:${t.cls === 'b-red' ? '#C92A2A' : t.cls === 'b-org' ? '#D9480F' : '#1B4E9B'};font-size:11px;padding:1px 7px;border-radius:8px;margin-right:6px;">${t.badge}</span>
        <strong>${esc(t.customer_name || '未关联客户')}</strong> · ${esc(t.content)}
      </div>
      <div style="font-size:12px;color:#888;margin-top:3px;">到期：${esc(t.due_date || '无')}${t.fu_last ? ' ｜ 最近跟进：' + esc(t.fu_last_res || '') + '（' + fmtDateCn(t.fu_last_at || '') + '）' : ' ｜ <span style="color:#E03131;">尚无跟进记录</span>'}</div>
    </div>`).join('') : '<div style="color:#12B886;font-size:14px;padding:8px 0;">✅ 无超期、无高优积压，节奏健康</div>'}
    ${stuck.length ? `<div style="margin-top:10px;font-size:13px;color:#D9480F;">⏳ 跟进停滞提醒（&gt;2天无新进展）：${stuck.map(t => esc(t.customer_name || t.content.slice(0, 10))).join('、')}</div>` : ''}
  </div>

  <!-- ② 本周数据总览 -->
  <div style="background:#fff;border-radius:12px;padding:20px 22px;margin-bottom:14px;">
    <div style="font-size:18px;font-weight:bold;margin-bottom:14px;">📊 本周数据总览（${periodLabel}）</div>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">
      <tr>
        <td style="padding:10px;background:#F8F9FA;border-radius:8px;text-align:center;width:25%;"><div style="font-size:24px;font-weight:bold;color:#4C6EF5;">${S.callCount}</div><div style="font-size:12px;color:#666;">通话录音</div></td>
        <td style="padding:10px;background:#F8F9FA;border-radius:8px;text-align:center;width:25%;"><div style="font-size:24px;font-weight:bold;color:#12B886;">${S.callCustomers}</div><div style="font-size:12px;color:#666;">沟通客户数</div></td>
        <td style="padding:10px;background:#F8F9FA;border-radius:8px;text-align:center;width:25%;"><div style="font-size:24px;font-weight:bold;color:#FA8231;">${(S.totalSec / 3600).toFixed(1)}h</div><div style="font-size:12px;color:#666;">通话总时长</div></td>
        <td style="padding:10px;background:#F8F9FA;border-radius:8px;text-align:center;width:25%;"><div style="font-size:24px;font-weight:bold;color:#845EF7;">${Math.round(S.avgSec / 60)}分</div><div style="font-size:12px;color:#666;">平均单通</div></td>
      </tr>
    </table>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;">
      <div style="font-size:13px;background:#F8F9FA;border-radius:6px;padding:5px 12px;">跟进记录 <b>${S.fuCount}</b> 条</div>
      <div style="font-size:13px;background:#F8F9FA;border-radius:6px;padding:5px 12px;">闭环 <b>${S.fuClosed}</b> 项</div>
      <div style="font-size:13px;background:#F8F9FA;border-radius:6px;padding:5px 12px;">新增待办 <b>${S.todosNew}</b> / 完成 <b>${S.todosDone}</b></div>
      <div style="font-size:13px;background:#F8F9FA;border-radius:6px;padding:5px 12px;">最长单通 <b>${fmtDur(S.longest)}</b></div>
      <div style="font-size:13px;background:#F8F9FA;border-radius:6px;padding:5px 12px;">AI 分析完成 <b>${S.analyzed}/${S.callCount}</b></div>
    </div>
    <div style="margin-top:16px;">${weekBarSVG()}</div>
  </div>

  <!-- ③ 深度剖析：客户沟通 -->
  <div style="background:#fff;border-radius:12px;padding:20px 22px;margin-bottom:14px;">
    <div style="font-size:18px;font-weight:bold;margin-bottom:12px;">🔍 本周沟通深度剖析</div>
    <div style="font-size:13px;color:#666;margin-bottom:10px;">本周沟通最多客户</div>
    ${topCustomers.length ? hbarSVG(topCustomers.map(c => ({ label: c.name, value: c.call_n, suffix: ' 通 · ' + fmtDur(c.total_sec) })), { width: 620 }) : '<div style="color:#888;font-size:13px;">本周无通话</div>'}
    <div style="font-size:13px;color:#666;margin:14px 0 8px;">话题分布（通话可多分类）</div>
    ${catItems.length ? hbarSVG(catItems, { width: 620 }) : ''}
    <div style="margin-top:14px;font-size:13px;line-height:1.7;">
      <div style="font-weight:bold;margin-bottom:6px;">跟进动态拆解（${S.fuCount} 条）</div>
      ${Object.entries(fuByResult).sort((a, b) => b[1] - a[1]).map(([k, v]) =>
        `<span style="display:inline-block;margin:2px 6px 2px 0;padding:3px 10px;border-radius:10px;font-size:12px;background:${k === '已闭环' ? '#E6FCF5;color:#087f5b' : k === '无进展' ? '#FFF0F0;color:#C92A2A' : k === '有突破' ? '#FFF9DB;color:#E67700' : '#F1F3F5;color:#555'};">${esc(k)} ${v}</span>`).join('')}
      ${notMoving.length ? `<div style="margin-top:8px;color:#C92A2A;">⚠ 无进展 ${notMoving.length} 项，集中在：${notMoving.slice(0, 5).map(f => esc(f.customer_name || (f.todo_content || f.content || '').slice(0, 14))).join('、')}</div>` : ''}
      ${breakthrough.length ? `<div style="margin-top:6px;color:#087f5b;">🚀 有突破 ${breakthrough.length} 项：${breakthrough.slice(0, 4).map(f => esc(f.customer_name || (f.todo_content || f.content || '').slice(0, 14))).join('、')}</div>` : ''}
    </div>
  </div>

  <!-- ④ 遗留问题 -->
  <div style="background:#fff;border-radius:12px;padding:20px 22px;margin-bottom:14px;">
    <div style="font-size:18px;font-weight:bold;margin-bottom:12px;">🧩 遗留问题清单</div>
    ${openFlags.length ? `<div style="font-weight:bold;font-size:14px;color:#C92A2A;margin-bottom:6px;">⚠ 未处理敏感预警（${openFlags.length}）</div>
    ${openFlags.slice(0, 6).map(f => `<div style="font-size:13px;padding:6px 0;border-bottom:1px dashed #f0f0f0;">【${esc(f.tag)}·${esc(f.word)}】${esc(f.call_title || '').split('_')[0]}${f.customer_name ? ' · ' + esc(f.customer_name) : ''}<span style="color:#888;">（${fmtDateCn(f.created_at || '')}）</span></div>`).join('')}` :
      '<div style="font-size:13px;color:#12B886;">✅ 敏感预警已全部处理</div>'}
    <div style="font-weight:bold;font-size:14px;margin:14px 0 6px;color:#E67700;">📌 未闭环重点事项（置顶/高价值）</div>
    ${pinnedHl.length || impHl.length ? [...pinnedHl, ...impHl].slice(0, 8).map(h => `
    <div style="font-size:13px;padding:7px 0;border-bottom:1px dashed #f0f0f0;">
      <span style="font-size:11px;padding:1px 6px;border-radius:6px;margin-right:6px;background:${h.pinned ? '#FFF4E6' : '#F1F3F5'};color:${h.pinned ? '#D9480F' : '#666'};">${h.pinned ? '置顶' : esc(h.kind)}${h.importance >= 4 ? ' ★' + h.importance : ''}</span>
      <strong>${esc(h.customer_name || '未关联')}</strong> · ${esc(h.content)}
    </div>`).join('') : '<div style="font-size:13px;color:#12B886;">✅ 重点事项池已清空</div>'}
    <div style="font-weight:bold;font-size:14px;margin:14px 0 6px;color:#5f3dc4;">💤 沉睡客户（30 天未回访·活跃档）</div>
    ${(D.stale || []).length ? D.stale.slice(0, 6).map(c => `<div style="font-size:13px;padding:5px 0;">${esc(c.name)} <span style="color:#888;">（${esc(c.level || '')}，最后拜访 ${fmtDateCn(c.last_visit_at)}，未结待办 ${c.open_todos}）</span></div>`).join('') : '<div style="font-size:13px;color:#12B886;">✅ 无沉睡客户</div>'}
  </div>

  <!-- ⑤ 特色概览 -->
  <div style="background:#fff;border-radius:12px;padding:20px 22px;margin-bottom:14px;">
    <div style="font-size:18px;font-weight:bold;margin-bottom:12px;">✨ 特色概览</div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <tr style="background:#F8F9FA;"><td style="padding:8px 12px;border-radius:6px 0 0 0;">🏆 本周"话痨榜"</td><td style="padding:8px 12px;text-align:right;border-radius:0 6px 0 0;">${esc((topCustomers[0] || {}).name || '—')}（${(topCustomers[0] || {}).call_n || 0} 通 / ${fmtDur((topCustomers[0] || {}).total_sec)}）</td></tr>
      <tr><td style="padding:8px 12px;">⏱ 单通最长</td><td style="padding:8px 12px;text-align:right;">${fmtDur(S.longest)}</td></tr>
      <tr style="background:#F8F9FA;"><td style="padding:8px 12px;">📈 待办净增减</td><td style="padding:8px 12px;text-align:right;color:${S.todosNew > S.todosDone ? '#C92A2A' : '#087f5b'};">${S.todosNew > S.todosDone ? '+' : ''}${S.todosNew - S.todosDone}（新 ${S.todosNew} / 完 ${S.todosDone}）</td></tr>
      <tr><td style="padding:8px 12px;">🗂 客户档位分布</td><td style="padding:8px 12px;text-align:right;">${(D.levelDist || []).map(l => esc(l.level) + ' ' + l.n).join(' ｜ ') || '—'}</td></tr>
      <tr style="background:#F8F9FA;"><td style="padding:8px 12px;border-radius:0 0 6px 0;">🗣 每通平均信息量</td><td style="padding:8px 12px;text-align:right;border-radius:0 0 0 6px;">跟进产出率 ${S.fuCount && S.callCount ? Math.round(S.fuCount / S.callCount * 10) / 10 : 0} 条/通</td></tr>
    </table>
  </div>

  <div style="text-align:center;font-size:11px;color:#aaa;padding:10px 0 20px;">拜访志 VisitLog · 本报告由系统自动生成 · ${periodLabel} · 数据截至发信时刻</div>
</div>
</body>
</html>`;

fs.writeFileSync(process.stdout.fd, html);
