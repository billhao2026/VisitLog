// 拜访志 · 种子数据（幂等：已有数据则跳过）
const { db, get, run, now } = require('./db.js');

const CATS = [
  ['1', '需求与意向', null],
  ['1.1', '新需求挖掘', '客户提出新的购买/合作意向，或我方主动挖掘出尚未被满足的需求'],
  ['1.2', '需求变更与追加', '已沟通的需求发生调整：规格、数量、时间、范围变化'],
  ['1.3', '意向确认与推进', '明确表态要买/要合作、推进到下一步、确认合作细节'],
  ['1.4', '预算与决策链', '谈预算金额、审批流程、谁是决策人、决策周期'],

  ['2', '报价与商务', null],
  ['2.1', '报价沟通', '首次报价、报价单讲解、报价有效期、比价'],
  ['2.2', '议价与降价要求', '客户嫌贵、要求优惠、拿别家价格压价、谈折扣'],
  ['2.3', '合同条款', '合同期限、违约责任、质保条款、合作模式条款'],
  ['2.4', '付款与账期', '谈付款方式、账期天数、开票与结算节奏（谈新增/调整）'],
  ['2.5', '逾期欠款与催收', '款项已过约定时间仍未付、需催收、坏账风险迹象'],

  ['3', '产品与方案', null],
  ['3.1', '产品咨询与选型', '问规格参数、选哪个型号、帮我配一套'],
  ['3.2', '方案讲解', '我方介绍方案、演示、讲产品优势与差异化'],
  ['3.3', '技术与适配问题', '装不上、不兼容、报错、性能不达标、环境适配'],
  ['3.4', '样品与试用', '要样品、要试用、测试结果反馈、小批量试单'],
  ['3.5', '交付与进度', '什么时候发货、生产进度、物流状态、到货时间'],

  ['4', '售后与服务', null],
  ['4.1', '使用问题', '不会用、操作咨询、日常使用中的疑问'],
  ['4.2', '投诉与不满', '明确表达不满、要说法、服务态度投诉'],
  ['4.3', '退换与维修', '要退货、要换货、报修、返修进度'],
  ['4.4', '服务响应', '催处理进度、问什么时候上门、响应时效'],
  ['4.5', '定期回访与巡检', '主动回访、满意度询问、例行巡检、使用情况跟踪'],

  ['5', '竞争与流失', null],
  ['5.1', '竞品介入', '客户提到别家在接触、别家给了更好条件、被抢单'],
  ['5.2', '份额下滑', '采购量/下单频次明确下降（基于数量或金额变化）'],
  ['5.3', '流失预警', '客户流露出不打算继续合作、减少合作、转投他人的信号'],
  ['5.4', '客户经营变动', '客户公司转型、并购、关停、换负责人、关键人离职'],

  ['6', '客情与沟通', null],
  ['6.1', '日常维护', '无具体业务事项，仅问候、维系关系、节日走动'],
  ['6.2', '约见与拜访安排', '约下次时间、定上门拜访、改约、确认行程'],
  ['6.3', '联系不上/未接通', '未接通、关机、无人接、空号（无实质对话）'],
  ['6.4', '敷衍拒绝', '接通但明确拒绝沟通、秒挂、不愿给时间'],

  ['7', '内部与协同', null],
  ['7.1', '需内部支持', '需要跨部门、上级、第三方协同才能答复'],
  ['7.2', '政策与流程咨询', '问公司政策、办理流程、规则细节'],
  ['7.3', '资料与数据需求', '要报表、要历史记录、要资料文件、查系统数据'],
];

const TERMS = [
  ['帐期', '账期'], ['报介', '报价'], ['合通', '合同'],
  ['付宽', '付款'], ['受权', '授权'], ['寻价', '询价'],
];

function seed() {
  const n = get('SELECT COUNT(*) c FROM categories').c;
  if (n > 0) {
    console.log('[seed] 字典已存在', n, '条，跳过');
    return;
  }
  const ts = now();
  let order = 0;
  for (const [id, name, criteria] of CATS) {
    const level = id.includes('.') ? 2 : 1;
    const parent = level === 2 ? id.split('.')[0] : null;
    run('INSERT INTO categories(id,parent_id,level,name,criteria,keywords,status,is_no_content,sort_order,usage_count,fixed_count,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
      id, parent, level, name, criteria || '', '[]', 'active', id === '6.3' ? 1 : 0, order++, 0, 0, ts, ts);
  }
  for (const [w, r] of TERMS) {
    try { run('INSERT INTO terms(wrong,right,hit_count,enabled,created_at) VALUES(?,?,?,?,?)', w, r, 0, 1, ts); } catch (e) {}
  }
  run("INSERT OR IGNORE INTO settings(k,v) VALUES('owner','Bill')");
  run("INSERT OR IGNORE INTO settings(k,v) VALUES('accessCode','')");
  run("INSERT OR IGNORE INTO settings(k,v) VALUES('model','base')");
  console.log('[seed] 已写入分类', CATS.length, '条，术语', TERMS.length, '条');
}

module.exports = { seed };

if (require.main === module) {
  seed();
  const t = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
  console.log('[tables]', t.join(', '));
  console.log('[journal]', db.prepare('PRAGMA journal_mode').get().journal_mode);
}
