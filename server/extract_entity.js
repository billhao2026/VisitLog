// 拜访志 · 手工待办实体抽取：公司名 / 对接人
// 用于"手动添加"来源：确保不存在未关联客户的待办，并同步沉淀重点事项
'use strict';

// 法人实体后缀（长后缀优先匹配）
const SUFFIX = /(?:股份有限公司|有限责任公司|有限公司|集团公司|分公司|公司|集团|经营部|商行|营业部|办事处|工作室|中心|门市部|门店|厂|店)/;

// 1) 显式标记：公司名称：XXX / 客户：XXX / 公司名称:XXX
function byMarker(text) {
  const m = text.match(/(?:公司名称|客户名称|公司|客户)\s*[：:]\s*([^\s，。,；;！!？?（）()]{2,30})/);
  return m ? m[1].trim() : null;
}

// 2) 法人后缀兜底：文中任一含后缀的片段
function bySuffix(text) {
  const re = new RegExp('([\\u4e00-\\u9fa5A-Za-z0-9（）()·&]{2,20}' + SUFFIX.source + ')', 'g');
  const hits = text.match(re) || [];
  if (!hits.length) return null;
  // 排除纯行业词误命中（如"耗材类产品"）
  const bad = /^(?:产品|耗材|服务|平台|项目)$/;
  const cand = hits.map(s => s.trim()).filter(s => !bad.test(s));
  return cand[0] || null;
}

// 3) 已知客户字号/别名匹配：待办里提到老客户（无后缀写法，如"青岛锦鑫天恒"）
function byKnownCustomer(text, knownList) {
  for (const k of knownList || []) {
    if (!k || !k.key) continue;
    if (text.includes(k.key)) return k.name;
  }
  return null;
}

// 4) 对接人：对接人：XXX / 联系人：XXX / 联系人:XXX（2-4 个汉字）
function byPerson(text) {
  const m = text.match(/(?:对接人|联系人|负责人)\s*[：:]\s*([\u4e00-\u9fa5·]{2,5})/);
  if (m) return m[1].trim();
  // 兜底：联系/找到/对接 + X经理 / X总 / X女士 / X先生
  const m2 = text.match(/(?:联系|找到|对接)\s*([\u4e00-\u9fa5]{1,2}(?:经理|总|女士|先生|老师))/);
  return m2 ? m2[1].trim() : null;
}

// 抽取主入口：返回 { company, person }（可为 null）
// knownList: [{ key: '青岛锦鑫天恒', name: '青岛锦鑫天恒--周浩' }]，由调用方从客户库预生成
function extractEntities(text, knownList) {
  const t = String(text || '');
  if (!t.trim()) return { company: null, person: null };
  const company = byMarker(t) || bySuffix(t) || byKnownCustomer(t, knownList);
  const person = byPerson(t);
  return { company, person };
}

module.exports = { extractEntities };

