// 拜访志 · 界面截图工具（macOS 自带 WebKit，无需额外依赖）
//
// 用法：
//   swift scripts/screenshot.swift <URL> <输出PNG> [等待秒数] [宽] [高]
//
// 例：
//   swift scripts/screenshot.swift http://localhost:8897/ /tmp/home.png 3
//
// ⚠️ 已知限制（务必先读）：
//   headless WKWebView 里 ECharts 画不出数据图形 —— bar / line / scatter 全部
//   只剩坐标轴和网格线，数据系列丢失。已用 ECharts 官方最简 demo 复现
//   （data:[10,20,30,40] 同样只有坐标轴），确认是 WebKit headless 的缺陷，
//   与本项目代码无关；纯 HTML div 和 SVG rect 在同环境下能正常渲染。
//
//   需要含图表的截图时，改用 scripts/screenshot.js（真实 Safari，需先开
//   Safari → 开发 → 允许远程自动化），或由用户在浏览器里手动截图。
import Cocoa
import WebKit

let args = CommandLine.arguments
guard args.count >= 3 else {
    print("用法: swift scripts/screenshot.swift <URL> <输出PNG> [等待秒] [宽] [高] [点击选择器] [裁剪高度]")
    exit(1)
}
let urlStr = args[1]
let outPath = args[2]
let waitSec = args.count > 3 ? Double(args[3]) ?? 3.0 : 3.0
let width = args.count > 4 ? Int(args[4]) ?? 1440 : 1440
let height = args.count > 5 ? Int(args[5]) ?? 900 : 900
// 可选第 6 个参数：截图前先点击该 CSS 选择器（用于打开抽屉等交互态）
let clickSel = args.count > 6 && args[6] != "-" ? args[6] : nil
// 可选第 7 个参数：只截取顶部 N 像素（用于避开渲染受限的图表区）
let cropH = args.count > 7 ? Int(args[7]) ?? 0 : 0

guard let url = URL(string: urlStr) else {
    print("无效 URL: \(urlStr)")
    exit(1)
}

final class Shooter: NSObject, WKNavigationDelegate {
    let webView: WKWebView
    let outPath: String
    let waitSec: Double
    var clickSelector: String?
    var done = false

    init(frame: NSRect, outPath: String, waitSec: Double) {
        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "allowFileAccessFromFileURLs")
        self.webView = WKWebView(frame: frame, configuration: config)
        self.outPath = outPath
        self.waitSec = waitSec
        self.clickSelector = nil
        super.init()
        self.webView.navigationDelegate = self
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // 等页面里的数据请求与图表渲染完成
        let deadline = Date().addingTimeInterval(waitSec)
        func tick() {
            if Date() >= deadline { clickThenShoot(); return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { tick() }
        }
        tick()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        FileHandle.standardError.write("加载失败: \(error.localizedDescription)\n".data(using: .utf8)!)
        exit(1)
    }

    func webView(_ webView: WKWebView,
                 didFailProvisionalNavigation navigation: WKNavigation!,
                 withError error: Error) {
        FileHandle.standardError.write("加载失败: \(error.localizedDescription)\n".data(using: .utf8)!)
        exit(1)
    }

    // 点击指定元素（用于打开抽屉等交互态），等待渲染后再截图
    func clickThenShoot() {
        guard let sel = clickSelector else { shoot(); return }
        let js = "(() => { const el = document.querySelector('\(sel)'); if (!el) return 'no-el'; el.click(); return 'clicked:' + (el.onclick ? 'has-handler' : 'NO-HANDLER'); })()"
        webView.evaluateJavaScript(js) { res, err in
            let msg = res.map { String(describing: $0) } ?? ("err:" + (err?.localizedDescription ?? "-"))
            FileHandle.standardError.write("点击 \(sel) → \(msg)\n".data(using: .utf8)!)
            DispatchQueue.main.asyncAfter(deadline: .now() + 3.5) {
                self.webView.evaluateJavaScript("document.querySelector('#drawer') ? ('drawer-hidden=' + document.querySelector('#drawer').hidden) : 'no-drawer'") { r2, _ in
                    let m2 = r2.map { String(describing: $0) } ?? "?"
                    FileHandle.standardError.write("  状态: \(m2)\n".data(using: .utf8)!)
                    self.shoot()
                }
            }
        }
    }

    func shoot() {
        // WebKit 的 takeSnapshot 不捕获 canvas 的 GPU 加速层，
        // 会导致 ECharts 图表在截图里只剩坐标轴、没有数据柱。
        // 解决：截图前把图表用 SVG 渲染器重建（SVG 是 DOM，一定会被快照捕获）。
        let freeze = """
        (() => {
          if (!window.echarts) return 0;
          let n = 0;
          for (const el of document.querySelectorAll('.chart')) {
            try {
              const inst = window.echarts.getInstanceByDom(el);
              if (!inst) continue;
              const opt = inst.getOption();
              inst.dispose();
              const c2 = window.echarts.init(el, null, { renderer: 'svg' });
              c2.setOption(opt);
              n++;
            } catch (e) {}
          }
          return n;
        })()
        """
        webView.evaluateJavaScript(freeze) { result, _ in
            let cnt = (result as? Int) ?? -1
            if cnt == 0 { FileHandle.standardError.write("警告: 没有图表被转成 SVG\n".data(using: .utf8)!) }
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
                self.takeShot()
            }
        }
    }

    func takeShot() {
        let cfg = WKSnapshotConfiguration()
        let h = cropH > 0 ? CGFloat(cropH) : webView.bounds.size.height
        cfg.rect = CGRect(origin: .zero, size: CGSize(width: webView.bounds.size.width, height: h))
        webView.takeSnapshot(with: cfg) { image, error in
            guard let image = image else {
                FileHandle.standardError.write("截图失败: \(error?.localizedDescription ?? "未知")\n".data(using: .utf8)!)
                exit(1)
            }
            self.save(image)
        }
    }

    // 备用路径：把 webView 画进 bitmap（能捕获 canvas 的 GPU 层）
    func shootViaView() {
        let size = webView.bounds.size
        let rep = NSBitmapImageRep(bitmapDataPlanes: nil,
                                   pixelsWide: Int(size.width * 2),
                                   pixelsHigh: Int(size.height * 2),
                                   bitsPerSample: 8, samplesPerPixel: 4,
                                   hasAlpha: true, isPlanar: false,
                                   colorSpaceName: .deviceRGB,
                                   bytesPerRow: 0, bitsPerPixel: 0)!
        rep.size = size
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
        webView.draw(webView.bounds)
        NSGraphicsContext.restoreGraphicsState()
        if let image = rep.representation(using: .png, properties: [:]) {
            try? image.write(to: URL(fileURLWithPath: outPath))
            print("✅ 已保存 \(outPath) (\(Int(size.width))×\(Int(size.height))) [draw 路径]")
        }
        exit(0)
    }

    func save(_ image: NSImage) {
        // NSImage → NSBitmapImageRep → PNG
        guard let tiff = image.tiffRepresentation,
              let rep = NSBitmapImageRep(data: tiff),
              let data = rep.representation(using: .png, properties: [:]) else {
            FileHandle.standardError.write("PNG 编码失败\n".data(using: .utf8)!)
            exit(1)
        }
        do {
            try data.write(to: URL(fileURLWithPath: self.outPath))
            print("✅ 已保存 \(self.outPath) (\(Int(image.size.width))×\(Int(image.size.height)))")
            exit(0)
        } catch {
            FileHandle.standardError.write("写文件失败: \(error)\n".data(using: .utf8)!)
            exit(1)
        }
    }
}

let app = NSApplication.shared
// .regular 而不是 .accessory：offscreen 的 accessory app 不走 GPU 合成路径，
// canvas 的矩形图元（ECharts 柱状图）会静默丢失，只剩坐标轴与网格线。
app.setActivationPolicy(.regular)

let frame = NSRect(x: 0, y: 0, width: width, height: height)
let shooter = Shooter(frame: frame, outPath: outPath, waitSec: waitSec)
shooter.clickSelector = clickSel

// 放进真实窗口：给 WebView 一个可见的渲染上下文
let window = NSWindow(contentRect: frame,
                       styleMask: [.titled, .closable, .resizable],
                       backing: .buffered, defer: false)
window.contentView = shooter.webView
window.title = "shot"
window.orderFrontRegardless()
app.activate(ignoringOtherApps: true)

shooter.webView.load(URLRequest(url: url))

let deadline = Date().addingTimeInterval(waitSec + 20)
while !shooter.done && Date() < deadline {
    RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.1))
}
exit(1)
