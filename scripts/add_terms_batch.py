import json, urllib.request, sys
sys.stdout.reconfigure(encoding='utf-8')
op = urllib.request.build_opener(urllib.request.ProxyHandler({}))

def post(path, obj):
    req = urllib.request.Request('http://localhost:8897' + path,
                                 data=json.dumps(obj).encode('utf-8'),
                                 headers={'Content-Type': 'application/json'}, method='POST')
    return json.loads(op.open(req, timeout=60).read().decode('utf-8'))

# (错, 对, 说明) —— 通用示例，演示如何批量导入语音转写常见误识别纠错
# 用法：把下面的条目替换成你自己业务里的术语，然后运行本脚本
PAIRS = [
    ("弊端", "B端", "行业术语"),
    ("物区", "误区", "常用词"),
    ("行号", "型号", "行业术语"),
    ("纸账号", "子账号", "平台术语"),
    ("去铝约", "去履约", "行业术语"),
    ("有利用的", "有利润的", "常用表达"),
    ("近距离", "竞品", "常用词"),
    ("帐欺", "账期", "行业术语"),
]

ok = skip = 0
for wrong, right, note in PAIRS:
    try:
        r = post('/api/dict/term', {"action": "add", "wrong": wrong, "right": right})
        if r.get('ok'):
            ok += 1
            rf = r.get('refixed', 0)
            if rf:
                print(f"  {wrong}→{right}  重套历史稿 {rf} 处")
        else:
            skip += 1
            print(f"  FAIL {wrong}: {r}")
    except Exception as e:
        skip += 1
        print(f"  ERR {wrong}: {e}")
print(f"DONE ok={ok} fail={skip}")
