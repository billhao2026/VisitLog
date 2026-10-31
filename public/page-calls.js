/* 拜访志 · 上传 + 通话列表 */
window.Upload = (function () {
  const { $, $$, post, get, toast, esc, closeDrawer, drawer, fmtDate } = App;

  function panel() {
    return `
    <h2 style="font-size:22px;margin-bottom:4px">上传通话录音</h2>
    <p class="muted" style="font-size:12.5px;margin-bottom:16px">上传后自动转写，转写完成即可分析归类。同一段录音重复上传会被识别并跳过。</p>
    <div class="drop" id="drop">
      <div class="ico">↥</div>
      <div class="t">把录音拖到这里，或点击选择文件</div>
      <div class="d">支持 m4a / mp3 / wav / amr / mp4 等 · 单文件最大 512MB</div>
      <input type="file" id="fi" multiple accept="audio/*,video/*" style="display:none">
    </div>
    <div class="divider"></div>
    <div class="rowflex" style="gap:12px;align-items:flex-end">
      <div style="flex:1 1 160px"><label class="muted" style="font-size:11.5px">客户名称（选填）</label>
        <input id="up-cust" placeholder="留空可稍后补"></div>
      <div style="flex:0 0 110px"><label class="muted" style="font-size:11.5px">方式</label>
        <select id="up-type"><option>电话</option><option>拜访</option><option>会议</option><option>微信语音</option></select></div>
      <div style="flex:0 0 150px"><label class="muted" style="font-size:11.5px">拜访时间</label>
        <input id="up-at" type="datetime-local"></div>
    </div>
    <div id="up-list" style="margin-top:12px"></div>
    <div class="divider"></div>
    <h3 style="font-size:13px;margin-bottom:8px">处理队列</h3>
    <div id="up-queue"></div>`;
  }

  async function send(files) {
    const list = $('#up-list');
    for (const f of files) {
      const row = document.createElement('div');
      row.className = 'qitem';
      row.innerHTML = `<span class="grow">${esc(f.name)}</span><span class="muted">${(f.size / 1048576).toFixed(1)}MB</span><span class="muted dots">上传中</span>`;
      list.appendChild(row);
      const fd = new FormData();
      fd.append('audio', f);
      const c = $('#up-cust').value.trim();
      if (c) fd.append('customer_name', c);
      fd.append('visit_type', $('#up-type').value);
      const at = $('#up-at').value;
      if (at) fd.append('visited_at', at.replace('T', ' '));
      try {
        const r = await fetch('/api/upload', { method: 'POST', body: fd }).then(x => x.json());
        if (r.duplicate) row.innerHTML = `<span class="grow">${esc(f.name)}</span><span class="tag y">已存在</span><a href="#" data-call="${r.id}">查看</a>`;
        else if (r.ok) row.innerHTML = `<span class="grow">${esc(f.name)}</span><span class="tag g">已入队</span><a href="#" data-call="${r.id}">查看</a>`;
        else row.innerHTML = `<span class="grow">${esc(f.name)}</span><span class="tag r">${esc(r.err || '失败')}</span>`;
      } catch (e) {
        row.innerHTML = `<span class="grow">${esc(f.name)}</span><span class="tag r">${esc(e.message)}</span>`;
      }
      $$('#up-list [data-call]').forEach(a => a.onclick = (ev) => { ev.preventDefault(); Call.open(a.dataset.call); });
    }
    if (App.cur === 'calls') App.route();
  }

  async function refreshQueue() {
    const el = $('#up-queue');
    if (!el) return;
    const q = await get('/api/queue');
    if (!q.ok) return;
    el.innerHTML = q.transcribing.length
      ? q.transcribing.map(c => `<div class="qitem"><span class="grow">${esc(c.title || '未命名')}</span><span class="tag a dots">转写中</span></div>`).join('')
      : (q.pendingT || q.pendingA
        ? `<div class="qitem muted">待转写 ${q.pendingT} · 待分析 ${q.pendingA}</div>`
        : '<div class="qitem muted">队列已清空</div>');
  }

  function open() {
    drawer(panel());
    const drop = $('#drop'), fi = $('#fi');
    drop.onclick = () => fi.click();
    fi.onchange = () => { send(Array.from(fi.files)); fi.value = ''; };
    ['dragenter', 'dragover'].forEach(e => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach(e => drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.remove('over'); }));
    drop.addEventListener('drop', (ev) => { send(Array.from(ev.dataTransfer.files)); });
    refreshQueue();
    clearTimeout(open._t);
    const tick = () => { if ($('#drawer').hidden) return; refreshQueue(); open._t = setTimeout(tick, 2500); };
    tick();
  }
  return { open, refreshQueue };
})();

/* ── 通话列表页 ─────────────────────── */
(function () {
  const { $, $$, get, esc, fmtDate, fmtDur } = App;
  let filter = 'all', kw = '';

  const flagChip = (arr) => {
    if (!arr || !arr.length) return '';
    const tags = Array.from(new Set(arr.map(f => f.tag || f.word)));
    const words = tags.length <= 3 ? tags.join(' · ') : `敏感 ×${arr.length}`;
    return `<span class="tag r" title="敏感内容预警，点击通话查看">⚠ ${esc(words)}</span>`;
  };

  App.page('calls', async (v) => {
    const r = await get('/api/calls?limit=300');
    if (!r.ok) return;
    const all = r.list || [];
    const stat = (c) => c.transcribe_status === 'pending' ? ['待转写', ''] 
      : c.transcribe_status === 'transcribing' ? ['转写中', 'a']
      : c.transcribe_status === 'error' ? ['转写失败', 'r']
      : c.analyze_status === 'done' ? ['已分析', 'g']
      : c.analyze_status === 'error' ? ['分析失败', 'r'] : ['待分析', 'y'];

    v.innerHTML = `
    <div class="page-head">
      <div><div class="eyebrow">Calls</div><h2>通话流水</h2>
        <div class="desc">共 ${all.length} 通 · 点开可看转写稿、要点与待办</div></div>
      <div class="rowflex">
        <input id="kw" placeholder="搜索客户 / 标题 / 摘要" style="width:220px" value="${esc(kw)}">
        <button class="btn pri" id="btn-up">＋ 上传录音</button>
      </div>
    </div>
    <div class="filters" id="flt">
      ${[['all', '全部'], ['wait', '待处理'], ['done', '已分析'], ['err', '失败']]
        .map(([k, n]) => `<button class="chip ${filter === k ? 'on' : ''}" data-f="${k}">${n}</button>`).join('')}
    </div>
    <div class="card" id="autolist"><div id="rows"></div></div>`;

    $('#btn-up', v).onclick = () => Upload.open();
    $$('#flt .chip', v).forEach(b => b.onclick = () => { filter = b.dataset.f; App.route(); });
    $('#kw', v).oninput = (e) => { kw = e.target.value; draw(); };

    function draw() {
      const k = kw.trim().toLowerCase();
      let list = all.filter(c => {
        if (filter === 'wait') return ['pending', 'transcribing'].includes(c.transcribe_status) || (c.transcribe_status === 'done' && c.analyze_status !== 'done');
        if (filter === 'done') return c.analyze_status === 'done';
        if (filter === 'err') return c.transcribe_status === 'error' || c.analyze_status === 'error';
        return true;
      });
      if (k) list = list.filter(c => ((c.title || '') + (c.summary || '') + ((c.customer && c.customer.name) || '')).toLowerCase().includes(k));
      const rows = $('#rows', v);
      if (!list.length) { rows.innerHTML = '<div class="empty">没有匹配的通话</div>'; return; }
      rows.innerHTML = list.map((c, i) => {
        const [sn, sc] = stat(c);
        return `<div class="callrow" data-id="${c.id}">
          <div class="idx num">${String(list.length - i).padStart(2, '0')}</div>
          <div class="body">
            <div class="t1">
              <span class="nm">${esc(c.customer ? c.customer.name : (c.title || '未命名通话'))}</span>
              ${c.visit_type ? `<span class="tag">${esc(c.visit_type)}</span>` : ''}
              ${c.sentiment ? `<span class="tag ${c.sentiment === '积极' ? 'g' : c.sentiment === '消极' ? 'r' : ''}">${esc(c.sentiment)}</span>` : ''}
              ${flagChip(c.flags)}
            </div>
            <div class="sm">${esc(c.summary || (c.transcript ? '（已转写，待分析）' : '暂无摘要'))}</div>
            <div class="meta"><span>${fmtDate(c.visited_at, true)}</span><span>${fmtDur(c.duration_sec)}</span>
              ${c.next_followup_days ? `<span>· ${c.next_followup_days} 天后跟进</span>` : ''}</div>
          </div>
          <div class="side"><span class="tag ${sc}">${sn}</span>
            ${c.quality_score ? `<span class="num muted" style="font-size:12px">${c.quality_score} 分</span>` : ''}</div>
        </div>`;
      }).join('');
      $$('#rows .callrow', v).forEach(el => el.onclick = () => Call.open(el.dataset.id));
    }
    draw();
    $('#kw', v).focus();
  });

  // 供其他页复用
  window.CallsFilter = { set: (f) => { filter = f; } };
})();
