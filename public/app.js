/* 拜访志 · 核心：路由 / 接口 / 抽屉 / 队列 */
window.App = (function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  async function api(path, opts) {
    const o = Object.assign({ headers: {} }, opts || {});
    if (o.body && typeof o.body === 'object') {
      o.headers['Content-Type'] = 'application/json';
      o.body = JSON.stringify(o.body);
    }
    const r = await fetch(path, o);
    let j = {};
    try { j = await r.json(); } catch (e) { j = { ok: false, err: '响应解析失败' }; }
    if (r.status === 401 && j && j.needAuth) { authBox(); return j; }
    if (!j.ok && j.err) toast(j.err);
    return j;
  }
  const get = (p) => api(p);
  const post = (p, b) => api(p, { method: 'POST', body: b || {} });
  const del = (p) => api(p, { method: 'DELETE' });

  // 局域网访问口令弹层（非本机访问且未登录时出现）
  let authShown = false;
  function authBox() {
    if (authShown) return;
    authShown = true;
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;inset:0;z-index:300;background:rgba(26,24,21,.45);display:grid;place-items:center';
    box.innerHTML = `<div style="background:var(--paper);border:1px solid var(--rule2);border-radius:8px;padding:26px 30px;width:min(360px,90vw);box-shadow:0 18px 50px rgba(26,24,21,.25)">
      <div class="eyebrow">VisitLog</div>
      <h2 style="font-size:20px;margin-bottom:6px">输入访问口令</h2>
      <p class="muted" style="font-size:12.5px;margin-bottom:14px">本系统已开启局域网保护，请向管理员获取口令</p>
      <input id="auth-code" type="password" placeholder="访问口令" style="width:100%">
      <div id="auth-err" class="muted" style="color:var(--red);font-size:12px;margin-top:6px"></div>
      <div class="rowflex" style="margin-top:14px;justify-content:flex-end">
        <button class="btn pri" id="auth-go">进入</button>
      </div>
    </div>`;
    document.body.appendChild(box);
    const done = async () => {
      const code = box.querySelector('#auth-code').value.trim();
      const r = await fetch('/api/auth', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      }).then(x => x.json());
      if (r.ok) { box.remove(); authShown = false; toast('欢迎回来'); App.route(); }
      else box.querySelector('#auth-err').textContent = r.err || '口令错误';
    };
    box.querySelector('#auth-go').onclick = done;
    box.querySelector('#auth-code').onkeydown = (e) => { if (e.key === 'Enter') done(); };
    setTimeout(() => box.querySelector('#auth-code').focus(), 60);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(t._t); t._t = setTimeout(() => { t.hidden = true; }, 2400);
  }
  function drawer(html) {
    $('#drawer-body').innerHTML = html;
    $('#drawer').hidden = false;
    document.body.style.overflow = 'hidden';
    $('#drawer-body').scrollTop = 0;
  }
  function closeDrawer() {
    $('#drawer').hidden = true;
    document.body.style.overflow = '';
    $('#drawer-body').innerHTML = '';
  }

  const pad = (n) => String(n).padStart(2, '0');
  function fmtDate(s, withTime) {
    if (!s) return '—';
    const d = new Date(String(s).replace(/-/g, '/').slice(0, 19));
    if (isNaN(d)) return String(s).slice(0, 10);
    const base = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    return withTime ? `${base} ${pad(d.getHours())}:${pad(d.getMinutes())}` : base;
  }
  function fmtDur(sec) {
    if (!sec) return '—';
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${m}′${pad(s)}″`;
  }
  function rel(s) {
    if (!s) return '—';
    const d = Math.floor((Date.now() - new Date(String(s).replace(/-/g, '/')).getTime()) / 864e5);
    if (d <= 0) return '今天';
    if (d === 1) return '昨天';
    if (d < 30) return d + ' 天前';
    if (d < 365) return Math.floor(d / 30) + ' 个月前';
    return Math.floor(d / 365) + ' 年前';
  }

  // 就地编辑（回车/blur 提交，Esc 取消）
  function bindEdit(root, url, field, transform, onDone) {
    const after = onDone || (() => App.route());
    $$('.ed', root).forEach(el => {
      if (el.dataset.bound) return;
      el.dataset.bound = '1';
      el.addEventListener('click', (e) => {
        if (!el.contains(e.target)) return;
        if (el.querySelector('.ed-in')) return; // 已在编辑中
        const cur = el.dataset.raw !== undefined ? el.dataset.raw : el.textContent.trim();
        const wide = el.dataset.wide === '1';
        const inp = wide
          ? `<textarea class="ed-in" rows="3">${esc(cur)}</textarea>`
          : `<input class="ed-in" value="${esc(cur)}">`;
        el.innerHTML = inp;
        const i = $('.ed-in', el); i.focus();
        i.setSelectionRange(i.value.length, i.value.length);
        let done = false;
        const save = async () => {
          if (done) return; done = true;
          let v = transform ? transform(i.value) : i.value.trim();
          if (String(v) === String(cur)) { after(); return; }
          const r = await post(url, { field, value: v });
          if (r.ok) toast('已更新');
          after();
        };
        i.addEventListener('blur', save);
        i.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' && !wide) { ev.preventDefault(); i.blur(); }
          if (ev.key === 'Escape') { done = true; after(); }
        });
      });
    });
  }

  const TABS = [
    ['home', '概览', 'home'],
    ['calls', '通话', 'calls'],
    ['todos', '待办', 'todos'],
    ['highlights', '重点', 'highlights'],
    ['flags', '预警', 'flags'],
    ['customers', '客户', 'customers'],
    ['dict', '字典', 'dict'],
  ];
  let cur = 'home';
  let counts = {};

  function renderTabs() {
    $('#tabs').innerHTML = TABS.map(([k, label]) =>
      `<button class="tab ${cur === k ? 'on' : ''}" data-tab="${k}">${label}${counts[k] ? `<span class="n">${counts[k]}</span>` : ''}</button>`
    ).join('');
    $$('#tabs .tab').forEach(b => b.onclick = () => { location.hash = '#/' + b.dataset.tab; });
  }

  const PAGES = {};
  function page(k, fn) { PAGES[k] = fn; }

  async function route() {
    cur = (location.hash || '#/home').replace('#/', '') || 'home';
    cur = cur.split('?')[0] || 'home'; // 支持 #/todos?scope=xxx 深链参数
    if (!PAGES[cur]) cur = 'home';
    renderTabs();
    const v = $('#view');
    v.innerHTML = '<div class="empty">载入中…</div>';
    try {
      const h = location.hash.replace('#/', '');
      if (h.startsWith('call/')) {
        await PAGES.home(v);
        if (window.Call) Call.open(h.slice(5));
        return;
      }
      if (h.startsWith('cust/')) {
        await PAGES.home(v);
        if (window.Cust) Cust.open(h.slice(5));
        return;
      }
      await PAGES[cur](v);
    } catch (e) { v.innerHTML = '<div class="empty">页面出错：' + esc(e.message) + '</div>'; }
  }

  // echarts 懒加载：只有概览页用到，其他页面不再解析这 1MB
  let echartsP = null;
  function echartsReady() {
    if (window.echarts) return Promise.resolve();
    if (echartsP) return echartsP;
    echartsP = new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = '/vendor/echarts.min.js';
      s.onload = () => res(window.echarts);
      s.onerror = () => rej(new Error('图表库加载失败'));
      document.head.appendChild(s);
    });
    return echartsP;
  }

  // 队列徽标 + 状态变化时自动刷新当前页
  let lastSig = '';
  async function pollQueue() {
    try {
      const q = await get('/api/queue');
      if (!q.ok) return;
      counts.todos = q.openTodos || 0;
      counts.flags = q.flagsOpen || 0;
      const btn = $('#qbtn');
      const busy = q.running || q.pendingT > 0;
      const n = q.pendingT;
      btn.className = 'qbtn' + (busy ? ' busy' : '');
      btn.textContent = busy
        ? (q.running ? '转写中' + (n > 1 ? ' · 余 ' + n : '') : `待转写 ${n}`)
        : (q.pendingA ? `待分析 ${q.pendingA}` : '上传录音');
      // 数据状态变了才刷新，且不打断正在输入/打开的抽屉
      const sig = JSON.stringify([q.running, q.pendingT, q.pendingA, q.flagsOpen]);
      if (lastSig === '') {
        lastSig = sig; // 首轮只建基线，不重渲染
      } else if (sig !== lastSig) {
        lastSig = sig;
        const typing = document.querySelector('.ed-in')
          || /^(INPUT|TEXTAREA|SELECT)$/.test((document.activeElement || {}).tagName || '');
        const drawerOpen = !$('#drawer').hidden;
        if (!typing && !drawerOpen) route();
      }
    } catch (e) { /* 服务未启动 */ }
  }

  function boot() {
    window.addEventListener('hashchange', route);
    document.addEventListener('click', (e) => {
      if (e.target.dataset && e.target.dataset.close !== undefined) closeDrawer();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
    $('#qbtn').onclick = () => Upload.open();
    const setBtn = $('#setbtn');
    if (setBtn && window.Setup) setBtn.onclick = () => Setup.open();
    route();
    pollQueue();
    setInterval(pollQueue, 2500);
  }

  return {
    $, $$, api, get, post, del, esc, toast, drawer, closeDrawer,
    fmtDate, fmtDur, rel, bindEdit, page, boot, route, echartsReady,
    setCounts: (c) => { counts = Object.assign(counts, c); renderTabs(); },
    get cur() { return cur; },
  };
})();
