/* 拜访志 · 客户列表 + 客户详情抽屉 */

// 当前使用者名（跟进人默认值）：来自服务端 settings，未加载时回退空串
const OWNER = () => (window.App && window.App.owner) || '';

window.Cust = (function () {
  const { $, $$, get, post, esc, toast, fmtDate, rel, drawer, closeDrawer, bindEdit } = App;
  let id = null;

  App.page('customers', async (v) => {
    const r = await get('/api/customers');
    if (!r.ok) return;
    const list = r.list || [];
    v.innerHTML = `
    <div class="page-head">
      <div><div class="eyebrow">Customers</div><h2>客户档案</h2>
        <div class="desc">${list.length} 个客户 · 姓名/电话由录音自动提炼可改 · 对接业务员/跟进人可直接填写</div></div>
      <input id="ckw" placeholder="搜索客户 / 联系人 / 业务员" style="width:260px">
    </div>
    <div class="card"><div class="tw"><table>
      <thead><tr><th>客户名称</th><th class="nowrap">客户姓名</th><th class="nowrap">客户电话</th>
        <th class="nowrap">对接业务员</th><th class="nowrap">跟进人</th>
        <th class="nowrap">最近拜访</th><th class="nowrap">拜访次数</th>
        <th class="nowrap">未完成待办</th><th class="nowrap">要点</th><th class="nowrap">标记</th></tr></thead>
      <tbody id="ctb"></tbody></table></div></div>`;

    function draw() {
      const k = ($('#ckw', v).value || '').trim().toLowerCase();
      const arr = k ? list.filter(c => (c.name + (c.contact_name || '') + (c.contact_phone || '') + (c.sales || '') + (c.owner || '') + (c.tags || '') + (c.note || '')).toLowerCase().includes(k)) : list;
      $('#ctb', v).innerHTML = arr.length ? arr.map(c => `
        <tr data-id="${c.id}" style="cursor:pointer">
          <td><b>${esc(c.name)}</b> ${c.level ? `<span class="tag a">${esc(c.level)}</span>` : ''}
            <div class="muted" style="font-size:11px">${esc(c.type || '')}${c.region ? ' · ' + esc(c.region) : ''}</div></td>
          <td class="nowrap"><input class="cust-in" data-f="contact_name" value="${esc(c.contact_name || '')}" placeholder="联系人"
            title="客户姓名/联系人（录音自动提炼，可改）"></td>
          <td class="nowrap"><input class="cust-in wide" data-f="contact_phone" value="${esc(c.contact_phone || '')}" placeholder="电话"
            title="客户电话（录音自动提炼，可改）"></td>
          <td class="nowrap"><input class="cust-in" data-f="sales" value="${esc(c.sales || '')}" placeholder="填业务员"
            title="对接业务员（该客户主要由谁跑）"></td>
          <td class="nowrap"><input class="cust-in" data-f="owner" value="${esc(c.owner || OWNER())}" placeholder="${esc(OWNER() || '跟进人')}"
            title="跟进人（默认 ${esc(OWNER() || '当前使用者')}，可改）"></td>
          <td class="nowrap">${fmtDate(c.last_visit_at)}<div class="muted" style="font-size:11px">${rel(c.last_visit_at)}</div></td>
          <td class="num nowrap">${c.visit_count || 0}</td>
          <td class="num nowrap">${c.open_todos || 0}</td>
          <td class="num nowrap">${c.hl_count || 0}</td>
          <td class="nowrap"><span class="tag ${c.status === '活跃' ? 'g' : ''}">${esc(c.status || '活跃')}</span></td>
        </tr>`).join('') : '<tr><td colspan="10" class="empty" style="padding:20px">没有匹配的客户</td></tr>';
      $$('#ctb tr[data-id]', v).forEach(tr => tr.onclick = () => { id = tr.dataset.id; render(); });
      // 行内填写：对接业务员 / 跟进人（阻止冒泡，避免触发打开档案）
      $$('#ctb .cust-in', v).forEach(inp => {
        inp.onclick = (e) => e.stopPropagation();
        inp.onchange = async () => {
          const row = inp.closest('tr');
          const r = await post(`/api/customers/${row.dataset.id}`, { field: inp.dataset.f, value: inp.value.trim() });
          if (r.ok) { toast('已保存'); list.find(c => c.id === row.dataset.id)[inp.dataset.f] = inp.value.trim(); }
          else App.route();
        };
        inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); };
      });
    }
    $('#ckw', v).oninput = draw;
    draw();
  });

  async function render() {
    const r = await get('/api/customers/' + id);
    if (!r.ok) return;
    const c = r.customer;
    drawer(`
    <div class="rowflex" style="justify-content:space-between;align-items:flex-start">
      <div style="min-width:0">
        <div class="eyebrow">Customer</div>
        <h2 style="font-size:24px" class="ed" id="ce-name" data-raw="${esc(c.name)}">${esc(c.name)}</h2>
      </div>
      <button class="btn sm" id="ce-export" title="生成离线分享 HTML（含拜访记录/待办/要点/跟进，单文件可直接发微信或邮件）"
        style="flex:0 0 auto;white-space:nowrap">📤 导出分享 HTML</button>
    </div>
    <div class="rowflex" style="margin:8px 0 16px;gap:6px">
      ${!r.calls || !r.calls.length ? '<span class="tag a" title="此客户由手工待办自动建档，尚无通话记录">✍ 手动建档</span>' : ''}
      <span class="kv" style="align-items:center"><span class="k">联系人</span>
        <span class="ed tag" id="ce-contact_name" data-raw="${esc(c.contact_name || '')}" style="border-color:var(--rule2)">${c.contact_name ? `<span>${esc(c.contact_name)}</span>` : '未提炼'}</span></span>
      <span class="kv" style="align-items:center"><span class="k">电话</span>
        <span class="ed tag" id="ce-contact_phone" data-raw="${esc(c.contact_phone || '')}" style="border-color:var(--rule2)">${c.contact_phone ? `<span>${esc(c.contact_phone)}</span>` : '未提炼'}</span></span>
      <span class="kv" style="align-items:center"><span class="k">对接</span>
        <span class="ed tag" id="ce-sales" data-raw="${esc(c.sales || '')}" style="border-color:var(--rule2)">${c.sales ? `<span>${esc(c.sales)}</span>` : '未分配'}</span></span>
      <span class="kv" style="align-items:center"><span class="k">跟进</span>
        <span class="ed tag" id="ce-owner" data-raw="${esc(c.owner || OWNER())}" style="border-color:var(--rule2)">${esc(c.owner || OWNER())}</span></span>
      <span class="ed" id="ce-level" data-raw="${esc(c.level || '')}">${c.level ? `<span class="tag a">${esc(c.level)}</span>` : '＋ 等级'}</span>
      <span class="ed" id="ce-type" data-raw="${esc(c.type || '')}">${c.type ? `<span class="tag">${esc(c.type)}</span>` : '＋ 类型'}</span>
      <span class="ed" id="ce-region" data-raw="${esc(c.region || '')}">${c.region ? `<span class="tag">${esc(c.region)}</span>` : '＋ 地区'}</span>
      <span class="ed" id="ce-status" data-raw="${esc(c.status || '活跃')}"><span class="tag ${(c.status || '活跃') === '活跃' ? 'g' : ''}">${esc(c.status || '活跃')}</span></span>
    </div>

    <div class="bento" style="margin-bottom:16px">
      <div class="card c3"><div class="stat"><div class="big">${c.visit_count || 0}</div><div class="lb">累计拜访</div>
        <div class="ft">首次 ${fmtDate(c.first_visit_at)}</div></div></div>
      <div class="card c3"><div class="stat"><div class="big">${fmtDate(c.last_visit_at)}</div><div class="lb">最近拜访</div>
        <div class="ft">${rel(c.last_visit_at)}</div></div></div>
      <div class="card c3"><div class="stat ${c.open_todos ? 'hot' : ''}"><div class="big">${c.open_todos || 0}</div><div class="lb">未完成待办</div></div></div>
      <div class="card c3"><div class="stat"><div class="big">${c.hl_count || 0}</div><div class="lb">沉淀要点</div></div></div>
    </div>

    <h3 style="font-size:13px;margin:16px 0 6px">拜访记录 <span class="muted" style="font-weight:400;font-size:11px">${r.calls.length} 通</span></h3>
    <div id="c-calls"></div>

    <h3 style="font-size:13px;margin:18px 0 6px">未完成待办</h3>
    <div id="c-todos"></div>

    <h3 style="font-size:13px;margin:18px 0 6px">沉淀要点</h3>
    <div id="c-hl"></div>

    <h3 style="font-size:13px;margin:18px 0 6px">客户跟进记录
      <span class="muted" style="font-weight:400;font-size:11px">业务负责人/接收人写的回复都会汇集在这里</span></h3>
    <div id="c-fu" style="margin-bottom:10px"></div>
    <div class="rowflex" style="gap:6px;align-items:flex-end">
      <textarea id="fu-cust-in" rows="2" placeholder="写一条客户级跟进（联系进展、客户答复、背景补充…）" class="grow"></textarea>
      <div style="flex:0 0 auto;display:flex;flex-direction:column;gap:4px">
        <select id="fu-cust-res" style="width:110px">
          <option value="">结果档</option><option>无进展</option><option>推进中</option><option>有突破</option><option>已闭环</option>
        </select>
        <button class="btn sm pri" id="fu-cust-add">保存</button>
      </div>
    </div>
    `);

    const U = '/api/customers/' + id;
    const after = () => render();
    // 导出离线分享 HTML（服务端渲染单文件，浏览器直接下载）
    $('#ce-export').onclick = () => {
      const a = document.createElement('a');
      a.href = `/api/export/customer/${id}`;
      a.download = '';
      document.body.appendChild(a); a.click(); a.remove();
      toast('已开始下载，可直接发送给对方');
    };
    ['name', 'contact_name', 'contact_phone', 'sales', 'owner', 'level', 'type', 'region', 'status'].forEach(f => {
      bindEdit($('#drawer-body'), U, f, null, after);
    });

    // ── 客户跟进记录（多角色时间线，含 30 天唤醒"已处理"记录）──
    const FU_C = { 无进展: '', 推进中: 'y', 有突破: 'b', 已闭环: 'g' };
    async function loadFu() {
      const fr = await get(`/api/followups?type=customer&id=${id}`);
      const fr2 = await get(`/api/followups?type=stale_dismiss&id=${id}`).catch(() => ({ ok: false }));
      const list = [].concat(fr.ok ? (fr.list || []) : [], fr2.ok ? (fr2.list || []) : []);
      list.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      $('#c-fu').innerHTML = list.length ? list.map(f => `
        <div class="fu-bub">
          <div class="fu-head">
            <b style="color:var(--accent2);font-size:12px">${esc(f.author || OWNER())}</b>
            ${f.result ? `<span class="tag ${FU_C[f.result] || ''}">${esc(f.result)}</span>` : ''}
            ${f.ref_type === 'stale_dismiss' ? '<span class="tag a" title="30 天未联系唤醒任务收口">🔔 唤醒收口</span>' : ''}
            <span class="muted" style="margin-left:auto;font-size:10.5px">${fmtDate(f.created_at, true)}</span>
          </div>
          <div class="fu-tx">${esc(f.content)}</div>
        </div>`).join('') : '<div class="muted" style="font-size:12px;padding:4px 0">暂无客户级跟进 — 业务负责人或链接接收者的回复会记录在这里</div>';
    }
    loadFu();
    $('#fu-cust-add').onclick = async () => {
      const content = $('#fu-cust-in').value.trim();
      if (!content) return toast('先写一句内容');
      const r = await post('/api/followups', { ref_type: 'customer', ref_id: id, content, result: $('#fu-cust-res').value, author: OWNER() });
      if (!r.ok) return;
      $('#fu-cust-in').value = ''; $('#fu-cust-res').value = '';
      toast('已记录'); loadFu(); App.route();
    };

    $('#c-calls').innerHTML = r.calls.length ? r.calls.map(x => `
      <div class="callrow" data-call="${x.id}">
        <div class="idx num">${String(x.duration_sec ? Math.floor(x.duration_sec / 60) + '′' : '·')}</div>
        <div class="body">
          <div class="t1"><span class="nm">${esc(x.title || '未命名通话')}</span>
            ${x.visit_type ? `<span class="tag">${esc(x.visit_type)}</span>` : ''}
            ${x.sentiment ? `<span class="tag ${x.sentiment === '积极' ? 'g' : x.sentiment === '消极' ? 'r' : ''}">${esc(x.sentiment)}</span>` : ''}</div>
          <div class="sm">${esc(x.summary || '（无摘要）')}</div>
        </div>
        <div class="side"><span class="muted" style="font-size:11px">${fmtDate(x.visited_at)}</span></div>
      </div>`).join('') : '<div class="empty" style="padding:16px">还没有通话记录</div>';
    $$('#c-calls [data-call]').forEach(el => el.onclick = () => Call.open(el.dataset.call, c.id));

    const t = (r.todos || []).filter(x => x.status === 'open');
    $('#c-todos').innerHTML = t.length ? t.map(x => `
      <div class="todo" data-id="${x.id}">
        <button class="chk" data-act="t">✓</button>
        <div class="grow"><div class="tx">${esc(x.content)}</div>
          <div class="muted" style="font-size:11px;margin-top:3px">${x.due_date ? fmtDate(x.due_date) : '无期限'} · ${esc(x.priority || '中')}
            ${x.fu_n ? `<span class="tag a" style="margin-left:4px">✍ ${x.fu_n}</span>` : ''}</div></div>
        <button class="btn ghost sm" data-act="fu" title="记跟进">✍</button>
      </div>`).join('') : '<div class="empty" style="padding:14px">无待办</div>';
    $$('#c-todos [data-act]').forEach(b => b.onclick = async () => {
      const row = b.closest('.todo'), tid = row.dataset.id;
      if (b.dataset.act === 'fu') {
        const x = t.find(y => y.id === tid);
        if (x && window.Follow) {
          Follow.open({ type: 'todo', id: tid, title: x.content, sub: `${c.name} · 客户档案待办`, keepDrawer: true, onAfter: () => render() });
          return;
        }
      }
      await post(`/api/todos/${tid}`, { field: 'done', value: 1 });
      toast('已完成'); render(); App.route();
    });

    $('#c-hl').innerHTML = (r.highlights || []).length
      ? r.highlights.slice(0, 20).map(h => `<div class="hl" data-id="${h.id}" style="${h.status === 'archived' ? 'opacity:.55' : ''}">
        <div class="imp">${'●'.repeat(Math.max(1, Math.min(5, h.importance || 3)))}</div>
        <div class="tx" style="flex:1 1 auto;min-width:0">${esc(h.content)}<div class="muted" style="font-size:11px;margin-top:3px">${esc(h.kind || '结论')} · ${fmtDate(h.created_at)}
          ${h.status === 'archived' ? '<span class="tag" style="margin-left:4px">✔ 已处理</span>' : (h.fu_n ? `<span class="tag a" style="margin-left:4px">✍ 已跟进 ${h.fu_n}</span>` : '<span class="muted" style="margin-left:4px">○ 未跟进</span>')}</div></div>
        <button class="btn ghost sm" data-act="fu" title="针对这条要点写跟进（已处理的也可持续跟进）" style="flex:0 0 auto">✍</button>
        ${h.status === 'archived' ? `<button class="btn ghost sm" data-act="re" title="恢复为待处理，重新出现在重点事项列表" style="flex:0 0 auto">↩</button>` : ''}
      </div>`).join('')
      : '<div class="empty" style="padding:14px">暂无需点</div>';
    $$('#c-hl [data-act]').forEach(b => b.onclick = async () => {
      const row = b.closest('.hl');
      const h = (r.highlights || []).find(x => x.id === row.dataset.id);
      if (!h) return;
      if (b.dataset.act === 'fu') {
        if (window.Follow) Follow.open({ type: 'highlight', id: h.id, title: h.content, sub: `${c.name} · 要点跟进${h.status === 'archived' ? '（已处理）' : ''}`, keepDrawer: true, onAfter: () => render() });
        return;
      }
      if (b.dataset.act === 're') {
        await post(`/api/highlights/${h.id}`, { field: 'restore', value: 1 });
        toast('已恢复为待处理'); render();
      }
    });
  }

  return { open: (i) => { id = i; render(); } };
})();
