/* 客户跟进协作页逻辑 */
(function () {
  var TOKEN = (location.pathname.match(/\/s\/([^/]+)/) || [])[1] || (location.pathname.split('/').pop());
  var API = '/api/share/' + TOKEN;
  var me = localStorage.getItem('bf-me') || '';
  var D = {};
  var RES = ['无进展', '推进中', '有突破', '已闭环'];
  var RCOL = { 无进展: '', 推进中: 'y', 有突破: 'b', 已闭环: 'g' };
  var $ = function (s) { return document.querySelector(s); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function d10(s) { return s ? String(s).slice(0, 10) : ''; }
  function fuMark(x) {
    return x.fu_n ? '<span class="tag ' + (RCOL[x.fu_last_res] || 'a') + '">✍ ' + x.fu_n +
      (x.fu_last_res ? ' ' + esc(x.fu_last_res) : '') + '</span>' +
      (x.fu_last ? '<span class="muted">' + esc(x.fu_last.length > 24 ? x.fu_last.slice(0, 24) + '…' : x.fu_last) + '</span>' : '')
      : '<span class="muted" style="font-size:10.5px">○ 未跟进</span>';
  }
  function post(path, body) { return fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); }); }

  function checkMe() {
    if (!$('#me').value.trim()) { alert('请先在上方填写你的姓名'); $('#me').focus(); return false; }
    return true;
  }
  function who() { var v = $('#me').value.trim(); localStorage.setItem('bf-me', v); return v.slice(0, 20) || '访客'; }

  function fuBub(f, showType) {
    var extra = '';
    if (showType && f.ref_type === 'todo') extra = ' <span class="tag">待办跟进</span>';
    if (showType && f.ref_type === 'highlight') extra = ' <span class="tag b">要点跟进</span>';
    if (f.due_date) extra += ' <span class="muted">顺延至 ' + d10(f.due_date) + '</span>';
    return '<div class="fu-bub"><div class="fu-head">' +
      (f.author ? '<span class="fu-me">' + esc(f.author) + '</span>' : '') +
      (f.result ? '<span class="tag ' + (RCOL[f.result] || '') + '">' + esc(f.result) + '</span>' : '') +
      extra + '<span class="muted" style="margin-left:auto;font-size:11px">' + esc(f.created_at || '') + '</span></div>' +
      '<div class="tx">' + esc(f.content) + '</div></div>';
  }

  function drawTodos() {
    var list = D.todos || [];
    var open = list.filter(function (t) { return t.status === 'open'; });
    var done = list.filter(function (t) { return t.status === 'done'; });
    $('#c-todo-n').textContent = open.length + ' 未完成';
    $('#todo-empty').style.display = open.length ? 'none' : 'block';
    $('#todos').innerHTML = open.concat(done).map(function (t) {
      return '<div class="todo-row ' + (t.status === 'done' ? 'done' : '') + '" data-id="' + t.id + '">' +
        '<button class="chk ' + (t.status === 'done' ? 'on' : '') + '" data-act="toggle" title="处理（完成/重开）">✓</button>' +
        '<div class="tx" style="min-width:0">' + esc(t.content) +
        '<div class="meta">' +
        (t.due_date ? '<span class="tag ' + (t.overdue ? 'r' : '') + '">' + d10(t.due_date) + (t.overdue ? ' 已超期' : '') + '</span>' : '<span class="muted">无期限</span>') +
        '<span class="tag ' + (t.priority === '高' ? 'r' : t.priority === '低' ? '' : 'y') + '">' + esc(t.priority || '中') + '</span>' +
        fuMark(t) +
        (t.status === 'done' && t.done_by ? '<span class="todo-done-tag">已由' + esc(t.done_by) + '处理</span>' : '') +
        '</div>' +
        '<div class="toolbar" data-tb="1" style="margin-top:4px"><button data-act="openfu">✍ 写跟进</button></div>' +
        fuPanel(t.id, 'todo') +
        '</div>' +
        '</div>';
    }).join('');
    bindRows();
  }
  function drawHls() {
    var list = D.highlights || [];
    $('#c-hl-n').textContent = list.length + ' 条';
    $('#hls').innerHTML = list.length ? list.map(function (h) {
      return '<div class="hl-item" data-id="' + h.id + '">' +
        '<span class="tag ' + (h.kind === '风险' ? 'r' : h.kind === '承诺' ? 'y' : h.kind === '决策' ? 'g' : 'b') + '">' + esc(h.kind || '结论') + '</span>' +
        esc(h.content) +
        '<div class="meta" style="margin-top:2px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">' + fuMark(h) +
        '<span class="toolbar" data-tb="1"><button data-act="openfu">✍ 写跟进</button></span></div>' +
        fuPanel(h.id, 'highlight', true) +
        '</div>';
    }).join('') : '<div class="muted" style="font-size:12px">暂无要点</div>';
    bindRows();
  }
  // 通用跟进展开面板
  function fuPanel(refId, rt, canOpen) {
    return '<div class="open-fu" data-ref="' + refId + '" data-rt="' + rt + '">' +
      '<textarea rows="2" placeholder="写这条' + (rt === 'todo' ? '待办' : '要点') + '的跟进进展…（结果档选已闭环=完成）"></textarea>' +
      '<div class="chips" data-res="1" style="margin:6px 0">' + RES.map(function (r) { return '<span class="chip" data-r="' + r + '">' + r + '</span>'; }).join('') + '</div>' +
      '<div class="rowflex"><button class="btn sm pri" data-act="fu-save">保存跟进</button>' +
      '<button class="btn sm" data-act="fu-cancel">收起</button></div>' +
      '</div>';
  }
  function drawFu() {
    var list = D.followups || [];
    $('#c-fu-n').textContent = list.length ? '共 ' + list.length + ' 条' : '';
    $('#fu-list').innerHTML = list.length ? list.map(function (f) { return fuBub(f, false); }).join('')
      : '<div class="muted" style="font-size:12px">还没有客户级跟进记录</div>';
  }
  function bindRows() {
    // 完成/重开待办
    Array.prototype.forEach.call(document.querySelectorAll('#todos [data-act="toggle"]'), function (b) {
      b.onclick = async function () {
        if (!checkMe()) return;
        var row = b.closest('.todo-row');
        var t = (D.todos || []).filter(function (x) { return x.id === row.dataset.id; })[0];
        var r = await post(API + '/action', { kind: 'todo_done', todo_id: t.id, value: t.status !== 'done', author: who() });
        if (!r.ok) { alert(r.err || '操作失败'); return; }
        t.status = t.status === 'done' ? 'open' : 'done'; t.done_by = t.status === 'done' ? who() : '';
        drawTodos(); toast('已' + (t.status === 'done' ? '完成' : '重开'));
      };
    });
    // 写跟进：展开/收起（待办与沉淀要点通用）
    Array.prototype.forEach.call(document.querySelectorAll('[data-act="openfu"]'), function (b) {
      b.onclick = function () {
        var host = b.closest('.todo-row') || b.closest('.hl-item');
        host.querySelector('.open-fu').classList.add('show');
        b.style.display = 'none';
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-act="fu-cancel"]'), function (b) {
      b.onclick = function () {
        var host = b.closest('.todo-row') || b.closest('.hl-item');
        host.querySelector('.open-fu').classList.remove('show');
        var tb = host.querySelector('[data-tb] button');
        if (tb) tb.style.display = '';
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll('.open-fu .chip'), function (c) {
      if (c.dataset.bound) return; c.dataset.bound = '1';
      c.onclick = function () {
        var box = c.closest('.chips');
        box.querySelectorAll('.chip').forEach(function (x) { x.classList.remove('on'); });
        c.classList.add('on');
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-act="fu-save"]'), function (b) {
      b.onclick = async function () {
        if (!checkMe()) return;
        var panel = b.closest('.open-fu');
        var host = b.closest('.todo-row') || b.closest('.hl-item');
        var refId = panel.dataset.ref, rt = panel.dataset.rt;
        var content = panel.querySelector('textarea').value.trim();
        var res = '';
        panel.querySelectorAll('.chip.on').forEach(function (c) { res = c.dataset.r; });
        var r = await post(API + '/action', { kind: 'followup', ref_type: rt, ref_id: refId, content: content, result: res, author: who() });
        if (!r.ok) { alert(r.err || '保存失败'); return; }
        panel.querySelector('textarea').value = '';
        panel.querySelectorAll('.chip').forEach(function (x) { x.classList.remove('on'); });
        panel.classList.remove('show');
        var tb = host.querySelector('[data-tb] button');
        if (tb) tb.style.display = '';
        toast('跟进已记录'); refresh();
      };
    });
  }

  var toastT = null;
  function toast(m) {
    var t = $('#toast') || (function () {
      var d = document.createElement('div'); d.id = 'toast'; d.className = 'toast';
      document.body.appendChild(d); return d;
    })();
    t.textContent = m; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(function () { t.hidden = true; }, 2200);
  }
  function refresh() {
    return fetch(API).then(function (r) { return r.json(); }).then(function (d) {
      if (!d.ok) { showErr(d.err || '链接无效或已停用'); return; }
      D = d;
      render();
    }).catch(function (e) { showErr('无法连接服务器：' + e.message + '（请确认 8897 服务已启动，且与电脑在同一网络）'); });
  }
  function showErr(msg) {
    var e = $('#err');
    e.hidden = false;
    e.innerHTML = '<div><b style="font-size:16px">页面暂时无法加载</b><br><br>' + esc(msg) + '</div>';
    var w = $('#wrap'); if (w) w.style.display = 'none';
  }
  window.addEventListener('error', function (ev) {
    var e = $('#err');
    if (e && e.hidden) showErr('脚本异常：' + (ev.message || '未知错误'));
  });
  function render() {
    var c = D.customer;
    document.title = c.name + ' · 客户跟进';
    $('#c-name').textContent = c.name;
    var meta = [];
    if (c.contact_name) meta.push('联系人 ' + c.contact_name + (c.contact_phone ? ' ' + c.contact_phone : ''));
    if (c.sales) meta.push('对接业务员 ' + c.sales);
    if (c.owner) meta.push('跟进负责人 ' + c.owner);
    if (c.level) meta.push(c.level);
    meta.push(c.visit_count + ' 次拜访');
    $('#c-meta').textContent = meta.join(' · ');
    $('#calls-card').style.display = D.calls.length ? 'block' : 'none';
    $('#c-call-n').textContent = D.calls.length + ' 次';
    $('#calls').innerHTML = D.calls.map(function (x) {
      return '<div class="call-line"><b>' + esc(x.title || '通话') + '</b> ' +
        (x.visit_type ? '<span class="tag">' + esc(x.visit_type) + '</span>' : '') +
        '<span class="muted" style="margin-left:6px">' + esc(d10(x.visited_at)) + '</span>' +
        '<div class="muted">' + esc(x.summary || '') + '</div></div>';
    }).join('');
    drawHls();
    drawTodos();
    drawFu();
  }
  function boot() {
    $('#me').value = me;
    $('#me').onchange = function () { who(); };
    $('#fu-res').innerHTML = RES.map(function (r) { return '<span class="chip" data-r="' + r + '">' + r + '</span>'; }).join('');
    var curRes = '';
    $('#fu-res').querySelectorAll('.chip').forEach(function (c) {
      c.onclick = function () {
        curRes = c.dataset.r;
        $('#fu-res').querySelectorAll('.chip').forEach(function (x) { x.classList.remove('on'); });
        c.classList.add('on');
      };
    });
    $('#fu-save').onclick = async function () {
      if (!checkMe()) return;
      var content = $('#fu-in').value.trim();
      var closed = curRes === '已闭环';
      var r = await post(API + '/action', { kind: 'followup', ref_type: 'customer', ref_id: D.customer.id, content: content, result: curRes, closed: closed, author: who() });
      if (!r.ok) { alert(r.err || '保存失败'); return; }
      $('#fu-in').value = '';
      $('#fu-res').querySelectorAll('.chip').forEach(function (x) { x.classList.remove('on'); });
      curRes = '';
      toast(closed ? '已记录（闭环）' : '跟进已记录');
      refresh();
    };
    refresh();
  }
  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading') boot();
})();
