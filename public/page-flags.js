/* 拜访志 · 预警页：敏感词命中 + 词库管理 */
(function () {
  const { $, $$, get, post, del, esc, toast, fmtDate, rel } = App;

  App.page('flags', async (v) => {
    const r = await get('/api/flags');
    const s = await get('/api/sens');
    if (!r.ok) return;
    const list = r.list || [];
    const open = list.filter(f => !f.handled);
    const done = list.filter(f => f.handled);
    const words = s.ok ? (s.list || []) : [];

    v.innerHTML = `
    <div class="page-head">
      <div><div class="eyebrow">Alerts</div><h2>敏感预警</h2>
        <div class="desc">转写稿自动扫描 · 命中「故障 / 投诉 / 账期 / 回款」等敏感词即标红，处理后归档</div></div>
      <div class="rowflex">
        <button class="btn" id="rescan">↻ 重扫全部转写稿</button>
      </div>
    </div>

    <div class="bento">
      <div class="card c12" id="flag-open">
        <h3>⚠ 未处理 <span class="sub">${open.length} 条 · 建议逐条处理：打开通话 → 确认 → 标记已处理</span></h3>
        <div id="open-list"></div>
      </div>
      <div class="card c12" id="sens-card">
        <h3>敏感词库 <span class="sub">出现在词库中的词（且已启用）才会被扫描命中</span></h3>
        <div id="sens-list" style="display:flex;flex-wrap:wrap;gap:6px"></div>
        <div class="divider"></div>
        <div class="rowflex" style="gap:6px">
          <input id="sw" placeholder="新增敏感词，如：压货" style="flex:0 0 200px">
          <select id="st" style="flex:0 0 110px">
            <option>故障</option><option>投诉</option><option>售后</option><option>质量</option>
            <option>账期</option><option>回款</option><option>竞争</option><option>其他</option>
          </select>
          <button class="btn pri sm" id="sadd">＋ 添加</button>
          <span class="grow"></span>
          <span class="muted" style="font-size:11.5px">词库改动后点「重扫全部」即刻生效</span>
        </div>
      </div>
      <div class="card c12" id="flag-done" ${done.length ? '' : 'style="display:none"'}>
        <h3>已处理 <span class="sub">${done.length} 条 · 保留 30 天便于回溯</span></h3>
        <div id="done-list"></div>
      </div>
    </div>`;

    const TAG_COLOR = { 故障: 'r', 投诉: 'r', 售后: 'y', 质量: 'y', 账期: 'y', 回款: 'y', 竞争: 'b' };
    const flCard = (f) => `
      <div class="flag-row ${f.handled ? 'off' : ''}" data-id="${f.id}">
        <div class="fl-main">
          <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <span class="tag ${TAG_COLOR[f.tag] || 'y'}">${esc(f.tag || '敏感')}</span>
            <b>「${esc(f.word)}」</b>
            ${f.customer_name ? `<a href="#" data-cust="${f.customer_id}">${esc(f.customer_name)}</a>` : ''}
            <a href="#" data-call="${f.call_id}" class="muted">${esc(f.call_title || '查看通话')}</a>
            <span class="muted" style="font-size:11px">${fmtDate(f.visited_at || f.created_at)} · ${rel(f.visited_at || f.created_at)}</span>
          </div>
          <div class="fl-snp">${esc(f.snippet || '')}</div>
        </div>
        <div style="flex:0 0 auto">
          ${f.handled
            ? '<button class="btn ghost sm" data-act="reopen">撤销</button>'
            : '<button class="btn sm pri" data-act="ok">✓ 已处理</button>'}
        </div>
      </div>`;

    $('#open-list').innerHTML = open.length
      ? open.map(flCard).join('')
      : '<div class="empty" style="padding:26px">✅ 没有未处理的敏感预警</div>';
    $('#done-list').innerHTML = done.slice(0, 50).map(flCard).join('');

    // 处理/撤销
    const bindFlags = (box) => $$('[data-act]', box).forEach(b => b.onclick = async () => {
      const id = b.closest('.flag-row').dataset.id;
      await post('/api/flags/' + id, { value: b.dataset.act === 'ok' ? 1 : 0 });
      toast(b.dataset.act === 'ok' ? '已标记处理' : '已恢复未处理');
      App.route();
    });
    bindFlags($('#open-list'));
    bindFlags($('#done-list'));

    // 跳转通话/客户
    const jump = (box) => $$('[data-call]', box).forEach(a => a.onclick = (e) => { e.preventDefault(); Call.open(a.dataset.call); });
    jump($('#open-list')); jump($('#done-list'));
    $$('#flag-open [data-cust], #flag-done [data-cust]').forEach(a => a.onclick = (e) => { e.preventDefault(); Cust.open(a.dataset.cust); });

    // 敏感词库
    const drawSens = () => {
      $('#sens-list').innerHTML = words.map(w => `
        <span class="sens-chip ${w.enabled ? '' : 'off'}" data-word="${esc(w.word)}">
          <span class="tag ${TAG_COLOR[w.tag] || ''}" style="border:none;background:none;padding:0 2px 0 0">${esc(w.tag)}</span>
          ${esc(w.word)}
          <i class="muted" style="font-style:normal;font-size:10.5px">${w.hit_count || 0}次</i>
          <b data-act="tg" style="cursor:pointer;font-weight:400">${w.enabled ? '停用' : '启用'}</b>
          <b data-act="rm" style="cursor:pointer;color:var(--red)">✕</b>
        </span>`).join('') || '<span class="muted">暂无敏感词</span>';
      $$('#sens-list .sens-chip').forEach(chip => chip.onclick = async (e) => {
        const act = e.target.dataset.act;
        if (!act) return;
        const word = chip.dataset.word;
        if (act === 'tg') await post('/api/sens', { action: 'toggle', word });
        else if (act === 'rm' && window.confirm(`删除敏感词「${word}」？（历史预警保留）`)) await post('/api/sens', { action: 'del', word });
        toast('已更新'); App.route();
      });
    };
    drawSens();
    $('#sadd').onclick = async () => {
      const w = $('#sw').value.trim();
      if (!w) return;
      await post('/api/sens', { action: 'add', word: w, tag: $('#st').value });
      $('#sw').value = '';
      toast('已加入词库，点「重扫全部」生效');
      App.route();
    };
    $('#sw').onkeydown = (e) => { if (e.key === 'Enter') $('#sadd').click(); };
    $('#rescan').onclick = async () => {
      toast('全量重扫中…');
      const rr = await post('/api/flags/rescan', {});
      if (rr.ok) toast(`重扫完成：${rr.calls} 通 · 新增命中 ${rr.hits}`);
      App.route();
    };
  });
})();
