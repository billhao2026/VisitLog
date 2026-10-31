import json, urllib.request, sys
sys.stdout.reconfigure(encoding='utf-8')
op = urllib.request.build_opener(urllib.request.ProxyHandler({}))

def post(path, obj):
    req = urllib.request.Request('http://localhost:8897' + path,
                                 data=json.dumps(obj).encode('utf-8'),
                                 headers={'Content-Type': 'application/json'}, method='POST')
    return json.loads(op.open(req, timeout=60).read().decode('utf-8'))

# (错, 对, 说明) —— 全部来自 2026-09-03 上传的 3 通真实录音
PAIRS = [
    ("窟窿浩克", "昆仑浩克", "中石油电商平台"),
    ("中实化", "中石化", "客户集团"),
    ("正采云", "政采云", "政采平台"),
    ("奔土", "奔图", "打印机品牌"),
    ("弊端", "B端", "行业术语"),
    ("物区", "误区", "常用词"),
    ("议题机", "一体机", "产品名"),
    ("行号", "型号", "行业术语"),
    ("纸账号", "子账号", "平台术语"),
    ("白工用品", "办公用品", "品类"),
    ("老宝", "劳保", "品类"),
    ("独善子实话", "独山子石化", "客户单位"),
    ("独山子实话", "独山子石化", "客户单位"),
    ("快乐实话", "库尔勒石化", "客户单位"),
    ("去铝约", "去履约", "行业术语"),
    ("加能力萌", "佳能爱普生", "打印机品牌"),
    ("有利用的", "有利润的", "常用表达"),
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
