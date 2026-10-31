// 拜访志 · 页面渲染自检
//
// 在真实 WebKit 里逐页渲染，报告每个页面的：
//   - 正文是否有实质内容
//   - 图表容器尺寸、ECharts 实例、series 数、数据点数
//
// 用法：
//   node scripts/check-render.js [基础地址]
//   node scripts/check-render.js http://localhost:8897
//
// 退出码：0=全部正常，1=有渲染问题
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE = process.argv[2] || 'http://localhost:8897';
const ROUTES = ['home', 'calls', 'todos', 'highlights', 'flags', 'customers', 'dict', 'journal', 'followups'];

// ── 页面内探测脚本（对当前页面求值，同步返回 JSON 字符串）──
const PROBE = `
(() => {
  const info = { charts: [] };
  for (const el of document.querySelectorAll('.chart')) {
    const rect = el.getBoundingClientRect();
    const c = { id: el.id, w: Math.round(rect.width), h: Math.round(rect.height),
                hasInstance: false, seriesCount: 0, dataPoints: 0, error: null };
    try {
      if (window.echarts) {
        const inst = window.echarts.getInstanceByDom(el);
        if (inst) {
          c.hasInstance = true;
          const opt = inst.getOption();
          const ss = opt.series || [];
          c.seriesCount = ss.length;
          for (const s of ss) if (Array.isArray(s.data)) c.dataPoints += s.data.length;
        } else { c.error = '无 ECharts 实例'; }
      } else { c.error = 'echarts 未加载'; }
    } catch (e) { c.error = String(e); }
    info.charts.push(c);
  }
  const main = document.querySelector('#view') || document.body;
  const text = (main.innerText || '').trim();
  info.textLen = text.length;
  info.title = (main.querySelector('h2') || {}).innerText || '';
  info.hasEmpty = text.length < 80;
  return JSON.stringify(info);
})()
`;

// ── Swift 驱动：逐页切 hash → 等待 → 求值 ──
const SWIFT = `
import Cocoa
import WebKit

let base = CommandLine.arguments[1]
let routes = CommandLine.arguments[2].split(separator: ",").map(String.init)
let probe = CommandLine.arguments[3]

final class Runner: NSObject, WKNavigationDelegate {
    let webView: WKWebView
    var results: [String] = []
    var idx = 0

    init(frame: NSRect) {
        let cfg = WKWebViewConfiguration()
        cfg.preferences.setValue(true, forKey: "developerExtrasEnabled")
        self.webView = WKWebView(frame: frame, configuration: cfg)
        super.init()
        self.webView.navigationDelegate = self
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.5) { self.step() }
    }

    func step() {
        if idx >= routes.count {
            print(results.joined(separator: "\\n"))
            exit(0)
        }
        let route = routes[idx]
        webView.evaluateJavaScript("location.hash = '#/" + route + "'") { _, _ in
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.6) {
                self.webView.evaluateJavaScript(probe) { result, error in
                    if let error = error {
                        self.results.append("{\\"route\\":\\"\\(route)\\",\\"error\\":\\"\\(error.localizedDescription)\\"}")
                    } else if let r = result {
                        // 探测结果里补上 route 字段，便于定位
                        var json = String(describing: r)
                        if json.hasPrefix("{") {
                            json = "{\\"route\\":\\"\\(route)\\\"," + String(json.dropFirst())
                        }
                        self.results.append(json)
                    } else {
                        self.results.append("{\\"route\\":\\"\\(route)\\",\\"error\\":\\"no result\\"}")
                    }
                    self.idx += 1
                    self.step()
                }
            }
        }
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let r = Runner(frame: NSRect(x: 0, y: 0, width: 1440, height: 900))
r.webView.load(URLRequest(url: URL(string: base)!))

// 必须跑 RunLoop，否则 DispatchQueue.main 回调不会执行
let deadline = Date().addingTimeInterval(90)
while Date() < deadline {
    RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.1))
}
exit(0)
`;

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vl-render-'));
const swiftPath = path.join(tmpDir, 'probe.swift');
fs.writeFileSync(swiftPath, SWIFT, 'utf8');

let raw;
try {
  raw = execFileSync('swift', [swiftPath, BASE, ROUTES.join(','), PROBE], {
    encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024,
  });
} catch (e) {
  console.error('自检执行失败:', e.message);
  console.error((e.stderr || '').slice(0, 600));
  process.exit(1);
}

const lines = raw.trim().split('\n').filter(l => l.trim().startsWith('{'));
if (!lines.length) {
  console.error('未拿到探测结果，原始输出:\n', raw.slice(0, 600));
  process.exit(1);
}

// 先问一句「库里有没有数据」——空库时页面内容短是正常的。
// 本文件是 CommonJS，不能用顶层 await；这里用同步的 child_process
// 调 curl 取，避免异步赋值带来的竞态。
let DATA_COUNT = 0;
try {
  const raw = execFileSync('curl', ['-s', '--max-time', '5', `${BASE}/api/stats`],
    { encoding: 'utf8' });
  const j = JSON.parse(raw);
  DATA_COUNT = (j.stats && (j.stats.total || 0)) || 0;
} catch (e) { /* 拿不到就按 0 处理，等下页面自检会暴露问题 */ }

console.log('=== 页面渲染自检 ===');
console.log(`目标: ${BASE}`);
console.log(`数据量: ${DATA_COUNT} 条${DATA_COUNT ? '' : '（空库，页面内容少属正常）'}\n`);

let problems = 0;
for (const line of lines) {
  let info;
  try { info = JSON.parse(line); } catch (e) {
    console.log(`❌ 解析失败: ${line.slice(0, 120)}`);
    problems++;
    continue;
  }
  const route = info.route || '?';
  if (info.error) {
    console.log(`❌ ${route.padEnd(11)} 探测出错: ${info.error}`);
    problems++;
    continue;
  }
  // 空库时页面本来就短（没有通话、没有待办），这不是渲染故障。
  // 所以先看库里有无数据：有数据才要求正文充实、图表有数据点；
  // 空库只要求「页面骨架渲染出来了」（标题存在、容器有尺寸、脚本没报错）。
  const hasData = DATA_COUNT > 0;
  const ok = hasData ? !info.hasEmpty : !!info.title;
  if (!ok) problems++;
  const tag = hasData ? '' : '  (空库)';
  console.log(`${ok ? '✅' : '❌'} ${route.padEnd(11)} ${(info.title || '—').padEnd(10)} 正文 ${String(info.textLen).padStart(5)} 字${tag}`);
  for (const c of (info.charts || [])) {
    // 空库时图表没有数据点是正常的，只要实例在、容器有尺寸即可
    const cok = c.hasInstance && c.w > 0 && c.h > 0 && (hasData ? (c.seriesCount > 0 && c.dataPoints > 0) : true);
    if (!cok) problems++;
    console.log(`   ${cok ? '✅' : '❌'} ${c.id.padEnd(10)} ${String(c.w).padStart(4)}×${String(c.h).padEnd(4)} 实例:${c.hasInstance ? '有' : '无'} series:${c.seriesCount} 数据点:${c.dataPoints}${c.error ? '  ← ' + c.error : ''}`);
  }
}

console.log('');
if (problems) {
  console.log(`⚠️  发现 ${problems} 处渲染问题`);
  process.exit(1);
} else {
  console.log('✅ 全部页面渲染正常');
}
