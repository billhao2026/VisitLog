/* 拜访志 · 概览页 */
(function () {
  const { $, esc, get, toast, fmtDate, rel, drawer } = App;
  let charts = [];
  const kill = () => { charts.forEach(c => { try { c.dispose(); } catch (e) {} }); charts = []; };
  const mk = (el, opt) => { const c = echarts.init(el); c.setOption(opt); charts.push(c); return c; };
  const PALETTE = ['#C2410C', '#B45309', '#4D7C5F', '#2F5D7C', '#7C5C9E', '#8A6D3B', '#9B2C2C', '#5C6B7A', '#6B7C4D', '#A05A78'];

  App.page('home', async (v) => {
    kill();
    const s = await get('/api/stats');
    if (!s.ok) return;
    const d = s.stats;

    v.innerHTML = `
    <div class="page-head">
      <div>
        <div class="eyebrow">Journal</div>
        <h2>今日概览</h2>
        <div class="desc">${fmtDate(new Date(), true)} · 通话与待办全景</div>
      </div>
      <div class="rowflex">
        <button class="btn" id="btn-refresh">刷新</button>
        <button class="btn pri" id="btn-up">＋ 上传录音</button>
        <button class="btn" id="btn-manual" title="手动添加待办：提到公司名将自动建档关联">✍ 手动添加</button>
        <button class="btn" id="btn-ana">分析待处理队列</button>
      </div>
    </div>

    ${d.flagsOpen ? `<div class="warn-banner" id="warn-banner">
        <span class="warn-ico">⚠</span>
        <div class="grow"><b>${d.flagsOpen} 条敏感预警待处理</b>
          <span class="muted">通话中提到故障 / 投诉 / 账期 / 回款等敏感内容，建议尽快关注</span></div>
        <button class="btn sm pri">去处理 →</button>
      </div>` : ''}

    <div class="bento start">
      <div class="card c3"><div class="stat ${d.pendingT + d.pendingA ? 'hot' : ''}">
        <div class="big">${d.total}</div><div class="lb">累计通话</div>
        <div class="ft">转写中 ${d.pendingT} · 待分析 ${d.pendingA}${d.err ? ' · 失败 ' + d.err : ''}</div>
      </div></div>
      <div class="card c3"><div class="stat">
        <div class="big">${d.openTodos}</div><div class="lb">未完成待办</div>
        <div class="ft">高优先 ${d.openHigh || 0} · 今日到期 ${d.todayTodos}</div>
      </div></div>
      <div class="card c3"><div class="stat ${d.overdue ? 'hot' : ''}">
        <div class="big">${d.overdue}</div><div class="lb">已超期</div>
        <div class="ft">${d.overdue ? '需要优先清理' : '节奏良好'}</div>
      </div></div>
      <div class="card c3"><div class="stat">
        <div class="big">${d.doneToday || 0}</div><div class="lb">今日已推进</div>
        <div class="ft">通话 ${d.total} · 客户 ${d.custs} 个</div>
      </div></div>

      <div class="card c12 hl-hero">
        <div class="rowflex" style="justify-content:space-between;align-items:baseline">
          <h3 style="margin:0">重点事项主线<span class="sub">置顶要点 · 一眼看清今天该盯什么</span></h3>
          <span class="muted" style="font-size:11px">共 ${d.pinnedHl || 0} 条置顶 · 展示前 6</span>
        </div>
        <div id="hl-hero" style="margin-top:10px"></div>
      </div>

      <div class="card c12" style="padding-bottom:6px">
        <div class="rowflex" style="justify-content:space-between;align-items:baseline">
          <h3 style="margin:0">近 14 个工作日通话量<span class="sub">已排除周六日 · 按拜访日期统计</span></h3>
          <span class="muted" style="font-size:11px">${s.trend.reduce((a, x) => a + x.count, 0)} 通 / 14 个工作日</span>
        </div>
        <div class="chart" id="ch-trend" style="height:190px;margin-top:8px"></div>
      </div>

      <div class="card c12">
        <h3>待办节奏<span class="sub">${d.openTodos} 项未完成 · 高优先 ${d.openHigh || 0}</span></h3>
        <div id="todo-brief"></div>
      </div>

      <div class="card c5">
        <h3>问题归类分布<span class="sub">一级分类 · 共 ${d.done} 通已分析</span></h3>
        <div class="chart" id="ch-dist"></div>
      </div>
      <div class="card c7">
        <h3>待跟进客户<span class="sub">超过 30 天未联系</span></h3>
        <div id="stale"></div>
      </div>
    </div>`;

    const wb = $('#warn-banner', v);
    if (wb) wb.onclick = () => { location.hash = '#/flags'; };
    $('#btn-up', v).onclick = () => Upload.open();
    $('#btn-manual', v).onclick = () => { location.hash = '#/todos'; setTimeout(() => { const i = document.querySelector('#nin'); if (i) { i.focus(); i.placeholder = '如：公司名称：XX公司 · 对接人：X经理 · 事项…'; } }, 200); };
    $('#btn-refresh', v).onclick = () => { App.toast('刷新中…'); App.route(); };
    $('#btn-ana', v).onclick = () => { location.hash = '#/calls'; };

    await App.echartsReady();

    // 重点事项主线（置顶五星要点）
    const hero = $('#hl-hero', v);
    if (s.highlights && s.highlights.length) {
      const KIND_CLS = { 机会: 'g', 风险: 'r', 决策: 'b', 结论: 'y', 承诺: 'b', 事实: '' };
      hero.innerHTML = `<div class="hl-hero-grid">${
        s.highlights.map(h => `
          <div class="hl-hero-item" data-hid="${h.id}" data-cid="${h.customer_id}">
            <div class="hh-top">
              <span class="tag ${KIND_CLS[h.kind] || ''}">${esc(h.kind)}</span>
              ${h.importance >= 5 ? '<span class="tag r">★★★★★</span>' : `<span class="tag">${'★'.repeat(h.importance)}</span>`}
              <span class="sp"></span>
              <span class="muted hh-cust">${esc(h.customer_name)}</span>
            </div>
            <div class="hh-tx">${esc(h.content)}</div>
          </div>`).join('')}
        </div>`;
      App.$$('.hl-hero-item', hero).forEach(el => el.onclick = () => Cust.open(el.dataset.cid));
    } else {
      hero.innerHTML = '<div class="empty">暂无置顶要点。在客户档案或通话详情里把关键要点 📌 置顶，这里就会展示</div>';
    }

    // 趋势：单柱图，数值标在柱外
    mk($('#ch-trend', v), {
      grid: { left: 8, right: 12, top: 18, bottom: 4, containLabel: true },
      tooltip: { trigger: 'axis', backgroundColor: '#1A1815', borderWidth: 0, textStyle: { color: '#FBF9F5', fontSize: 12 } },
      xAxis: {
        type: 'category', data: s.trend.map(x => x.date.slice(5)),
        axisLine: { lineStyle: { color: '#D6CBB6' } }, axisTick: { show: false },
        axisLabel: { color: '#8A8175', fontSize: 10, interval: 1 },
      },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: '#EFE9DD' } }, axisLabel: { color: '#B4AB9C', fontSize: 10 } },
      series: [{
        type: 'bar', data: s.trend.map(x => x.count), barMaxWidth: 26,
        itemStyle: { color: '#C2410C', borderRadius: [2, 2, 0, 0] },
        label: { show: true, position: 'top', color: '#8A8175', fontSize: 10,
          formatter: (p) => (p.value > 0 ? p.value : '') },
      }],
    });

    // 分布：横向条形，不贴文字标签（左侧轴名已足够），数值放柱外
    const dist = s.dist.slice(0, 8);
    mk($('#ch-dist', v), {
      grid: { left: 8, right: 40, top: 6, bottom: 2, containLabel: true },
      tooltip: { trigger: 'item', backgroundColor: '#1A1815', borderWidth: 0, textStyle: { color: '#FBF9F5', fontSize: 12 } },
      xAxis: { type: 'value', show: false },
      yAxis: {
        type: 'category', data: dist.map(x => x.name).reverse(),
        axisLine: { show: false }, axisTick: { show: false },
        axisLabel: { color: '#4A443C', fontSize: 11.5 },
      },
      series: [{
        type: 'bar', data: dist.map(x => x.count).reverse(), barMaxWidth: 16,
        itemStyle: { color: (p) => PALETTE[p.dataIndex % PALETTE.length], borderRadius: [0, 2, 2, 0] },
        label: { show: true, position: 'right', color: '#8A8175', fontSize: 11 },
      }],
    });

    // 待办节奏（升级版：数字条 + 高优先列表 + 跟进动态）
    const tb = $('#todo-brief', v);
    const chips = [['overdue', '超期', d.overdue, 'r'], ['today', '今天', d.todayTodos, 'y'], ['high', '高优先', d.openHigh || 0, ''], ['open', '全部', d.openTodos, '']];
    tb.innerHTML = `<div class="todo-chips todo-chips-wide">${chips.map(([k, n, val, cls]) =>
      `<div class="tchip clickable ${cls ? 't' + cls : ''}" data-scope="${k}" title="点击进入待办页：${n}">
        <b>${val}</b><span>${n}</span>
      </div>`).join('')}
      </div>
      <div class="todo-brief-grid">`
      + (s.todoTop && s.todoTop.length ? `
      <div>
      <div style="font-size:11.5px;color:var(--ink3);margin:0 0 4px;letter-spacing:.05em">高优先 · 今日到期</div>
      ${s.todoTop.map(t2 => `<div class="fu-mini clickable" data-todo="${t2.id}" title="点击处理此待办">
        <span class="tag ${t2.overdue ? 'r' : t2.priority === '高' ? 'y' : ''}">${t2.overdue ? '超期' : t2.priority === '高' ? '高' : '今日'}</span>
        <span class="grow" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t2.customer_name)} · ${esc(t2.content)}</span>
        <span class="muted" style="flex:0 0 auto;font-size:10.5px">${t2.due_date ? t2.due_date.slice(5) : ''}</span>
      </div>`).join('')}</div>` : '')
      + (s.fuRecent && s.fuRecent.length ? `
      <div>
      <div style="font-size:11.5px;color:var(--ink3);margin:0 0 4px;letter-spacing:.05em">最近跟进动态</div>
      ${s.fuRecent.map(f => `<div class="fu-mini" data-fu="${f.ref_type}:${f.ref_id}" title="${esc(f.content)}">
        <span class="tag ${f.result === '已闭环' ? 'g' : f.result === '有突破' ? 'b' : f.result === '推进中' ? 'y' : ''}">${esc(f.result || '跟进')}</span>
        <span class="grow" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.customer_name ? f.customer_name + ' · ' : '')}${esc(f.content)}</span>
        <span class="muted" style="flex:0 0 auto">${rel(f.created_at)}</span>
      </div>`).join('')}</div>` : '')
      + `</div>
      <div style="margin-top:12px"><button class="btn sm" id="go-todo">查看全部待办 →</button></div>`;
    $('#go-todo', v).onclick = () => { location.hash = '#/todos'; };
    // 数字块：跳到对应 scope 的待办页
    App.$$('.tchip[data-scope]', tb).forEach(el => el.onclick = () => {
      location.hash = '#/todos?scope=' + el.dataset.scope;
    });
    // 高优先列表项：直接打开该待办的跟进面板（不再跳客户档案）
    App.$$('.fu-mini[data-todo]', tb).forEach(el => el.onclick = () => {
      const todoId = el.dataset.todo;
      const todo = (s.todoTop || []).find(x => x.id === todoId);
      if (todo && window.Follow) {
        const dueTxt = todo.overdue ? '已超期' : (todo.due_date ? '期限 ' + todo.due_date : '未定期限');
        Follow.open({ type: 'todo', id: todoId, title: todo.content, sub: `${todo.customer_name} · ${dueTxt}`, onAfter: () => App.route() });
      }
    });
    App.$$('.fu-mini', tb).forEach(el => el.onclick = () => {
      const [type, id] = el.dataset.fu.split(':');
      if (!window.Follow) return;
      if (type === 'todo') {
        const f = (s.fuRecent || []).find(x => x.ref_type === type && x.ref_id === id) || {};
        Follow.open({ type: 'todo', id, title: f.todo_content || '待办', sub: '待办跟进', onAfter: () => App.route() });
      } else if (type === 'highlight') {
        Follow.open({ type: 'highlight', id, title: '重点事项', sub: '重点跟进', onAfter: () => App.route() });
      }
    });

    // 待跟进客户
    const st = $('#stale', v);
    st.innerHTML = s.stale.length
      ? `<div class="tw"><table><thead><tr><th>客户</th><th class="nowrap">最近拜访</th><th class="nowrap">未跟进</th><th class="nowrap">待办</th></tr></thead><tbody>${
        s.stale.map(c => `<tr><td><a href="#" data-cust="${c.id}">${esc(c.name)}</a></td>
          <td class="nowrap muted">${fmtDate(c.last_visit_at)}</td>
          <td class="nowrap"><span class="tag ${rel(c.last_visit_at).includes('月') ? 'r' : 'y'}">${rel(c.last_visit_at)}</span></td>
          <td class="nowrap num">${c.ot || 0}</td></tr>`).join('')
      }</tbody></table></div>`
      : '<div class="empty">暂无超 30 天未跟进的客户</div>';
    App.$$('#stale [data-cust]', v).forEach(a => a.onclick = (e) => { e.preventDefault(); Cust.open(a.dataset.cust); });

    // 渲染自检标记（供无头浏览器验证图表是否真正绘制）
    setTimeout(() => {
      try {
        v.dataset.rendered = JSON.stringify(charts.map(c => {
          try { return (c.getDataURL() || '').length; } catch (e) { return 0; }
        }));
      } catch (e) { v.dataset.rendered = 'err:' + e.message; }
    }, 1200);
  });
})();
