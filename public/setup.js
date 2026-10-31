/* 拜访志 · 系统设置抽屉：轻量开关 + 空间管理 */
window.Setup = (function () {
  const { $, $$, get, post, esc, toast, drawer } = App;

  async function refresh(st) {
    const box = $('#set-space');
    if (!box || !st) return;
    const a = st.audio || {}, m = st.model || {};
    box.innerHTML = `
      <div class="rowflex" style="padding:7px 0;border-bottom:1px dotted var(--rule2)">
        <span class="muted" style="font-size:12px">原始录音</span><span class="grow"></span>
        <b>${a.totalMB || 0} MB</b>
        <span class="muted" style="font-size:11px">（已分析可清理 ${a.deletable || 0} 段）</span>
      </div>
      <div class="rowflex" style="padding:7px 0;border-bottom:1px dotted var(--rule2)">
        <span class="muted" style="font-size:12px">语音模型</span><span class="grow"></span>
        <b>${m.cur === 'small' ? m.smallMB : m.baseMB} MB</b>
        <span class="muted" style="font-size:11px">当前 ${m.cur === 'small' ? '标准(small)' : '轻量(base)'}</span>
      </div>
      <div class="rowflex" style="padding:7px 0;border-bottom:1px dotted var(--rule2)">
        <span class="muted" style="font-size:12px">自动备份</span><span class="grow"></span>
        <b>${st.backups.n} 份</b><span class="muted" style="font-size:11px">${st.backups.mb} MB</span>
      </div>
      <div class="rowflex" style="padding:7px 0">
        <span class="muted" style="font-size:12px">数据库 / 中间文件</span><span class="grow"></span>
        <b>${(+st.db.mb).toFixed(1)} / ${st.asrJson} MB</b>
      </div>`;
  }

  async function open() {
    const s = await get('/api/settings');
    const st = await get('/api/storage');
    const set = s.settings;
    if (!s.ok) return;

    drawer(`
      <div class="eyebrow">System</div>
      <h2 style="font-size:22px;margin-bottom:4px">系统设置</h2>
      <p class="muted" style="font-size:12.5px;margin-bottom:18px">轻量化偏好 · 转写模型 · 录音保留 · 空间清理</p>

      <div class="card" style="background:var(--soft);border-color:var(--accent);margin-bottom:18px">
        <div class="rowflex" style="gap:10px;align-items:center">
          <span style="font-size:22px">📖</span>
          <div class="grow">
            <b style="font-size:13.5px">系统介绍与操作手册</b>
            <div class="muted" style="font-size:11.5px">五章：系统定位 · 功能全景 · 操作手册 · 对比分析 · 未来规划</div>
          </div>
          <button class="btn pri sm" id="open-manual">打开手册</button>
        </div>
      </div>

      <h3 style="font-size:13px;margin:0 0 10px">空间占用</h3>
      <div class="card" style="background:var(--paper2)" id="set-space"></div>

      <h3 style="font-size:13px;margin:20px 0 10px">🔐 局域网访问口令（防同事攻击本机）</h3>
      <div class="card" style="background:var(--paper2)">
        <div class="muted" style="font-size:12px;margin-bottom:8px">
          ${set.accessCode ? `<b style="color:var(--green)">● 已开启</b> — 局域网内其他设备访问需先输口令；<b>本机不受影响</b>，分享链接不受影响` : `<b style="color:var(--red)">○ 未开启</b> — 同一 WiFi 的任何人可直接访问全部数据与接口，建议设置口令`}
        </div>
        <div class="rowflex" style="gap:8px;align-items:flex-end">
          <div style="flex:0 0 200px"><label class="muted" style="font-size:11px">新口令（留空+保存=关闭保护）</label>
            <input id="acc-code" type="text" placeholder="输入至少 6 位口令" style="width:100%"></div>
          <button class="btn pri sm" id="acc-save">保存口令</button>
        </div>
        <div class="muted" style="font-size:11px;margin-top:8px">提示：口令请只告诉需要使用的人；忘记口令可在本机（localhost）此页重置</div>
      </div>

      <h3 style="font-size:13px;margin:20px 0 10px">转写模型</h3>
      <div class="card" style="background:var(--paper2)">
        <label class="kv" style="padding:4px 0;cursor:pointer">
          <input type="radio" name="model" value="small" ${set.model === 'small' ? 'checked' : ''} style="width:auto">
          <div class="grow"><b>标准 small</b> <span class="muted" style="font-size:11.5px">识别更准（约 ${st.model.smallMB} MB）</span></div>
        </label>
        <label class="kv" style="padding:4px 0;cursor:pointer">
          <input type="radio" name="model" value="base" ${set.model !== 'small' ? 'checked' : ''} style="width:auto">
          <div class="grow"><b>轻量 base</b> <span class="muted" style="font-size:11.5px">省约 ${Math.max(0, st.model.smallMB - st.model.baseMB)} MB，普通通话够用</span></div>
        </label>
        <div class="muted" style="font-size:11px;margin-top:6px">切换后对之后上传的录音生效（当前录音不受影响）</div>
      </div>

      <h3 style="font-size:13px;margin:20px 0 10px">原始录音保留</h3>
      <div class="card" style="background:var(--paper2)">
        <div class="rowflex" style="gap:8px">
          <select id="keep" style="flex:0 0 150px">
            <option value="7" ${st.keepDays === 7 ? 'selected' : ''}>保留 7 天</option>
            <option value="30" ${st.keepDays === 30 ? 'selected' : ''}>保留 30 天（推荐）</option>
            <option value="90" ${st.keepDays === 90 ? 'selected' : ''}>保留 90 天</option>
            <option value="0" ${st.keepDays === 0 ? 'selected' : ''}>永久保留</option>
          </select>
          <span class="muted" style="font-size:11.5px">到期自动删除原始音频（转写稿 / 摘要 / 待办全部保留），每小时巡检</span>
        </div>
        <div class="divider"></div>
        <div class="rowflex">
          <button class="btn pri sm" id="clean-now">立即清理已超期录音</button>
          <span class="grow"></span>
          <button class="btn sm" id="reload-space">刷新空间</button>
        </div>
      </div>

      <div class="divider"></div>
      <div class="muted" style="font-size:11px;line-height:1.7">
        服务进程本身仅占约 50MB 内存；转写时临时加载模型，结束后立即释放。<br>
        若长期不用转写，可把模型切到 base，磁盘再省数百 MB。
      </div>`);

    refresh(st);
    // 操作手册：新页签打开（不挤占当前工作状态）
    $('#open-manual').onclick = () => window.open('/manual.html', '_blank');
    // 口令保存：非空=开启/修改；空=关闭
    $('#acc-save').onclick = async () => {
      const v = $('#acc-code').value.trim();
      if (v && v.length < 6) return toast('口令至少 6 位');
      await post('/api/settings', { k: 'accessCode', v });
      $('#acc-code').value = '';
      toast(v ? '访问口令已设置，局域网保护已开启' : '已关闭访问口令（局域网保护解除）');
      App.closeDrawer();
    };
    $$('input[name=model]').forEach(r => r.onchange = async () => {
      const v = $$('input[name=model]').find(x => x.checked).value;
      await post('/api/settings', { k: 'model', v });
      toast('模型已切换：' + (v === 'small' ? '标准 small' : '轻量 base'));
      App.route();
    });
    $('#keep').onchange = async () => {
      await post('/api/settings', { k: 'keep_audio_days', v: $('#keep').value });
      toast('保留策略已保存');
    };
    $('#reload-space').onclick = async () => refresh(await get('/api/storage'));
    $('#clean-now').onclick = async () => {
      if (!window.confirm('将删除所有「已转写完成且超过保留期」的原始录音文件，确定？')) return;
      const r = await post('/api/cleanup', {});
      if (r.ok) {
        toast(`已清理 ${r.deleted} 段 · 释放 ${r.freedMB} MB`);
        refresh(r.storage);
      }
    };
  }

  return { open };
})();
