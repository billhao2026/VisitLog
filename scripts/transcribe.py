# -*- coding: utf-8 -*-
"""拜访志 · 语音转写
用法: python transcribe.py <音频路径> <输出JSON路径> [模型目录]
关键: 只传 hotwords，绝不传 prefix / initial_prompt
      （faster-whisper 源码: `if hotwords and not prefix` → 传了会让 hotwords 静默失效）
"""
import sys, os, time, json
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

DEFAULT_MODEL = "C:/Users/yafo/.workbuddy/binaries/whisper-models/base"

AUDIO = Path(sys.argv[1])
OUT = Path(sys.argv[2])
MODEL = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else DEFAULT_MODEL
if not os.path.isdir(MODEL):
    MODEL = DEFAULT_MODEL

# 行业基础热词（硬编码，兜底）
BASE_HOTWORDS = (
    "客户 拜访 需求 报价 报价单 合同 账期 付款 发票 对账 回款 询价 比价 "
    "产品 型号 规格 参数 样品 试用 测试 交期 发货 物流 到货 现货 库存 "
    "售后 维修 退货 投诉 竞品 预算 决策 采购 下单 订单 折扣 中标 招标 "
    "方案 演示 进度 会议 回访 满意度 授权 代理 上架 上价 "
    "耗材 硒鼓 碳粉 墨盒 粉盒 鼓架 芯片 兼容 原装 国产 "
    "打印机 复印机 一体机 针式 喷墨 激光 彩色 黑白 "
    "惠普 佳能 爱普生 兄弟 联想 得力 奔图 立思辰 理光 柯尼卡 美能达 夏普 京瓷 东芝 "
    "政采 政府采购 京东 天猫 苏宁 平台 电商 采购人 商家 渠道 经销商 批发 零售 "
    "老板 总监 经理 主任 工程师 财务 采购部"
)

# 动态热词：由 server/asr.js 从 terms 表导出（新增术语自动生效，源头提升识别率）
def _load_extra():
    if len(sys.argv) > 4 and sys.argv[4]:
        p = Path(sys.argv[4])
        try:
            if p.is_file():
                return p.read_text(encoding="utf-8").split()
        except Exception as e:
            print(f"[ASR] 动态热词读取失败（{e}），仅用基础热词", flush=True)
    return []


def _merge(base, extra):
    seen, out = set(), []
    for w in base.split() + list(extra):
        w = (w or "").strip()
        if w and w not in seen:
            seen.add(w)
            out.append(w)
    return " ".join(out)


HOTWORDS = _merge(BASE_HOTWORDS, _load_extra())


def fmt_ts(sec):
    h = int(sec // 3600)
    m = int(sec % 3600 // 60)
    s = int(sec % 60)
    return f"{h:02d}:{m:02d}:{s:02d}"


def fail(msg):
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"ok": False, "error": msg}, ensure_ascii=False), encoding="utf-8")
    print(f"TRANSCRIBE_DONE {OUT}", flush=True)
    sys.exit(1)


def main():
    t0 = time.time()
    try:
        from faster_whisper import WhisperModel
    except Exception as e:
        fail(f"faster-whisper 不可用: {e}")

    if not AUDIO.exists():
        fail(f"音频不存在: {AUDIO}")

    try:
        print(f"[ASR] 加载模型 {MODEL}", flush=True)
        model = WhisperModel(MODEL, device="cpu", compute_type="int8")
        print(f"[ASR] 开始转写 {AUDIO.name}", flush=True)

        def try_config(vad, hot, bsize=5, cond=True):
            kwargs = dict(
                language="zh",
                beam_size=bsize,
                condition_on_previous_text=cond,
                temperature=[0.0, 0.2, 0.4, 0.6, 0.8, 1.0],
            )
            if hot:
                kwargs["hotwords"] = HOTWORDS
            if vad:
                kwargs["vad_filter"] = True
                kwargs["vad_parameters"] = dict(min_silence_duration_ms=500, speech_pad_ms=200)
            return model.transcribe(str(AUDIO), **kwargs)

        def collect(vad, hot, bsize=5, cond=True, ns=None):
            segs = []
            parts = []
            segments, info = try_config(vad, hot, bsize, cond)
            for seg in segments:
                text = seg.text.strip()
                if not text:
                    continue
                segs.append({"start": round(seg.start, 2), "end": round(seg.end, 2), "text": text})
                parts.append(f"[{fmt_ts(seg.start)} - {fmt_ts(seg.end)}] {text}")
            return segs, parts, info

        # 四级降级阶梯：VAD+热词 → 无VAD+热词 → 无VAD无热词 → 最保守配置
        # 触发降级的条件有二：① 抛异常 ② 覆盖率过低（VAD 把大部分语音滤掉了）
        LADDER = [
            (True, True, 5, True, 0.6),
            (False, True, 5, True, 0.35),
            (False, False, 5, True, 0.35),
            (False, False, 1, False, 0.35),
        ]
        MIN_COVER = 0.18  # 语音时长 / 音频时长 低于此值判定为漏检

        def cover(segs, dur):
            if not segs or not dur:
                return 0.0
            return sum(max(0.0, s["end"] - s["start"]) for s in segs) / dur

        segs = parts = info = None
        best = None
        for i, (vad, hot, bsize, cond, ns) in enumerate(LADDER):
            try:
                segs, parts, info = collect(vad, hot, bsize, cond, ns)
            except Exception as e:
                if i == len(LADDER) - 1:
                    raise
                print(f"[ASR] 配置{i+1} 失败（{e}），降级重试", flush=True)
                continue
            dur = float(info.duration or 0)
            cv = cover(segs, dur)
            print(f"[ASR] 配置{i+1}: {len(segs)}段 / 音频{dur:.0f}s / 语音覆盖{cv:.0%}", flush=True)
            if best is None or len(segs) > len(best[0]):
                best = (segs, parts, info)
            if cv >= MIN_COVER or i == len(LADDER) - 1:
                break
            print(f"[ASR] 覆盖率 {cv:.0%} 低于 {MIN_COVER:.0%}，判定漏检，降级重试", flush=True)

        segs, parts, info = best

        data = {
            "ok": True,
            "duration": round(float(info.duration or 0), 1),
            "language": getattr(info, "language", "zh"),
            "text": "\n".join(parts),
            "segments": segs,
            "seconds": round(time.time() - t0, 1),
        }
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        print(f"[ASR] 完成 {len(segs)} 段，耗时 {time.time()-t0:.0f}s", flush=True)
        print(f"TRANSCRIBE_DONE {OUT}", flush=True)
    except Exception as e:
        fail(str(e))


if __name__ == "__main__":
    main()
