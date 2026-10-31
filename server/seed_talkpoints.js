// 一次性种子：给「超 30 天未联系」客户灌入聊点话术
//
// ⚠️ 这是一个**通用示例**，不含任何真实客户信息。
//    原脚本里是逐客户的真实业务数据（含客户名、供应商、底价与利润结构），
//    开源版一律用占位客户名，真实话术请在自己的实例上通过界面维护，
//    或改用环境变量提供的数据文件。
//
// 用法：
//   node server/seed_talkpoints.js
//
// 界面入口：跟进唤醒台 → 每个客户的「重点聊 ①②③」与「上次事项进展」都可直接编辑，
//         编辑后写回 fu_talkpoints 表，无需重复跑本脚本。
const { all, get, run, now } = require('./db.js');

// 示例数据：客户名需与 customers 表里的 name 完全一致才会写入
// 真实使用时：把下面替换成你自己的客户，或直接跳过本脚本、在界面里手工填
const DATA = [
  ['示例客户A',
   '① 上次约定的方案已提交，等待对方内部确认',
   '① 确认上次方案的反馈与下一步',
   '② 本季度预算与采购节奏',
   '③ 新品关注点与试用意愿',
  ],
  ['示例客户B',
   '① 报价已发出，尚未收到明确答复',
   '① 报价反馈与议价空间',
   '② 交付与账期安排',
   '③ 竞品对比与切换成本',
  ],
  ['示例客户C',
   '① 上门演示后无明确反馈，需再次触达',
   '① 演示效果确认',
   '② 后续服务支持方式',
   '③ 合作模式探讨',
  ],
];

let n = 0;
for (const [name, pending, t1, t2, t3] of DATA) {
  const c = get('SELECT id FROM customers WHERE name=?', name);
  if (!c) { console.log('跳过（无此客户）:', name); continue; }
  run(`INSERT INTO fu_talkpoints(customer_id,pending_items,talk1,talk2,talk3,updated_at)
       VALUES(?,?,?,?,?,?)
       ON CONFLICT(customer_id) DO UPDATE SET
         pending_items=excluded.pending_items, talk1=excluded.talk1,
         talk2=excluded.talk2, talk3=excluded.talk3, updated_at=excluded.updated_at`,
    c.id, pending, t1, t2, t3, now());
  n++;
}
console.log('已写入话术聊点:', n, '/', DATA.length);
