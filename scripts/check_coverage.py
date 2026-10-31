import sqlite3, re, sys, io, os
sys.stdout.reconfigure(encoding='utf-8')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
db = sqlite3.connect(os.path.join(ROOT, "data", "calls.db"))
rows = db.execute("SELECT id, title, duration_sec, transcript FROM calls WHERE transcript IS NOT NULL").fetchall()

pat = re.compile(r"\[(\d{2}):(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2}):(\d{2})\]\s*(.*)")

def sec(h, m, s):
    return int(h) * 3600 + int(m) * 60 + int(s)

print(f"{'客户/标题':<46} {'时长':>6} {'段数':>5} {'语音时长':>7} {'覆盖率':>7} {'字数':>6}")
print("-" * 92)
for cid, title, dur, tr in rows:
    segs = []
    chars = 0
    for line in (tr or "").splitlines():
        m = pat.match(line)
        if not m:
            continue
        a = sec(*m.group(1, 2, 3))
        b = sec(*m.group(4, 5, 6))
        segs.append((a, b))
        chars += len(m.group(7).strip())
    span = sum(max(0, b - a) for a, b in segs)
    dur = float(dur or 0)
    cov = span / dur if dur else 0
    flag = "  <-- 漏检" if cov < 0.18 else ""
    print(f"{title[:44]:<46} {dur:>6.0f} {len(segs):>5} {span:>7.0f} {cov:>6.0%} {chars:>6}{flag}")
