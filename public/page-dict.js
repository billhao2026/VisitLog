/* 拜访志 · 字典页：分类 / 术语 / 规则 / 纠错 */
(function () {
  const { $, $$, get, post, esc, toast } = App;

  App.page('dict', async (v) => {
    const r = await get('/api/dict');
    if (!r.ok) return;
    const cats = r.cats || [];
    const tops = cats.filter(c => !c.parent_id);
    const subs = (pid) => cats.filter(c => c.parent_id === pid);

    v.innerHTML = `
    <div class="page-head">
      <div><div class="eyebrow">Dictionary</div><h2>问题字典</h2>
        <div class="desc">分类 ${cats.length} 条 · 术语 ${r.terms.length} 条 · 规则 ${r.rules.length} 条 · 这是系统的大脑，改了会立刻影响后续归类</div></div>
      <div class="rowflex">
        <button class="btn" id="add-cat">＋ 新增分类</button>
      </div>
    </div>

    <div class="bento">
      <div class="card c12">
        <h3>分类体系<span class="sub">点击展开可改判定标准</span></h3>
        <div id="tree"></div>
      </div>
      <div class="card c12">
        <h3>自动归类规则<span class="sub">命中即直接判到该类 · 改判一次分类就会自动提议一条</span></h3>
        <div id="rules"></div>
      </div>
      <div class="card c12">
        <h3>术语纠错<span class="sub">新增/更正即全库同步（转写稿·摘要·要点·待办）</span></h3>
        <div id="terms"></div>
      </div>
      <div class="card c12">
        <h3>人工纠正记录<span class="sub">最近 100 条 · 反哺来源</span></h3>
        <div class="tw"><table><thead><tr><th class="nowrap">时间</th><th class="nowrap">字段</th><th>原值</th><th>新值</th><th class="nowrap">已转规则</th></tr></thead>
        <tbody id="corr"></tbody></table></div>
      </div>
    </div>`;

    // 分类树
    $('#tree', v).innerHTML = tops.map(t => `
      <div class="dict-cat" data-id="${t.id}">
        <div class="dc-head">
          <span class="nm">${esc(t.name)}</span>
          <span class="tag">${subs(t.id).length} 项</span>
          <span class="sp"></span>
          <span class="muted" style="font-size:11px">累计命中 ${t.usage_count || 0}</span>
        </div>
        <div class="dc-body">
          ${subs(t.id).map(s => `
            <div class="dc-sub">
              <div class="n">${esc(s.id)} ${esc(s.name)}${s.is_no_content ? ' <span class="tag y">无内容</span>' : ''}</div>
              <div class="c ed" data-cid="${s.id}" data-raw="${esc(s.criteria || '')}">${esc(s.criteria || '（点击写判定标准）')}</div>
              <div class="muted" style="font-size:11px;flex:0 0 auto">${s.usage_count || 0} 次 · 人工修正 ${s.fixed_count || 0}</div>
            </div>`).join('')}
        </div>
      </div>`).join('');

    $$('#tree .dc-head', v).forEach(h => h.onclick = () => h.parentNode.classList.toggle('open'));
    $$('#tree .ed', v).forEach(el => el.onclick = async () => {
      const cur = el.dataset.raw;
      el.innerHTML = `<textarea class="ed-in" rows="2" style="font-size:12px">${esc(cur)}</textarea>`;
      const i = $('.ed-in', el); i.focus(); i.setSelectionRange(i.value.length, i.value.length);
      let done = false;
      const save = async () => {
        if (done) return; done = true;
        const val = i.value.trim();
        if (val !== cur) {
          await post('/api/dict/category', { action: 'edit', id: el.dataset.cid, field: 'criteria', value: val });
          toast('判定标准已更新');
        }
        App.route();
      };
      i.addEventListener('blur', save);
      i.addEventListener('keydown', (e) => { if (e.key === 'Escape') { done = true; App.route(); } });
    });

    $('#add-cat', v).onclick = () => {
      App.drawer(`
        <h2 style="font-size:20px;margin-bottom:14px">新增分类</h2>
        <label class="muted" style="font-size:11.5px">上级分类</label>
        <select id="np">${tops.map(t => `<option value="${t.id}">${esc(t.name)}（二级）</option>`).join('')}<option value="">（作为一级分类）</option></select>
        <div style="height:10px"></div>
        <label class="muted" style="font-size:11.5px">名称</label><input id="nn" placeholder="如：价格异议">
        <div style="height:10px"></div>
        <label class="muted" style="font-size:11.5px">判定标准（写给 AI 看的一句话）</label>
        <textarea id="nc" rows="3" placeholder="客户明确表达对价格的不满或要求降价"></textarea>
        <div style="height:14px"></div>
        <button class="btn pri" id="ok">创建</button>`);
      $('#ok').onclick = async () => {
        const name = $('#nn').value.trim();
        if (!name) return toast('名称不能为空');
        const rr = await post('/api/dict/category', { action: 'add', parent_id: $('#np').value || null, name, criteria: $('#nc').value.trim() });
        if (rr.ok) { toast('已创建'); App.closeDrawer(); App.route(); }
      };
    };

    // 规则
    const rb = $('#rules', v);
    rb.innerHTML = r.rules.length
      ? `<div class="tw"><table><thead><tr><th>触发词</th><th>归类到</th><th class="nowrap">命中</th><th class="nowrap">操作</th></tr></thead><tbody>${
        r.rules.map(x => `<tr><td>${esc(x.pattern)}</td><td>${esc(x.category_name || x.category_id)}</td>
          <td class="num">${x.hit_count}</td>
          <td class="nowrap"><button class="btn ghost sm" data-tg="${x.id}" data-en="${x.enabled}">${x.enabled ? '停用' : '启用'}</button>
          <button class="btn ghost sm" data-rm="${x.id}">删</button></td></tr>`).join('')}</tbody></table></div>`
      : '<div class="empty" style="padding:16px">还没有规则。改判一次分类就会自动提议一条。</div>';
    $$('#rules [data-tg]', v).forEach(b => b.onclick = async () => {
      await post('/api/dict/rule', { action: 'toggle', id: Number(b.dataset.tg), enabled: b.dataset.en === '1' ? 0 : 1 }); App.route();
    });
    $$('#rules [data-rm]', v).forEach(b => b.onclick = async () => {
      await post('/api/dict/rule', { action: 'del', id: Number(b.dataset.rm) }); App.route();
    });

    // 术语
    const tb = $('#terms', v);
    tb.innerHTML = `<div class="rowflex" style="margin-bottom:4px">
        <input id="tw" placeholder="误" style="flex:1 1 90px"><input id="tr2" placeholder="正" style="flex:1 1 90px">
        <button class="btn sm" id="tadd">添加</button>
        <span class="sp" style="flex:1"></span>
        <button class="btn sm" id="tscan">🔍 扫描转写稿</button>
      </div>
      <div class="muted" id="tscanhint" style="font-size:11px;margin-bottom:8px">点击词条切换启用/停用，× 删除；扫描按出现频次排序，确认后一键纠正并全库同步</div>
      <div class="term-grid">${
      r.terms.map(x => `
        <div class="term-chip${x.enabled ? '' : ' off'}" data-tid="${x.id}" data-en="${x.enabled}" title="${x.hit_count > 0 ? '命中 ' + x.hit_count + ' 次' : '尚未命中'}">
          <span class="w">${esc(x.wrong)}</span><span class="arw">→</span><span class="r">${esc(x.rt)}</span>
          ${x.hit_count > 0 ? `<span class="hc">${x.hit_count}</span>` : ''}
          <span class="rm" data-tr="${x.id}" title="删除">×</span>
        </div>`).join('')}
      </div>
      <div class="empty" style="padding:14px" id="term-empty" ${r.terms.length ? 'hidden' : ''}>还没有术语。添加一组「误→正」即全库同步。</div>
      <div id="tcand" style="margin-top:8px"></div>`;
    $$('#terms .term-chip', v).forEach(ch => ch.onclick = async (e) => {
      if (e.target.classList.contains('rm')) return; // × 走删除
      await post('/api/dict/term', { action: 'toggle', id: Number(ch.dataset.tid), enabled: ch.dataset.en === '1' ? 0 : 1 }); App.route();
    });
    $$('#terms [data-tr]', v).forEach(b => b.onclick = async (e) => {
      e.stopPropagation();
      await post('/api/dict/term', { action: 'del', id: Number(b.dataset.tr) }); App.route();
    });
    $('#tadd', v).onclick = async () => {
      const w = $('#tw', v).value.trim(), rt = $('#tr2', v).value.trim();
      if (!w || !rt) return toast('两项都要填');
      const rr = await post('/api/dict/term', { action: 'add', wrong: w, right: rt });
      if (rr.ok) {
        if (rr.refixed) {
          toast(`已添加，全库同步修正 ${rr.refixed} 处：通话 ${rr.calls} 稿 / 摘要 ${rr.summaries} 条 / 要点 ${rr.highlights} 条 / 待办 ${rr.todos} 条`);
        } else {
          toast('已添加（本次没有命中历史内容，后续新转写自动生效）');
        }
      }
      App.route();
    };

    // 疑似错词扫描
    const candBox = $('#tcand', v);
    $('#tscan', v).onclick = async () => {
      candBox.innerHTML = '<div class="empty" style="padding:10px">扫描中…</div>';
      const cr = await get('/api/dict/candidates');
      if (!cr.ok || !cr.candidates.length) {
        candBox.innerHTML = '<div class="empty" style="padding:10px">没有发现高置信度候选（扫描仅粗筛，可人工在下方添加）</div>';
        return;
      }
      candBox.innerHTML = cr.candidates.map((c, idx) => `
        <div class="cand-row" data-i="${idx}">
          <div class="cand-main">
            <span class="cand-w">${esc(c.phrase)}</span>
            <span class="tag">${c.count} 次</span>
            <span class="muted cand-smp">…${esc(c.sample)}…</span>
          </div>
          <div class="cand-fix">
            <input class="cand-in" data-w="${esc(c.phrase)}" placeholder="正确写法">
            <button class="btn ghost sm" data-fix="${idx}">纠正</button>
          </div>
        </div>`).join('');
      $$('#tcand .cand-fix button', v).forEach(b => b.onclick = async () => {
        const row = b.closest('.cand-row');
        const inp = $('.cand-in', row);
        const rt = inp.value.trim();
        if (!rt) return toast('先填正确写法');
        const rr = await post('/api/dict/term', { action: 'add', wrong: inp.dataset.w, right: rt });
        if (rr.ok) {
          if (rr.refixed) toast(`已纠正「${inp.dataset.w}→${rt}」，全库同步 ${rr.refixed} 处`);
          else toast(`已添加「${inp.dataset.w}→${rt}」（未命中历史内容）`);
          row.remove();
        }
      });
    };

    // 纠正记录
    $('#corr', v).innerHTML = r.corrections.length
      ? r.corrections.map(c => `<tr><td class="nowrap muted">${esc(String(c.created_at || '').slice(5, 16))}</td>
        <td class="nowrap">${esc(c.field)}</td><td>${esc(c.old_value || '—')}</td><td>${esc(c.new_value || '—')}</td>
        <td class="nowrap">${c.applied ? '<span class="tag g">已转规则</span>' : '<span class="muted">—</span>'}</td></tr>`).join('')
      : '<tr><td colspan="5" class="empty" style="padding:18px">暂无人工纠正记录</td></tr>';
  });
})();
