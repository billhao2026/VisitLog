/* 拜访志 · 通话详情抽屉 */
window.Call = (function () {
  const { $, $$, get, post, del, esc, toast, fmtDate, fmtDur, drawer, closeDrawer, bindEdit, rel } = App;
  let id = null, data = null, cats = [];
  let fromCust = null;   // 从客户档案进入时记录客户 id，用于「返回客户档案」

  async function render() {
    const r = await get('/api/calls/' + id);
    if (!r.ok) return;
    data = r;
    const c = r.call;
    const st = c.transcribe_status === 'pending' ? ['待转写', '']
      : c.transcribe_status === 'transcribing' ? ['转写中', 'a']
      : c.transcribe_status === 'error' ? ['转写失败', 'r']
      : c.analyze_status === 'done' ? ['已分析', 'g']
      : c.analyze_status === 'error' ? ['分析失败', 'r'] : ['待分析', 'y'];

    drawer(`
    ${fromCust ? `<div class="rowflex" style="justify-content:flex-end;margin-bottom:8px">
      <button class="btn sm" id="back-cust" title="返回到该客户的档案（含摘要与重点事项）">← 返回客户档案</button>
    </div>` : ''}
    <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:6px">
      <div class="grow">
        <div class="eyebrow">${esc(c.visit_type || '通话')} · ${fmtDate(c.visited_at, true)} · ${fmtDur(c.duration_sec)}</div>
        <h2 style="font-size:22px" class="ed" id="e-title" data-raw="${esc(c.title || '')}">${esc(c.title || '（未命名）')}</h2>
      </div>
      <span class="tag ${st[1]}">${st[0]}</span>
    </div>

    <div class="rowflex" style="margin-bottom:14px">
      <span class="muted" style="font-size:12px">客户</span>
      <span class="ed" id="e-cust" data-raw="${esc(c.customer ? c.customer.name : '')}" style="font-weight:600">${esc(c.customer ? c.customer.name : '＋ 点击填写')}</span>
      <span class="grow"></span>
      <button class="btn sm" id="btn-retry">重跑转写</button>
      <button class="btn sm" id="btn-prompt">复制分析指令</button>
    </div>

    ${c.audio_path && !c.audio_deleted ? `<audio controls src="/${esc(c.audio_path)}" style="width:100%;margin-bottom:14px"></audio>` : ''}
    ${c.audio_deleted ? `<div class="muted" style="font-size:11px;margin-bottom:10px">原始录音已按保留策略清理（转写稿与结论完整保留）</div>` : ''}
    ${c.transcribe_err ? `<div class="tag r" style="margin-bottom:12px">${esc(c.transcribe_err)}</div>` : ''}

    ${r.flags && r.flags.length ? `
    <h3 style="font-size:13px;margin:16px 0 6px;color:var(--red)">⚠ 敏感内容预警 <span class="muted" style="font-weight:400;font-size:11px">${
      r.flags.filter(f => !f.handled).length} 条未处理 · 处理即归档</span></h3>
    <div id="flag-box">${r.flags.map(f => `
      <div class="flag-row ${f.handled ? 'off' : ''}" data-fid="${f.id}">
        <div class="fl-main">
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <span class="tag ${f.handled ? '' : 'r'}">${esc(f.word)}</span>
            <span class="tag ${f.handled ? '' : 'y'}">${esc(f.tag || '敏感')}</span>
            ${f.handled ? '<span class="muted" style="font-size:11px">已处理</span>' : ''}
          </div>
          <div class="fl-snp">${esc(f.snippet || '')}</div>
        </div>
        ${f.handled ? '' : `<button class="btn sm" data-act="ok">✓ 已处理</button>`}
      </div>`).join('')}</div>` : ''}

    <h3 style="font-size:13px;margin:16px 0 6px">摘要</h3>
    <div class="ed" id="e-sum" data-wide="1" data-raw="${esc(c.summary || '')}" style="font-size:13.5px;line-height:1.7">${esc(c.summary || '（尚未分析，点击可手写）')}</div>

    <div class="rowflex" style="margin-top:10px;gap:8px">
      <span class="muted" style="font-size:12px">评分</span>
      <span class="ed num" id="e-score" data-raw="${c.quality_score ?? ''}">${c.quality_score || '—'}</span>
      <span class="muted" style="font-size:12px">情绪</span>
      <span class="ed" id="e-senti" data-raw="${esc(c.sentiment || '')}">${esc(c.sentiment || '—')}</span>
      <span class="muted" style="font-size:12px">跟进周期</span>
      <span class="ed" id="e-follow" data-raw="${c.next_followup_days ?? ''}">${c.next_followup_days ? c.next_followup_days + ' 天' : '—'}</span>
    </div>

    <h3 style="font-size:13px;margin:18px 0 6px">问题归类 <span class="muted" style="font-weight:400;font-size:11px">点击标签可改判，改后会自动提议归类规则</span></h3>
    <div id="cat-box" class="rowflex"></div>
    <div id="rule-sug"></div>

    <h3 style="font-size:13px;margin:18px 0 6px">重点事项</h3>
    <div id="hl-box"></div>
    <div class="rowflex" style="margin-top:8px">
      <input id="hl-in" placeholder="补一条要点…" class="grow">
      <button class="btn sm" id="hl-add">添加</button>
    </div>

    <h3 style="font-size:13px;margin:18px 0 6px">待办事项</h3>
    <div id="todo-box"></div>
    <div class="rowflex" style="margin-top:8px">
      <input id="todo-in" placeholder="补一条待办…" class="grow">
      <input id="todo-due" type="date" style="flex:0 0 140px">
      <button class="btn sm" id="todo-add">添加</button>
    </div>

    <h3 style="font-size:13px;margin:18px 0 6px">转写稿
      <span class="muted" style="font-weight:400;font-size:11px">${(c.transcript || '').length} 字 ·
        <a href="#" id="tg-full">展开/折叠</a></span></h3>
    <div class="transcript" id="tg" style="max-height:190px">${esc(c.transcript || '（暂无转写内容）')}</div>

    <div class="divider"></div>
    <div class="muted" style="font-size:11px">
      创建 ${fmtDate(c.created_at, true)} · 更新 ${fmtDate(c.updated_at, true)}
      ${c.audio_name ? ' · ' + esc(c.audio_name) : ''}
    </div>`);

    const after = () => render();
    const U = '/api/calls/' + id;
    // 预警一键处理
    const fb = $('#flag-box');
    if (fb) $$('#flag-box [data-act]', fb).forEach(b => b.onclick = async () => {
      const fid = b.closest('.flag-row').dataset.fid;
      await post('/api/flags/' + fid, { value: 1 });
      toast('已标记处理'); after();
    });
    if (fromCust && $('#back-cust')) $('#back-cust').onclick = () => {
      const cid = fromCust;
      fromCust = null;
      if (window.Cust) Cust.open(cid);
    };
    bindEdit($('#drawer-body'), U, 'title', null, after);
    bindEdit($('#drawer-body'), U, 'summary', null, after);
    bindEdit($('#drawer-body'), U, 'quality_score', (v) => (v === '' ? null : Number(v) || null), after);
    bindEdit($('#drawer-body'), U, 'sentiment', null, after);
    bindEdit($('#drawer-body'), U, 'next_followup_days', (v) => (v === '' ? null : Number(v) || null), after);
    bindEdit($('#drawer-body'), U, 'customer', null, after);

    $('#btn-retry').onclick = async () => {
      if (!window.confirm('将重新转写这段录音（约 1-4 分钟），确定要重跑吗？')) return;
      await post('/api/ai/retry', { call_id: id }); toast('已重新入队'); after();
    };
    $('#btn-prompt').onclick = async () => {
      const p = await get('/api/ai/prompt/' + id);
      if (!p.ok) return;
      try { await navigator.clipboard.writeText(p.prompt); toast('分析指令已复制，粘贴到对话里即可'); }
      catch (e) { window.prompt('复制这段指令：', p.prompt); }
    };
    $('#tg-full').onclick = (e) => {
      e.preventDefault();
      const el = $('#tg');
      el.style.maxHeight = el.style.maxHeight === 'none' ? '190px' : 'none';
    };

    await renderCats();
    await Blocks.highlights(id, c.customer_id, $('#hl-box'), after);
    await Blocks.todos(id, c.customer_id, $('#todo-box'), after);
  }

  async function renderCats() {
    if (!cats.length) cats = (await get('/api/dict')).cats || [];
    const cur = data.call.categories || [];
    $('#cat-box').innerHTML = cur.map(x => {
      const cat = cats.find(k => k.id === x.category_id);
      return `<span class="tag ${x.is_primary ? 'a' : ''}" data-cid="${x.category_id}" style="cursor:pointer" title="${esc(x.reason || '')}">${esc(cat ? cat.name : x.category_id)}${x.is_primary ? ' ★' : ''} ✎</span>`;
    }).join('') + `<select id="cat-sel" style="flex:0 0 190px"><option value="">＋ 添加/改判…</option>${
      cats.map(k => `<option value="${k.id}">${k.parent_id ? '　' : ''}${esc(k.name)}</option>`).join('')}</select>`;

    $('#cat-sel').onchange = async (e) => {
      const nid = e.target.value;
      if (!nid) return;
      const old = cur.length ? cur[0].category_id : '';
      if (old === nid) return;
      const r = await post('/api/ai/correct', { call_id: id, field: 'category', old_value: old, new_value: nid });
      if (!r.ok) return;
      // 立即生效
      const cc = cur.map(x => ({ category_id: x.category_id, is_primary: x.is_primary, confidence: x.confidence, reason: x.reason }));
      const nc = cc.filter(x => x.category_id !== nid);
      nc.unshift({ category_id: nid, is_primary: 1, confidence: 1, reason: '人工改判' });
      await post('/api/ai/analyze', { call_id: id, categories: nc });
      toast('已改判');
      await render();
      showSug(r.suggestions || []);
    };
  }

  function showSug(list) {
    const box = $('#rule-sug');
    if (!box) return;
    if (!list.length) { box.innerHTML = ''; return; }
    box.innerHTML = `<div class="card" style="margin-top:8px;background:var(--accent-soft);border-color:#F0CDB6">
      <div style="font-size:12px;margin-bottom:6px">要不要把它变成自动规则？下次出现同样表述会直接归到这一类。</div>
      ${list.map(s => `<div class="rowflex" style="margin-top:5px">
        <span class="tag">命中「${esc(s.pattern)}」</span><span class="muted" style="font-size:12px">→ ${esc(s.category_name)}</span>
        <span class="grow"></span><button class="btn sm pri" data-p="${esc(s.pattern)}" data-c="${esc(s.category_id)}" data-r="${s.correction_id}">采纳</button>
      </div>`).join('')}</div>`;
    $$('#rule-sug [data-p]').forEach(b => b.onclick = async () => {
      const r = await post('/api/ai/rule', { pattern: b.dataset.p, category_id: b.dataset.c, correction_id: Number(b.dataset.r) });
      if (r.ok) { toast('规则已生效'); box.innerHTML = ''; }
    });
  }

  return { open: (i, from) => { id = i; fromCust = from || null; render(); }, render };
})();
