/* 拜访志 · 跟进板块：超 30 天未联系客户唤醒清单 */
(function () {
  const { $, $$, get, post, esc, toast, fmtDate, rel, drawer, closeDrawer } = App;

  let tierFilter = '';        // '' | A | B | C
  let salesFilter = '';       // '' | 业务员名
  let dismissedMode = false;  // 已处理视图

  const PRI_C = { 高: 'r', 中: 'y', 低: '' };
  const TIER_C = { A: 'r', B: 'y', C: '' };
  const FU_C = { 无进展: '', 推进中: 'y', 有突破: 'b', 已闭环: 'g' };

  App.page('followups', async (v) => {
    const r = await get('/api/followups/board');
    if (!r.ok) return;
    const list = r.list || [];
    const sum = r.sum || {};

    const salesArr = Array.from(new Set(list.map(x => x.sales || '').filter(Boolean))).sort();

    v.innerHTML = `
    <div class="page-head">
      <div><div class="eyebrow">Follow-ups</div><h2>跟进 · 30 天未联系唤醒</h2>
        <div class="desc">${sum.total} 家客户超 ${r.days} 天未联系 · A 商机在手 ${sum.A} / B 历史成交 ${sum.B} / C 线索沉睡 ${sum.C} · 30 天内已收口 ${sum.dismissed_30d} 家</div></div>
      <div class="rowflex">
        <button class="btn" id="fu-refresh">刷新</button>
      </div>
    </div>

    <div class="bento start" style="margin-bottom:14px">
      <div class="card c3"><div class="stat ${sum.A ? 'hot' : ''}"><div class="big">${sum.A}</div><div class="lb">🎯 商机在手</div>
        <div class="ft">有挂起待办/跟进中事项 · 电话优先 · ${sum.high} 家高优先</div></div></div>
      <div class="card c3"><div class="stat"><div class="big">${sum.B}</div><div class="lb">💰 历史成交</div>
        <div class="ft">有合作沉淀 · 耗材复购周期做由头回访</div></div></div>
      <div class="card c3"><div class="stat"><div class="big">${sum.C}</div><div class="lb">💤 线索沉睡</div>
        <div class="ft">仅建档无通话 · 微信轻触达即可</div></div></div>
      <div class="card c3"><div class="stat"><div class="big">${sum.dismissed_30d}</div><div class="lb">✔ 30 天内已收口</div>
        <div class="ft">唤醒任务完成的客户（写入其档案）</div></div></div>
    </div>

    <div class="filters" id="ff-chips">
      <button class="chip ${!tierFilter && !dismissedMode ? 'on' : ''}" data-t="">全部 ${sum.total}</button>
      <button class="chip ${tierFilter === 'A' ? 'on' : ''}" data-t="A">🎯 商机在手 ${sum.A}</button>
      <button class="chip ${tierFilter === 'B' ? 'on' : ''}" data-t="B">💰 历史成交 ${sum.B}</button>
      <button class="chip ${tierFilter === 'C' ? 'on' : ''}" data-t="C">💤 线索沉睡 ${sum.C}</button>
      ${salesArr.length > 1 ? `<span style="width:1px;background:var(--rule2);margin:0 4px"></span>
        <button class="chip ${salesFilter ? 'on' : ''}" data-sales="*">按业务员${salesFilter ? '：' + esc(salesFilter) : ''}</button>` : ''}
      <span style="flex:1 1 auto"></span>
      <button class="chip ${dismissedMode ? 'on' : ''}" data-mode="1">✔ 已处理 ${sum.dismissed_30d}</button>
    </div>

    <div class="card"><div id="fu-list"></div></div>`;

    $('#fu-refresh', v).onclick = () => App.route();

    $$('#ff-chips .chip', v).forEach(b => b.onclick = () => {
      if (b.dataset.mode) { dismissedMode = b.dataset.mode === '1'; tierFilter = ''; App.route(); return; }
      if (b.dataset.sales !== undefined) {
        const i = salesArr.indexOf(salesFilter) + 1;
        salesFilter = salesArr[i % (salesArr.length + 1)] || '';
        tierFilter = ''; dismissedMode = false; App.route(); return;
      }
      tierFilter = b.dataset.t; dismissedMode = false; App.route();
    });

    const box = $('#fu-list', v);

    if (dismissedMode) {
      const d = r.dismissed || [];
      box.innerHTML = d.length ? d.map(x => `
        <div class="todo">
          <span class="tag g">✔ 已处理</span>
          <div class="grow">
            <div class="tx"><a href="#" data-cust="${x.customer_id}">${esc(x.customer_name || '（已删除客户）')}</a></div>
            <div class="fu-line"><span>${esc(x.note)}</span></div>
          </div>
          <span class="muted" style="flex:0 0 auto;font-size:11px">${fmtDate(x.dismissed_at, true)}</span>
        </div>`).join('') : '<div class="empty">还没有已处理的唤醒任务</div>';
      $$('#fu-list [data-cust]', v).forEach(a => a.onclick = (e) => { e.preventDefault(); Cust.open(a.dataset.cust); });
      return;
    }

    const arr = list.filter(x => (!tierFilter || x.tier === tierFilter) && (!salesFilter || x.sales === salesFilter));

    box.innerHTML = arr.length ? arr.map(x => `
      <div class="fu-row" data-id="${x.id}">
        <div class="fu-pri ${PRI_C[x.priority] || ''}" title="优先级：${x.priority}">
          <b>${x.priority}</b>
        </div>
        <div class="grow">
          <div class="fu-name">
            <a href="#" data-cust="${x.id}"><b>${esc(x.name)}</b></a>
            <span class="tag ${TIER_C[x.tier]}">${x.tier} · ${esc(x.tier_name)}</span>
            ${x.open_todos ? `<span class="tag r" title="未完成待办">${x.open_todos} 项挂起</span>` : ''}
            ${x.sales ? `<span class="muted" style="font-size:11px">业务员 ${esc(x.sales)}</span>` : ''}
            ${x.contact_name || x.contact_phone ? `<span class="muted" style="font-size:11px">${esc(x.contact_name || '')} ${esc(x.contact_phone || '')}</span>` : ''}
          </div>
          ${x.pending_items ? `
          <div class="fu-pending">
            <div class="fu-pt"><span class="tag r">🔴 上次事项进展确认</span><span class="muted" style="font-size:11px">接电话第一句就用</span></div>
            <div class="fu-ptx">${esc(x.pending_items)}</div>
          </div>` : ''}
          ${x.talk && x.talk.length ? `
          <div class="fu-talk">
            <div class="fu-pt"><span class="tag y">📞 重点聊什么</span><span class="muted" style="font-size:11px">照着这个打</span></div>
            <ol class="fu-ol">${x.talk.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
          </div>` : ''}
          <div class="fu-suggest">
            <span class="tag ${x.priority === '高' ? 'r' : 'y'}" title="建议在此时限前完成首次重新联系">⏱ 建议 ${fmtDate(x.suggest_due)} 前</span>
            <span class="muted">方式：${esc(x.method)}</span>
            <span class="muted">· ${esc(x.reason)}</span>
          </div>
          ${x.last_fu ? `<div class="fu-line"><span class="tag ${FU_C[x.last_fu_res] || ''}">✍ ${esc(x.last_fu_res || '跟进')}</span>
            <span>${esc(x.last_fu.length > 60 ? x.last_fu.slice(0, 60) + '…' : x.last_fu)}</span>
            <span class="muted">${rel(x.last_fu_at)}</span></div>` : ''}
        </div>
        <div class="fu-side">
          <div class="muted" style="font-size:11px;text-align:right">
            最近联系 ${fmtDate(x.last_visit_at)}<br>
            <span class="tag ${x.stale_months >= 2 ? 'r' : 'y'}">失联 ${x.days_stale} 天 / 约 ${x.stale_months} 个月</span>
          </div>
          <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:6px">
            <button class="btn sm" data-act="edit" title="编辑这家的话术聊点（上次事项确认 + 重点聊123）">✎ 话术</button>
            <button class="btn sm pri" data-act="fu">✍ 写跟进</button>
            <button class="btn sm" data-act="dismiss" title="标记这家唤醒任务已处理（写入客户档案）">✔ 已处理</button>
          </div>
        </div>
      </div>`).join('') : '<div class="empty">这个筛选下没有待唤醒客户</div>';

    $$('#fu-list [data-cust]', v).forEach(a => a.onclick = (e) => { e.preventDefault(); Cust.open(a.dataset.cust); });

    $$('#fu-list [data-act]', v).forEach(b => b.onclick = () => {
      const row = b.closest('.fu-row');
      const x = arr.find(y => y.id === row.dataset.id);
      if (b.dataset.act === 'fu') {
        Follow.open({
          type: 'customer', id: x.id,
          title: x.name,
          sub: `${x.tier} · ${x.tier_name} · 失联 ${x.days_stale} 天 · 建议 ${fmtDate(x.suggest_due)} 前用${x.method}联系`,
          onAfter: () => App.route(),
        });
        return;
      }
      if (b.dataset.act === 'edit') {
        editTalk(x);
        return;
      }
      // 已处理：弹确认（可选填一句说明）
      const note = prompt(
        `标记「${x.name}」30 天唤醒任务已处理？\n可填一句联系结果（留空则默认"已联系"）：\n如：电话已通，约了周四上门`,
        ''
      );
      if (note === null) return;
      (async () => {
        const rr = await post('/api/followups/board/dismiss', { customer_id: x.id, note });
        if (rr.ok) { toast('已收口，记录已写入客户档案'); App.route(); }
      })();
    });

    // 话术编辑抽屉：上次事项确认 + 重点聊123
    function editTalk(x) {
      drawer(`
        <div class="eyebrow">Talk Points</div>
        <h2 style="font-size:20px">${esc(x.name)} · 话术聊点</h2>
        <div class="muted" style="font-size:12px;margin-top:4px">${x.tier} · ${esc(x.tier_name)} · 联系人 ${esc(x.contact_name || '—')} ${esc(x.contact_phone || '')}</div>

        <div class="card" style="margin-top:16px;background:var(--paper2)">
          <h3 style="margin-bottom:8px">🔴 上次事项进展确认 <span class="muted" style="font-weight:400;font-size:11px">接电话第一句就用</span></h3>
          <textarea id="tp-pending" rows="3" style="width:100%" placeholder="遗留线头：上次答应的/聊到一半的/等对方回复的…">${esc(x.pending_items || '')}</textarea>
        </div>

        <div class="card" style="margin-top:12px;background:var(--paper2)">
          <h3 style="margin-bottom:8px">📞 重点聊什么 ①②③ <span class="muted" style="font-weight:400;font-size:11px">照着这个打</span></h3>
          <input id="tp-t1" style="width:100%;margin-bottom:8px" placeholder="聊点 ①（最重要）" value="${esc((x.talk || [])[0] || '')}">
          <input id="tp-t2" style="width:100%;margin-bottom:8px" placeholder="聊点 ②" value="${esc((x.talk || [])[1] || '')}">
          <input id="tp-t3" style="width:100%" placeholder="聊点 ③" value="${esc((x.talk || [])[2] || '')}">
        </div>

        <div class="rowflex" style="margin-top:14px;justify-content:flex-end">
          <button class="btn" data-close>取消</button>
          <button class="btn pri" id="tp-save">保存话术</button>
        </div>`);

      $('#tp-save').onclick = async () => {
        const r = await post('/api/followups/board/talkpoint', {
          customer_id: x.id,
          pending_items: $('#tp-pending').value.trim(),
          talk: [$('#tp-t1').value.trim(), $('#tp-t2').value.trim(), $('#tp-t3').value.trim()],
        });
        if (r.ok) { toast('话术已保存'); closeDrawer(); App.route(); }
      };
    }
  });
})();
