/* 拜访志 · 可复用区块：待办 / 要点 */
window.Blocks = (function () {
  const { $, $$, get, post, del, esc, toast, fmtDate, rel, closeDrawer } = App;

  function prio(p) { return p === '高' ? 'r' : p === '低' ? '' : 'y'; }
  const FU_C = { 无进展: '', 推进中: 'y', 有突破: 'b', 已闭环: 'g' };
  function fuLine(t) {
    if (!t.fu_last) return '';
    return `<div class="fu-line"><span class="tag ${FU_C[t.fu_last_res] || ''}">✍ ${esc(t.fu_last_res || '跟进')}</span>
      <span>${esc(t.fu_last.length > 40 ? t.fu_last.slice(0, 40) + '…' : t.fu_last)}</span>
      <span class="muted">${rel(t.fu_last_at)}</span></div>`;
  }

  async function todos(callId, custId, box, onAfter) {
    const r = await get(`/api/todos?status=all`);
    const list = (r.list || []).filter(t => t.call_id === callId);
    const draw = () => {
      box.innerHTML = list.length ? list.map(t => `
        <div class="todo ${t.status === 'done' ? 'done' : ''}" data-id="${t.id}">
          <button class="chk" data-act="toggle">✓</button>
          <div class="grow">
            <div class="tx">${esc(t.content)}</div>
            ${fuLine(t)}
            <div class="meta muted" style="font-size:11px;margin-top:3px">
              ${t.due_date ? `<span class="tag ${t.overdue ? 'r' : ''}">${fmtDate(t.due_date)}${t.overdue ? ' 超期' : ''}</span>` : '<span class="muted">无期限</span>'}
              <span class="tag ${prio(t.priority)}">${esc(t.priority || '中')}</span>
              ${t.fu_n ? `<span class="tag a">✍ ${t.fu_n}</span>` : ''}
            </div>
          </div>
          <button class="btn ghost sm" data-act="fu" title="记跟进">✍</button>
          <button class="btn ghost sm" data-act="del">✕</button>
        </div>`).join('') : '<div class="empty" style="padding:18px">暂无待办</div>';
      $$('[data-act]', box).forEach(b => b.onclick = async () => {
        const row = b.closest('.todo'), id = row.dataset.id;
        if (b.dataset.act === 'toggle') {
          const t = list.find(x => x.id === id);
          await post(`/api/todos/${id}`, { field: 'done', value: t.status !== 'done' ? 1 : 0 });
        } else if (b.dataset.act === 'del') {
          await del(`/api/todos/${id}`);
        } else if (b.dataset.act === 'fu') {
          const t = list.find(x => x.id === id);
          Follow.open({ type: 'todo', id, title: t.content, sub: '待办跟进', keepDrawer: true, onAfter });
          return;
        }
        toast('已更新'); onAfter && onAfter();
      });
    };
    draw();
    const add = $('#todo-add', box.parentNode);
    if (add) add.onclick = async () => {
      const c = $('#todo-in', box.parentNode).value.trim();
      if (!c) return;
      const due = $('#todo-due', box.parentNode).value;
      await post('/api/todos', { content: c, call_id: callId, customer_id: custId, due_date: due || null, priority: '中' });
      $('#todo-in', box.parentNode).value = '';
      toast('已添加'); onAfter && onAfter();
    };
  }

  async function highlights(callId, custId, box, onAfter) {
    // 全量拉取（含已处理）：通话详情里的要点是"这通电话说了什么"的留痕，归档后仍应可见
    const r = await get('/api/highlights?archived=all');
    const list = (r.list || []).filter(h => h.call_id === callId);
    box.innerHTML = list.length ? list.map(h => `
      <div class="hl" data-id="${h.id}" style="${h.status === 'archived' ? 'opacity:.55' : ''}">
        <div class="imp">${'●'.repeat(Math.max(1, Math.min(5, h.importance || 3)))}</div>
        <div class="tx">
          <div>${esc(h.content)}</div>
          <div style="font-size:11px;margin-top:3px" class="muted">
            <span class="tag">${esc(h.kind || '结论')}</span>
            ${h.category_name ? `<span class="tag b">${esc(h.category_name)}</span>` : ''}
            ${h.status === 'archived' ? '<span class="tag">✔ 已处理</span>' : (h.pinned ? '<span class="tag a">置顶</span>' : '')}
            ${h.fu_n ? `<span class="tag a">✍ ${h.fu_n}</span>` : ''}
          </div>
        </div>
        <div style="flex:0 0 auto;display:flex;gap:2px">
          <button class="btn ghost sm" data-act="fu" title="记跟进（已处理的也可持续跟进）">✍</button>
          ${h.status === 'archived'
            ? `<button class="btn ghost sm" data-act="re" title="恢复为待处理">↩</button>`
            : `<button class="btn ghost sm" data-act="pin">${h.pinned ? '取消置顶' : '置顶'}</button>
               <button class="btn ghost sm" data-act="arch" title="标记已处理：保留节点，仅从重点事项列表隐藏">✔</button>`}
        </div>
      </div>`).join('') : '<div class="empty" style="padding:18px">暂无要点</div>';
    $$('[data-act]', box).forEach(b => b.onclick = async () => {
      const row = b.closest('.hl'), id = row.dataset.id;
      const h = list.find(x => x.id === id);
      if (b.dataset.act === 'arch') await post(`/api/highlights/${id}`, { field: 'archive', value: 1 });
      else if (b.dataset.act === 're') await post(`/api/highlights/${id}`, { field: 'restore', value: 1 });
      else if (b.dataset.act === 'fu') {
        Follow.open({ type: 'highlight', id, title: h.content, sub: '重点事项跟进' + (h.status === 'archived' ? '（已处理）' : ''), keepDrawer: true, onAfter });
        return;
      } else {
        await post(`/api/highlights/${id}`, { field: 'pinned', value: h.pinned ? 0 : 1 });
      }
      toast('已更新'); onAfter && onAfter();
    });
    const add = $('#hl-add', box.parentNode);
    if (add) add.onclick = async () => {
      const c = $('#hl-in', box.parentNode).value.trim();
      if (!c) return;
      await post('/api/highlights', { content: c, call_id: callId, customer_id: custId, kind: '结论', importance: 3 });
      $('#hl-in', box.parentNode).value = '';
      toast('已添加'); onAfter && onAfter();
    };
  }

  return { todos, highlights };
})();
