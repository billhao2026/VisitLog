/* 拜访志 · 日程速记：补录系统看不见的线下活动（面试 / 会议 / 外出 / 谈话） */
(function () {
  const { $, $$, get, post, esc, toast } = App;

  let curDate = '';

  function todayStr() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function shiftDate(s, n) {
    const d = new Date(s.replace(/-/g, '/'));
    d.setDate(d.getDate() + n);
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function nowHM() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function dur(a, b) {
    if (!a || !b) return '';
    const m = (t) => { const [h, x] = t.split(':').map(Number); return h * 60 + x; };
    const d = m(b) - m(a);
    if (d <= 0) return '';
    return d >= 60 ? `${Math.floor(d / 60)}h${d % 60 ? (d % 60) + 'm' : ''}` : `${d}m`;
  }

  App.page('journal', async (v) => {
    if (!curDate) curDate = todayStr();
    const r = await get('/api/journal?date=' + curDate);
    if (!r.ok) { v.innerHTML = '<div class="empty">读取失败</div>'; return; }
    const items = r.items || [];

    v.innerHTML = `
    <div class="page-head">
      <div><div class="eyebrow">Timeline</div><h2>日程速记</h2>
        <div class="desc">只记系统看不见的事——面试、开会、外出、谈话。每天 18:50 的复盘会自动把这些时段并进时间轴，空白就不会出现了。</div></div>
      <div class="rowflex">
        <button class="btn sm" id="prev">‹ 前一天</button>
        <input id="jdate" type="date" value="${curDate}" style="flex:0 0 150px">
        <button class="btn sm" id="next">后一天 ›</button>
        <button class="btn sm pri" id="jtoday">今天</button>
      </div>
    </div>

    <div class="bento">
      <div class="card c12">
        <h3>＋ 记一条 <span class="sub">开始时间必填；结束时间留空表示"单点事件"</span></h3>
        <div class="rowflex" style="gap:8px;flex-wrap:wrap;align-items:center">
          <input id="jstart" type="time" value="${nowHM()}" style="flex:0 0 120px">
          <span class="muted">→</span>
          <input id="jend" type="time" style="flex:0 0 120px">
          <input id="jtext" placeholder="在做什么，如：面试 / 周会 / 见客户" style="flex:1 1 260px">
          <button class="btn pri" id="jadd">记下</button>
        </div>
        <div class="muted" style="font-size:11.5px;margin-top:8px">快捷键：在「在做什么」里按回车即可提交</div>
      </div>

      <div class="card c12">
        <h3>${curDate} <span class="sub">${items.length ? items.length + ' 条' : '还没有记录'}</span></h3>
        <div id="jlist"></div>
        <div class="divider"></div>
        <div class="muted" style="font-size:11.5px">落点：${esc(r.dir || '')}\\${curDate}.md —— 每日复盘会自动读取</div>
      </div>
    </div>`;

    const draw = (list) => {
      $('#jlist').innerHTML = list.length
        ? list.map((it) => `
          <div class="flag-row" data-line="${it.line}">
            <div class="fl-main">
              <div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap">
                <b style="font-variant-numeric:tabular-nums">${esc(it.start)}${it.end ? '–' + esc(it.end) : ''}</b>
                <span class="tag y">${esc(dur(it.start, it.end) || '单点')}</span>
                <span>${esc(it.text)}</span>
              </div>
            </div>
            <div style="flex:0 0 auto">
              <button class="btn ghost sm" data-act="del">删除</button>
            </div>
          </div>`).join('')
        : '<div class="empty">今天还没有线下活动记录</div>';

      $$('#jlist [data-act="del"]').forEach((b) => {
        b.onclick = async () => {
          const line = Number(b.closest('[data-line]').dataset.line);
          const rr = await post('/api/journal/del', { date: curDate, line });
          if (rr.ok) { toast('已删除'); draw(rr.items || []); }
        };
      });
    };
    draw(items);

    const add = async () => {
      const start = $('#jstart').value.trim();
      const end = $('#jend').value.trim();
      const text = $('#jtext').value.trim();
      if (!start) return toast('请填开始时间');
      if (!text) return toast('请填在做什么');
      const rr = await post('/api/journal', { date: curDate, start, end, text });
      if (rr.ok) {
        $('#jtext').value = '';
        $('#jstart').value = nowHM();
        $('#jend').value = '';
        toast('已记下');
        // 同步标题里的条数
        const h = $('#jlist').closest('.card').querySelector('h3');
        if (h) h.innerHTML = `${curDate} <span class="sub">${(rr.items || []).length} 条</span>`;
        draw(rr.items || []);
        $('#jtext').focus();
      }
    };
    $('#jadd').onclick = add;
    $('#jtext').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } });

    $('#prev').onclick = () => { curDate = shiftDate(curDate, -1); App.route(); };
    $('#next').onclick = () => { curDate = shiftDate(curDate, 1); App.route(); };
    $('#jtoday').onclick = () => { curDate = todayStr(); App.route(); };
    $('#jdate').onchange = (e) => { if (e.target.value) { curDate = e.target.value; App.route(); } };
  });
})();
