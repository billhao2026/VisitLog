/* 拜访志 · 待办页 + 重点事项页 */
(function () {
  const { $, $$, get, post, del, esc, fmtDate, toast, rel } = App;
  let scope = 'open', status = 'open';

  const SCOPES = [['open', '全部未完成'], ['overdue', '超期'], ['today', '今天到期'], ['week', '本周内'], ['high', '高优先'], ['done', '已完成']];
  const FU_C = { 无进展: '', 推进中: 'y', 有突破: 'b', 已闭环: 'g' };
  const fuLine = (t) => t.fu_last
    ? `<div class="fu-line"><span class="tag ${FU_C[t.fu_last_res] || ''}">✍ ${esc(t.fu_last_res || '跟进')}</span>
        <span>${esc(t.fu_last.length > 46 ? t.fu_last.slice(0, 46) + '…' : t.fu_last)}</span>
        <span class="muted">${rel(t.fu_last_at)}</span></div>` : '';

  App.page('todos', async (v) => {
    // 支持深链：#/todos?scope=overdue|today|week|high|done|open
    const qIdx = location.hash.indexOf('?');
    if (qIdx >= 0) {
      const sp = new URLSearchParams(location.hash.slice(qIdx + 1));
      const sc = sp.get('scope');
      if (sc === 'done') { status = 'done'; scope = 'open'; }
      else if (['open', 'overdue', 'today', 'week', 'high'].includes(sc)) { status = 'open'; scope = sc; }
    }
    v.innerHTML = `
    <div class="page-head">
      <div><div class="eyebrow">Todos</div><h2>待办事项</h2>
        <div class="desc">由通话分析自动生成，也可手工补充（提到公司名会自动建档关联）</div></div>
      <div class="rowflex">
        <input id="nin" placeholder="如：公司名称：XX公司 · 对接人：X经理 · 事项…" style="width:340px">
        <input id="ndue" type="date" style="flex:0 0 140px">
        <button class="btn pri" id="nadd">添加</button>
      </div>
    </div>
    <div class="filters">${SCOPES.map(([k, n]) =>
      `<button class="chip ${(scope === 'open' && status === 'open' ? k === 'open' : (k === 'done' ? status === 'done' : scope === k)) ? 'on' : ''}" data-s="${k}">${n}</button>`).join('')}</div>
    <div class="card"><div id="list"></div></div>`;

    $$('#filters .chip, .filters .chip', v).forEach(b => b.onclick = () => {
      const k = b.dataset.s;
      // 用 hash 触发 route（避免模块变量被 hash 旧值覆盖）
      location.hash = '#/todos?scope=' + k;
    });
    const add = async () => {
      const c = $('#nin', v).value.trim();
      if (!c) return;
      const r = await post('/api/todos', { content: c, due_date: $('#ndue', v).value || null, priority: '中' });
      if (r.ok) {
        $('#nin', v).value = '';
        if (r.link && r.link.customerName) {
          toast(r.link.created ? `已建档「${r.link.customerName}」并关联待办` : `已关联客户「${r.link.customerName}」`);
        } else {
          toast('已添加（未识别到公司名，可在行内绑定客户）');
        }
        App.route();
      }
    };
    $('#nadd', v).onclick = add;
    $('#nin', v).onkeydown = (e) => { if (e.key === 'Enter') add(); };

    const q = status === 'done' ? 'status=done' : `status=open&scope=${scope}`;
    const r = await get('/api/todos?' + q);
    if (!r.ok) return;
    const listAll = r.list || [];
    // 按客户分组
    const groups = { '（未关联客户）': [] };
    for (const t of listAll) {
      const n = t.customer_name || '（未关联客户）';
      (groups[n] = groups[n] || []).push(t);
    }

    $('#list', v).innerHTML = listAll.length ? Object.keys(groups).map(n => {
      const arr = groups[n];
      return `<div style="margin-bottom:6px">
        <div style="font-family:var(--serif);font-size:13px;color:var(--ink2);padding:10px 0 4px;border-bottom:1px solid var(--rule2)">
          ${esc(n)} <span class="muted" style="font-size:11px">· ${arr.length} 项</span></div>
        ${arr.map(t => `
          <div class="todo ${t.status === 'done' ? 'done' : ''}" data-id="${t.id}" data-custname="${esc(n)}">
            <button class="chk" data-act="t">✓</button>
            <div class="grow">
              <div class="tx">${esc(t.content)}</div>
              ${fuLine(t)}
              <div style="font-size:11px;margin-top:3px" class="muted">
                ${t.due_date ? `<span class="tag ${t.overdue ? 'r' : ''}">${fmtDate(t.due_date)}${t.overdue ? ' 超期' : ''}</span>` : '<span class="muted" style="font-size:11px">无期限</span>'}
                <span class="tag ${t.priority === '高' ? 'r' : t.priority === '低' ? '' : 'y'}">${esc(t.priority || '中')}</span>
                ${t.fu_n ? `<span class="tag a">✍ ${t.fu_n}</span>` : ''}
                ${t.call_title ? `<a href="#" data-call="${t.call_id}">源自通话</a>` : '<span class="tag">✍ 手动添加</span>'}
                ${!t.customer_name && !t.call_title ? `<a href="#" data-bind="${t.id}" title="将此待办绑定到客户档案">＋ 绑定客户</a>` : ''}
              </div>
            </div>
            <input type="date" class="d-in" value="${t.due_date || ''}" style="flex:0 0 132px;width:132px">
            <button class="btn ghost sm" data-act="fu" title="记跟进（写进展，替代只改日期）">✍</button>
            <button class="btn ghost sm" data-act="d">✕</button>
          </div>`).join('')}
      </div>`;
    }).join('') : '<div class="empty">这个范围下没有待办</div>';

    $$('#list [data-act]', v).forEach(b => b.onclick = async () => {
      const row = b.closest('.todo'), tid = row.dataset.id;
      const t = listAll.find(x => x.id === tid);
      if (b.dataset.act === 't') await post(`/api/todos/${tid}`, { field: 'done', value: t.status !== 'done' ? 1 : 0 });
      else if (b.dataset.act === 'd') await del(`/api/todos/${tid}`);
      else if (b.dataset.act === 'fu') {
        const dueTxt = t.due_date ? `期限 ${fmtDate(t.due_date)}` : '未定期限';
        const cn = row.dataset.custname || '';
        Follow.open({ type: 'todo', id: tid, title: t.content, sub: `${cn} · ${dueTxt}`, onAfter: () => App.route() });
        return;
      }
      App.route();
    });
    $$('#list .d-in', v).forEach(inp => inp.onchange = async () => {
      const tid = inp.closest('.todo').dataset.id;
      await post(`/api/todos/${tid}`, { field: 'due_date', value: inp.value || null });
      toast('已改期'); App.route();
    });
    $$('#list [data-call]', v).forEach(a => a.onclick = (e) => { e.preventDefault(); Call.open(a.dataset.call); });
    // 行内绑定客户：弹输入框 → 公司名建档/匹配 → 关联
    $$('#list [data-bind]', v).forEach(a => a.onclick = async (e) => {
      e.preventDefault();
      const tid = a.dataset.bind;
      const name = prompt('输入客户/公司名称（将自动建档或匹配已有客户）：');
      if (!name || !name.trim()) return;
      const r = await post(`/api/todos/${tid}`, { field: 'customer_name', value: name.trim() });
      if (r.ok) { toast(r.created ? `已建档「${name.trim()}」并关联` : `已关联「${r.customerName || name.trim()}」`); App.route(); }
    });
  });

  /* 重点事项提炼池 */
  App.page('highlights', async (v) => {
    let archivedMode = false;   // false=待处理（默认） true=已处理归档区
    let kind = '';
    let cnt = { open_n: 0, archived_n: 0 };
    let list = [];

    async function load() {
      const r = await get('/api/highlights' + (archivedMode ? '?archived=1' : ''));
      if (!r.ok) return false;
      list = r.list || [];
      cnt = r.cnt || cnt;
      return true;
    }

    const PRESET = ['结论', '承诺', '风险', '需求', '决策', '异议', '机会', '事实', '待办'];
    // 类型排序：行动类在前（需要你去做/去跟），信息类在后（已确认的沉淀）
    const KIND_ORDER = { '风险': 0, '承诺': 1, '待办': 2, '需求': 3, '异议': 4, '机会': 5, '决策': 6, '结论': 7, '事实': 8 };

    function draw() {
      const arr = kind ? list.filter(h => (h.kind || '结论') === kind) : list;
      const pinned = arr.filter(h => h.pinned);
      const rest = arr.filter(h => !h.pinned);
      const card = (h) => `
        <div class="card c4 ${h.status === 'archived' ? 'hl-arch' : ''}" data-id="${h.id}">
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
            <span class="tag ${h.kind === '风险' ? 'r' : h.kind === '承诺' ? 'y' : h.kind === '决策' ? 'g' : 'b'}">${esc(h.kind || '结论')}</span>
            <span class="num muted" style="font-size:11px">${'●'.repeat(Math.max(1, Math.min(5, h.importance || 3)))}</span>
            <span class="grow"></span>
            ${h.status === 'archived' ? '<span class="tag">✔ 已处理</span>' : (h.pinned ? '<span class="tag a">置顶</span>' : '')}
          </div>
          <div style="font-size:13.5px;line-height:1.7">${esc(h.content)}</div>
          <div style="font-size:11px;margin-top:10px" class="muted">
            ${h.customer_name ? `<a href="#" data-cust="${h.customer_id}">${esc(h.customer_name)}</a> · ` : ''}
            ${fmtDate(h.visited_at || h.created_at)}
            ${h.status === 'archived' && h.archived_at ? ` · 处理于 ${fmtDate(h.archived_at)}` : ''}
            ${h.category_name ? ` · <span class="tag">${esc(h.category_name)}</span>` : ''}
            ${h.source === 'manual' ? ' · <span class="tag a">✍ 手动</span>' : ''}
          </div>
          <div class="hl-fu">
            ${h.fu_n
              ? `<span class="tag a">✍ 已跟进 ${h.fu_n}</span>
                 ${h.fu_last_res ? `<span class="tag ${FU_C[h.fu_last_res] || ''}">${esc(h.fu_last_res)}</span>` : ''}
                 <span class="muted" style="font-size:10.5px">最近 ${rel(h.fu_last_at)}${h.fu_last ? ' · ' + esc(h.fu_last.length > 16 ? h.fu_last.slice(0, 16) + '…' : h.fu_last) : ''}</span>`
              : `<span class="muted" style="font-size:10.5px">○ 尚未跟进</span>`}
          </div>
          <div style="margin-top:8px;display:flex;gap:4px">
            <button class="btn ghost sm" data-act="fu">✍ 跟进</button>
            ${archivedMode
              ? `<button class="btn ghost sm" data-act="restore">↩ 恢复待处理</button>
                 <button class="btn ghost sm" data-act="del" title="彻底删除（含跟进记录，不可恢复）">🗑 彻底删除</button>`
              : `<button class="btn ghost sm" data-act="pin">${h.pinned ? '取消置顶' : '置顶'}</button>
                 <button class="btn ghost sm" data-act="arch" title="标记为已处理：保留在客户页面，仅从本列表隐藏">✔ 已处理</button>`}
          </div>
        </div>`;
      $('#hlb', v).innerHTML = arr.length
        ? [...pinned.map(card), ...rest.map(card)].join('')
        : `<div class="card c12"><div class="empty">${archivedMode ? '已处理区还没有内容，去待处理列表归档几条试试' : '还没有重点事项，先去上传一通录音'}</div></div>`;
      $$('#hlb [data-act]', v).forEach(b => b.onclick = async () => {
        const id = b.closest('.card').dataset.id;
        const h = list.find(x => x.id === id);
        if (b.dataset.act === 'arch') await post(`/api/highlights/${id}`, { field: 'archive', value: 1 });
        else if (b.dataset.act === 'restore') await post(`/api/highlights/${id}`, { field: 'restore', value: 1 });
        else if (b.dataset.act === 'del') {
          if (!confirm('彻底删除该重点事项及其全部跟进记录？\n删除后客户页面也不可找回，建议改用「已处理」归档。')) return;
          await del(`/api/highlights/${id}`);
        }
        else if (b.dataset.act === 'pin') await post(`/api/highlights/${id}`, { field: 'pinned', value: h.pinned ? 0 : 1 });
        else if (b.dataset.act === 'fu') {
          Follow.open({ type: 'highlight', id, title: h.content, sub: `${h.kind || '结论'} · ${h.customer_name || ''}${h.status === 'archived' ? ' · 已处理' : ''}`, onAfter: () => load().then(() => { drawChips(); draw(); }) });
          return;
        }
        await load(); drawChips(); draw();
      });
      $$('#hlb [data-cust]', v).forEach(a => a.onclick = (e) => { e.preventDefault(); Cust.open(a.dataset.cust); });
    }

    function drawChips() {
      // 类型筛选 chips：常见类型 + 当前数据里实际出现的其他类型（按行动类在前排序）
      const actual = Array.from(new Set(list.map(h => h.kind || '结论')));
      const kinds = ['', ...PRESET.filter(k => actual.includes(k)), ...actual.filter(k => !PRESET.includes(k))];
      $('#kf', v).innerHTML = kinds.map(k => {
        const n = k === '' ? list.length : list.filter(h => (h.kind || '结论') === k).length;
        return `<button class="chip ${kind === k ? 'on' : ''}" data-k="${esc(k)}">${k || '全部'}${n ? ` <span class="muted" style="font-size:10px">${n}</span>` : ''}</button>`;
      }).join('') + `
        <span style="flex:1 1 auto"></span>
        <button class="chip ${archivedMode ? 'on' : ''}" data-mode="1" title="查看已标记处理的重点事项（节点保留在客户页面）">
          ✔ 已处理${cnt.archived_n ? ` <span class="muted" style="font-size:10px">${cnt.archived_n}</span>` : ''}</button>
        ${archivedMode ? `<button class="chip" data-mode="0">← 返回待处理</button>` : ''}`;
      $$('#kf .chip', v).forEach(b => b.onclick = async () => {
        if (b.dataset.mode !== undefined) {
          archivedMode = b.dataset.mode === '1';
          kind = '';
          await load();
          drawDesc(); drawChips(); draw();
          return;
        }
        kind = b.dataset.k;
        $$('#kf .chip', v).forEach(x => x.classList.remove('on'));
        b.classList.add('on');
        draw();
      });
    }

    if (!await load()) return;
    v.innerHTML = `
    <div class="page-head">
      <div><div class="eyebrow">Highlights</div><h2>重点事项</h2>
        <div class="desc" id="hl-desc"></div></div>
    </div>
    <div class="filters" id="kf"></div>
    <div class="bento" id="hlb"></div>`;
    const drawDesc = () => {
      const el = $('#hl-desc', v);
      if (el) el.innerHTML = `${archivedMode ? '已处理归档区：节点保留，可在客户页继续跟进' : '跨通话沉淀的关键信息'} · 待处理 ${cnt.open_n || 0} 条 / 已处理 ${cnt.archived_n || 0} 条`;
    };
    drawDesc();
    drawChips();
    draw();
  });
})();
