/* 拜访志 · 编写式跟进抽屉：待办/重点共用 */
window.Follow = (function () {
  const { $, $$, get, post, esc, toast, fmtDate, rel, drawer } = App;

  const RESULTS = ['无进展', '推进中', '有突破', '已闭环'];
  const COLOR = { 无进展: '', 推进中: 'y', 有突破: 'b', 已闭环: 'g' };

  let cur = null; // {type,id,title,sub,onAfter}

  function html(fu) {
    return `<div class="fu-bub">
      <div class="fu-head">
        ${fu.result ? `<span class="tag ${COLOR[fu.result] || ''}">${esc(fu.result)}</span>` : ''}
        <span class="muted" style="font-size:11px;margin-left:auto">${fmtDate(fu.created_at, true)} · ${rel(fu.created_at)}</span>
      </div>
      <div class="fu-tx">${esc(fu.content)}</div>
      ${fu.due_date ? `<div class="muted" style="font-size:11px;margin-top:4px">顺延至 <span class="tag">${fmtDate(fu.due_date)}</span> 跟进</div>` : ''}
    </div>`;
  }

  async function draw() {
    const b = $('#fu-list');
    if (!b) return;
    const r = await get(`/api/followups?type=${cur.type}&id=${encodeURIComponent(cur.id)}`);
    const list = r.ok ? (r.list || []) : [];
    const cnt = $('#fu-cnt'); if (cnt) cnt.textContent = list.length;
    b.innerHTML = list.length
      ? list.map(html).join('')
      : '<div class="empty" style="padding:26px">还没有跟进记录 — 每次电话/微信联系后，把「进展到哪一步」写下来，替代只打勾</div>';
  }

  function open(o) {
    cur = o;
    const isTodo = o.type === 'todo';
    drawer(`
      <div class="eyebrow">Follow-up · ${isTodo ? '待办跟进' : '重点跟进'}</div>
      <h2 style="font-size:20px;line-height:1.45">${esc(o.title)}</h2>
      ${o.sub ? `<div class="muted" style="font-size:12px;margin-top:4px">${esc(o.sub)}</div>` : ''}

      <h3 style="font-size:13px;margin:20px 0 8px">跟进记录 <span class="muted" style="font-weight:400">共 <b id="fu-cnt">0</b> 条</span></h3>
      <div id="fu-list"></div>

      <div class="card" style="margin-top:16px;background:var(--paper2);border-style:dashed">
        <h3 style="margin-bottom:8px">✍ 记一次跟进</h3>
        <textarea id="fu-in" rows="3" placeholder="${isTodo ? '这次联系了什么、对方怎么答复、进展到哪一步？' : '这条要点的最新状态如何？'}"></textarea>
        <div style="margin:9px 0 2px;font-size:11.5px" class="muted">结果档位（选「已闭环」即完成${isTodo ? '待办' : ''}）</div>
        <div class="filters" style="margin-bottom:4px" id="fu-res">
          ${RESULTS.map(r => `<button class="chip" data-r="${r}">${r}</button>`).join('')}
        </div>
        <div class="rowflex" style="gap:8px;margin-top:8px;align-items:flex-end">
          ${isTodo ? `<div style="flex:0 0 150px"><label class="muted" style="font-size:11px">如改期：新跟进日</label><input id="fu-due" type="date"></div>` : ''}
          <span class="grow"></span>
          <button class="btn pri" id="fu-save">保存跟进</button>
        </div>
      </div>`);

    let res = '';
    $$('#fu-res .chip').forEach(b => b.onclick = () => {
      res = b.dataset.r;
      $$('#fu-res .chip').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
    });
    $('#fu-save').onclick = async () => {
      const content = $('#fu-in').value.trim();
      const closed = res === '已闭环';
      if (!content && !closed) return toast('写一句进展，或至少选个结果');
      const r = await post('/api/followups', {
        ref_type: cur.type, ref_id: cur.id, content, result: res,
        due_date: ($('#fu-due') ? $('#fu-due').value : '') || null, closed,
      });
      if (!r.ok) return;
      toast(closed ? '已闭环 🎉' : '跟进已记录');
      if (closed) {
        if (!cur.keepDrawer && cur.onAfter) App.closeDrawer();
        if (cur.onAfter) cur.onAfter();
        return;
      }
      $('#fu-in').value = ''; res = '';
      $$('#fu-res .chip').forEach(x => x.classList.remove('on'));
      draw();
      if (cur.onAfter) cur.onAfter();
    };
    draw();
  }

  return { open, RESULTS };
})();
