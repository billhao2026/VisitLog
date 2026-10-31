// 拜访志 · 字典：分类 / 术语 / 规则 / 纠错记录 / 设置
const { all, get, run, now, addLog, uuid } = require('./db.js');
const fb = require('./feedback.js');

// 全库应用术语替换：通话转写稿/原始稿/摘要、重点事项、待办（含备注）、客户备注
// 返回 { hits, calls, summaries, highlights, todos }
function refixAll(wrong, right) {
  const asr = require('./asr.js');
  const st = { hits: 0, calls: 0, summaries: 0, highlights: 0, todos: 0 };
  const fix = (text) => asr.applyTerm(text, wrong, right);

  for (const c of all('SELECT id, transcript, transcript_raw, summary FROM calls WHERE transcript IS NOT NULL')) {
    let changed = false, tr = c.transcript, raw = c.transcript_raw, sum = c.summary;
    if (tr) { const r = fix(tr); if (r.hits > 0) { tr = r.out; st.hits += r.hits; changed = true; } }
    if (raw) { const r = fix(raw); if (r.hits > 0) { raw = r.out; st.hits += r.hits; changed = true; } }
    if (sum) { const r = fix(sum); if (r.hits > 0) { sum = r.out; st.hits += r.hits; st.summaries++; changed = true; } }
    if (changed) {
      run('UPDATE calls SET transcript=?, transcript_raw=?, summary=?, updated_at=? WHERE id=?', tr, raw, sum, now(), c.id);
      st.calls++;
    }
  }
  for (const h of all('SELECT id, content FROM highlights WHERE content IS NOT NULL')) {
    const r = fix(h.content);
    if (r.hits > 0) {
      run('UPDATE highlights SET content=?, updated_at=? WHERE id=?', r.out, now(), h.id);
      st.highlights++; st.hits += r.hits;
    }
  }
  for (const t of all('SELECT id, content, note FROM todos')) {
    let changed = false, nw = t.content, nt = t.note;
    if (t.content) { const r = fix(t.content); if (r.hits > 0) { nw = r.out; st.hits += r.hits; changed = true; } }
    if (t.note) { const r = fix(t.note); if (r.hits > 0) { nt = r.out; st.hits += r.hits; changed = true; } }
    if (changed) {
      run('UPDATE todos SET content=?, note=?, updated_at=? WHERE id=?', nw, nt, now(), t.id);
      st.todos++;
    }
  }
  for (const cu of all('SELECT id, note FROM customers WHERE note IS NOT NULL')) {
    const r = fix(cu.note);
    if (r.hits > 0) {
      run('UPDATE customers SET note=?, updated_at=? WHERE id=?', r.out, now(), cu.id);
      st.hits += r.hits;
    }
  }
  return st;
}

module.exports = {
  'GET /api/dict': async () => {
    const cats = all('SELECT * FROM categories ORDER BY sort_order, id');
    const terms = all('SELECT id, wrong, "right" AS rt, hit_count, enabled FROM terms ORDER BY hit_count DESC');
    const rules = all(`SELECT r.*, c.name AS category_name FROM rules r
                       LEFT JOIN categories c ON c.id=r.category_id ORDER BY r.hit_count DESC, r.id DESC`);
    const corrections = all('SELECT * FROM corrections ORDER BY id DESC LIMIT 100');
    return { ok: true, cats, terms, rules, corrections };
  },

  // 扫描全部转写稿，粗筛疑似错词候选（ngram 频次 + 独立出现计数 + 停用字/词过滤 + 排除已收录术语）
  'GET /api/dict/candidates': async () => {
    const STOP = '的了是我就都也吧啊吗呢好行嗯哎对那这你他她它有没不在和与及或因如比果当给把被让从向到着过又再等然虽但更最很极并于之乎者所其某各每哪怎哦呀喽嘛呗啥咱俺您们儿里外上下中前后左右东西南北内旁边个';
    const BLACK = new Set(('因为 咱们 可以 比如 一个 什么 比如说 项目 产品 品牌 觉得 其实 问题 可能 一下 一些 肯定 所以 比较 合作 如果 自己 用户 时候 负责 实际 价格 刚才 实际上 平台 明白 客户 上面 利润 这个 那个 我们 你们 他们 现在 然后 就是 这样 那样 这边 那边 今天 明天 昨天 之前 以后 目前 最近 直接 主要 一般 基本 非常 特别 还是 但是 不过 而且 还有 或者 应该 需要 能够 已经 没有 不是 知道 了解 看看 到时候 差不多 没问题 没关系 不好意思 谢谢 好的 那行 意思 等于 就是说 一点 事情 情况 方面 方式 模式 渠道 电商 采购 销售 业务 经理 老板 公司 厂家 生产 工厂 质检 售后 送货 发货 样品 试用 测试 报价 折扣 返点 成本 挂价 批发 零售 订单 账期 付款 发票 开票 结算 回款 上架 京东 天猫 仓库 库存 现货 订货 物流 快递 到货 收货 验货 退货 换货 维修 报修 保修 质保 授权 代理 经销 中标 招标 投标 入围 供应商 服务商 经销商 采购人 单位 部门 机构 人员 负责人 对接人 联系人 决策 审批 流程 手续 资料 文件 合同 协议 条款 约定 承诺 确认 核实 对账 催款 欠款 逾期 风险 需求 意向 预算 金额 数量 型号 规格 参数 颜色 黑白 彩色 张数 耗材 硒鼓 墨盒 碳粉 鼓架 芯片 打印机 复印机 一体机 喷墨 激光 惠普 佳能 爱普生 兄弟 联想 得力 奔图 立思辰 理光 东芝 京瓷 夏普 国产 兼容 原装 正品 品质 质量 效果 稳定 耐用 寿命 周期 时间 效率 成本 效益 空间 优势 区别 差异 毛病 故障 确实 也是 这块 这一块 请问 您看 我看 你看 咱们这边 你们那边 那边 这边 老师 老板 领导 主任 工程师 财务 技术 服务 支持 团队 小伙伴 同事 兄弟 朋友们 群里 微信群 手机 电话 微信 加一下 存一下 联系 沟通 交流 对接 跟进 回复 反馈 安排 落实 推动 推进 开展 启动 完成 确定 商量 研究 讨论 聊聊 见面 拜访 上门 走一趟 过去 过来 跑一趟 尽量 尽快 马上 立刻 稍后 回头 下次 下回 随时 有空 方便 时间 安排 地点 地址 位置 那边 附近 学校 医院 单位 公司 机关 政府 国企 央企 政企 部队 银行 石油 石化 油田 铁路 电力 邮政 电信 移动 联通 烟草 税务 工商 财政 教育 卫生 公安 法院 检察 监狱 军队 军工 航天 航空 船舶 兵器 电子 研究所 研究院 大学 学院 中学 小学 幼儿园 教师 老师 学生 家长 校长 主任 处长 科长 局长 部长 书记 领导 老板 总 经理 总监 主管 专员 代表 负责人 联系人 经办人 对接人 采购 财务 行政 人事 技术 运维 信息 网络 系统 软件 硬件 设备 机器 打印机 电脑 笔记本 台式机 服务器 存储 网络设备 会议室 大屏 投影 白板 智慧 智能 数字 信息化 数字化 智能化 转型 升级 改造 建设 项目 工程 招标 采购 预算 资金 经费 款项 发票 收据 凭证 单据 报表 台账 明细 清单 目录 手册 说明书 操作指南 教程 培训 资料 素材 模板 样例 案例 成功 失败 经验 教训 总结 复盘 汇报 报告 方案 计划 目标 指标 任务 进度 节点 里程碑 阶段 周期 时间 日期 截止 到期 延期 提前 推迟 取消 变更 调整 修改 更新 新增 删除 停用 启用 上线 下线 发布 推送 通知 公告 提醒 预警 报警 异常 错误 故障 问题 风险 隐患 漏洞 缺陷 投诉 举报 纠纷 争议 诉讼 仲裁 调解 和解 赔偿 违约 逾期 欠款 坏账 呆账 催收 追偿 担保 抵押 质押 借款 贷款 融资 投资 入股 分红 股权 期权 奖金 提成 返点 折扣 优惠 促销 活动 礼品 赠品 样品 试用 体验 演示 展示 讲解 介绍 说明 答疑 解答 咨询 询问 提问 质疑 反对 同意 认可 赞成 支持 帮助 协助 配合 参与 加入 退出 更换 替换 替代 更换 更新 升级 降级 扩容 缩容 迁移 搬迁 装修 改造 扩建 新建 拆除 报废 处置 处理 解决 完成 结束 收尾 验收 交付 上线 运维 运营 管理 维护 保养 检查 巡检 排查 检测 测试 验证 校准 调试 配置 设置 参数 规格 型号 尺寸 重量 容量 功率 电压 电流 频率 速度 精度 分辨率 清晰度 对比度 亮度 色彩 灰度 反差 还原 逼真 细腻 均匀 稳定 可靠 耐用 坚固 轻便 美观 大方 时尚 现代 简约 高端 大气 上档次 性价比 实惠 便宜 昂贵 高价 低价 特价 促销价 市场价 指导价 零售价 批发价 渠道价 成本价 出厂价 含税 不含税 开票 不开票 含运 不含运 包邮 到付 自提 送货上门 安装调试 培训指导 售后保障 质保 保修 换新 维修 保养 巡检 回访 满意度 评价 口碑 声誉 信誉 品牌 形象 知名度 影响力 竞争力 核心 优势 特色 亮点 卖点 痛点 需求 诉求 期望 目标 愿景 使命 价值观 文化 团队 组织 架构 制度 流程 规范 标准 准则 纪律 考核 绩效 奖励 惩罚 晋升 加薪 福利 待遇 薪酬 工资 奖金 补贴 津贴 报销 差旅 住宿 餐饮 交通 通讯 办公 房租 水电 物业 社保 公积金 个税 增值税 企业所得税 印花税 附加税 城建税 教育费附加 地方教育附加 资源税 环保税 关税 消费税 智通 赢家 扬帆 格之格 莱盛 云梦泽 石油易采 昆仑浩克 政采云 王总 王姐 汪总 周总 郭经理 周经理 哈尔滨 独山子 库尔勒 中石油 中石化 大庆油田 包括 地区 一块 华为 部分 去做 一定 一样 大概 提供 领先 希望 大家 想法 保证 具体 全国 第一 只要 做一 准备 刚才讲 平板 块钱 未来 麻烦 明白明白 领先未来 十五 些品 供货 相信 来讲 实话 些事 哈哈 电商平台 做一些 点单 说像 作为 市场 专门 保障 工作 么做 地方 还要 想跟 四十 唯一 一年 大部分 些项目 叫什么 定价 周浩 两天 第二 要求 选择 区域 进去 来去 准确 起来 重要 么想 想了解 有兴趣 感兴趣 怎么样 怎么 这样 那样 这边 那边 咱们 你们 我们 他们 这个 那个 这些 那些 有些 有些 什么 为什么 什么事 什么事儿 什么情况 怎么回事 哪些 哪个 哪儿 哪里 多少 几多 多少钱 多少天 多长时间 多久 多大 多长 多远 多长时间 如何 怎样 怎么弄 怎么做 怎么处理 怎么解决 怎么说 怎么算 怎么安排 怎么样 如何做 如何办 如何弄 如何解决 如何安排 怎么办 下一步 接下来 以后 后面 前面 最后 首先 其次 再次 然后 接着 于是 因此 所以 总之 简言之 换句话说 也就是说 就是说 比方说 比如说 举例来说 例如 比如 譬如 其中 尤其 特别是 尤其是 尤其是 尤其是 另一个 一方面 另一方面 最后 最终 结果 结论 效果 影响 作用 意义 价值 利益 好处 坏处 优点 缺点 长处 短处 强项 弱项 优势 劣势 机会 威胁 风险 挑战 困难 麻烦 问题 障碍 阻力 压力 负担 成本 代价 损失 损害 危害 影响 后果 结果 结局 前景 前途 未来 明天 后天 大后天 下周 下下周 下个月 明年 后年 三年后 五年后 十年后 当初 当初 当时 那时候 那时候 现在 如今 目前 眼下 当前 此时此刻 最近 近期 近来 不久 马上 立即 立刻 即刻 瞬间 转眼 片刻 一会儿 一下子 一眨眼 没多久 不久以后 不久之后 将来 未来 以后 从此 从此以后 届时 到时候 到那时 到那会儿 那时候 那会儿 回头 稍后 待会儿 一会儿 等一下 等一等 等等 稍等 稍候 请稍等 请稍候 稍等一下 稍等片刻 稍候片刻 请稍后 请稍候 请稍等 请稍等片刻 请稍候片刻 好的 好嘞 好咧 行 行吧 行的 可以 可以的 没问题 没毛病 没关系 不要紧 没事 没事儿 无所谓 随便 随意 都行 都成 都好说 好说 好商量 就这么定 就这么说 就这么办 就这么着 这样吧 那就这样 那就这么定 那就这么办 那就这么着 成交 定了 说好了 说定了 一言为定 说话算数 说话算话 说话要算数 君子一言 驷马难追 一言既出 驷马难追 一言九鼎 说到做到 说到哪 做到哪 一言为定 就这样 就这么办 就这么定 就这么着 那就这样 那就这么 那就这么定 那就这么办 那就这么着 这样 那样 这么 那么 怎么 怎样 如何 咋 咋样 咋办 咋整 干啥 干吗 干嘛 啥事 什么事 怎么了 咋了 啥情况 什么情况 怎么回事 咋回事 咋整 咋办 咋弄 咋做 咋处理 咋解决 咋安排 咋搞 咋样 咋样了 咋回事 咋回事儿 咋办啊 咋整啊 咋弄啊 咋做啊 咋处理啊 咋解决啊 咋安排啊 咋搞啊 咋样啊 咋样了啊 咋回事啊 咋回事儿啊 你好 您好 你们好 大家好 早上好 上午好 中午好 下午好 晚上好 晚安 再见 拜拜 回头见 明天见 下次见 改天见 有空见 再联系 保持联系 常联系 多联系 经常联系 随时联系 电话联系 微信联系 短信联系 邮件联系 保持沟通 随时沟通 常沟通 多沟通 经常沟通 及时沟通 保持联系 谢谢 感谢 多谢 非常感谢 万分感谢 感激不尽 感恩 谢谢您 感谢您 多谢您 非常感谢您 万分感谢您 谢谢老板 谢谢领导 谢谢王总 谢谢周总 谢谢汪总 谢谢郭总 谢谢张总 谢谢李总 谢谢刘总 谢谢陈总 谢谢杨总 谢谢赵总 谢谢孙总 谢谢胡总 谢谢高总 谢谢林总 谢谢徐总 谢谢马总 谢谢朱总 谢谢吴总 谢谢郑总 谢谢王经理 谢谢周经理 谢谢张经理 谢谢李经理 谢谢刘经理 谢谢陈经理 谢谢杨经理 谢谢赵经理 谢谢孙经理 谢谢胡经理 谢谢高经理 谢谢林经理 谢谢徐经理 谢谢马经理 谢谢朱经理 谢谢吴经理 谢谢郑经理 不客气 不用谢 别客气 客气了 太客气了 您太客气了 客气啥 见外了 太见外了 哪里哪里 不敢当 过奖了 谬赞了 荣幸 很荣幸 非常荣幸 很高兴 很开心 很高兴认识 很荣幸认识 幸会 幸会幸会 久仰 久仰大名 久闻大名 如雷贯耳 久仰久仰 失敬失敬 失敬 多有得罪 得罪了 包涵 海涵 多多包涵 多多海涵 请多包涵 请多海涵 请多多包涵 请多多海涵 二十 十五 四十 三十 五十 六十 七十 八十 九十 一百 两百 三百 五百 八百 件事 看一看 推一些 压一年 李玉琳 河鲁超 卫涛 于航 周浩 田家齐 周嘉南 赢家上尊 实惠装 资格 成熟 较多 打电话 一部分 天津 单子 记得 合适 清楚 编码 反正 还得 国补 落地 建议 用户端 低一点 可以去 可以帮 能解决 哈哈哈 长时间 人家 赚钱 经常 想要 适合 始终 两年 关注 原来 一会 要走 可以直接 研究研究 什么样 说实话 百分之 中端 高端 低端 便宜一点 贵一点 好一点 快一点 慢一点 代理商 哈尔滨地区 江总 银来 指定 总部 关系 选品 出来 保护 重新 协调 明白明白明 白明白明白 跟电商平台 四十五块钱 角度来讲 黑龙江省 办公耗材 提供一些 负责线 会觉得 刚才说 能满足 可以多 叫赢家 特别多 还需要 少一点 可以推 可以存 可以聊 什么需 业大学 太麻烦 跟用户 偶尔 单价 完价 一看 些要 段卖 认为 经营 走走 变动 整体 分开 主体 英硕 天跟 杨芬 供应 包装 接受 能保 么久 单发 两家 根本 要做 明确 来回 全部 想做 毕竟 国家 商用 台式 推一 去推 去做一些 户去 月发 设计 监控 还能 同时 能拿 打扰 聊一 能帮 一种 差价 锁定 单独 愿意 去提 要一 十块 一起 主导 运作 以说 说完 同样 么多 贵姓 么说 去跟 定要 利用 去年 正常 审核 挣钱 人印 人人印 用一 去用 涛说 咱们可以 咱们这边 我们这边 你们这边 他那边 我这边 你那边 咱们这 我们这 你们这 这块儿 这块的 这一块的 那块的 那件事 这件事 这些事 那些事 这些项目 那些项目 这个事 那个事 这个项目 那个项目 这个产品 那个产品 这个品牌 那个品牌 这个平台 那个平台 这家 那家 这几家 那几家 这几家 这几家 采购的 销售的 负责的 对接的 联系的 沟通的 交流的 跟进 跟进的 回复的 反馈的 安排的 落实的 推动的 推进的 开展的 启动的 完成的 确定的 商量的 研究的 讨论的 聊聊的 见面的 拜访的 上门的 过去的 过来的 跑一趟的 尽快的 尽量的 马上 立刻 稍后 回头 下次 下回 随时 有空 方便 时间 安排 地点 地址 位置 附近的 学校里 医院里 单位里 公司里 机关里 政府里 国企里 央企里 政企里 部队里 银行里 石油里 石化里 油田里 铁路里 电力里 邮政里 电信里 移动里 联通里 烟草里 税务里 工商里 财政里 教育里 卫生里 公安里 法院里 检察里 监狱里 军队里 军工里 航天里 航空里 船舶里 兵器里 电子里 研究所里 研究院里 大学里 学院里 中学里 小学里 幼儿园里 教师里 学生里 家长里 校长里 主任里 处长里 科长里 局长里 部长里 书记里 领导里 老板里 经理里 总监里 主管里 专员里 代表里 负责人里 联系人里 经办人里 对接人里 采购里 财务里 行政里 人事里 技术里 运维里 信息里 网络里 系统里 软件里 硬件里 设备里 机器里 打印机里 电脑里 笔记本里 台式机里 服务器里 存储里 网络设备里 会议室里 大屏里 投影里 白板里 智慧里 智能里 数字里 信息化里 数字化里 智能化里 转型里 升级里 改造里 建设里 项目里 工程里 招标里 采购里 预算里 资金里 经费里 款项里 发票里 收据里 凭证里 单据里 报表里 台账里 明细里 清单里 目录里 手册里 说明书里 操作指南里 教程里 培训里 资料里 素材里 模板里 样例里 案例里 成功里 失败里 经验里 教训里 总结里 复盘里 汇报里 报告里 方案里 计划里 目标里 指标里 任务里 进度里 节点里 里程碑里 阶段里 周期里 时间里 日期里 截止里 到期里 延期里 提前里 推迟里 取消里 变更里 调整里 修改里 更新里 新增里 删除里 停用里 启用里 上线里 下线里 发布里 推送里 通知里 公告里 提醒里 预警里 报警里 异常里 错误里 故障里 问题里 风险里 隐患里 漏洞里 缺陷里 投诉里 举报里 纠纷里 争议里 诉讼里 仲裁里 调解里 和解里 赔偿里 违约里 逾期里 欠款里 坏账里 呆账里 催收里 追偿里 担保里 抵押里 质押里 借款里 贷款里 融资里 投资里 入股里 分红里 股权里 期权里 奖金里 提成里 返点里 折扣里 优惠里 促销里 活动里 礼品里 赠品里 样品里 试用里 体验里 演示里 展示里 讲解里 介绍里 说明里 答疑里 解答里 咨询里 询问里 提问里 质疑里 反对里 同意里 认可里 赞成里 支持里 帮助里 协助里 配合里 参与里 加入里 退出里 更换里 替换里 替代里 更新里 升级里 降级里 扩容里 缩容里 迁移里 搬迁里 装修里 改造里 扩建里 新建里 拆除里 报废里 处置里 处理里 解决里 完成里 结束里 收尾里 验收里 交付里 上线里 运维里 运营里 管理里 维护里 保养里 检查里 巡检里 排查里 检测里 测试里 验证里 校准里 调试里 配置里 设置里 参数里 规格里 型号里 尺寸里 重量里 容量里 功率里 电压里 电流里 频率里 速度里 精度里 分辨率里 清晰度里 对比度里 亮度里 色彩里 灰度里 反差里 还原里 逼真里 细腻里 均匀里 稳定里 可靠里 耐用里 坚固里 轻便里 美观里 大方里 时尚里 现代里 简约里 高端里 大气里 上档次里 性价比里 实惠里 便宜里 昂贵里 高价里 低价里 特价里 促销价里 市场价里 指导价里 零售价里 批发价里 渠道价里 成本价里 出厂价里 含税里 不含税里 开票里 不开票里 含运里 不含运里 包邮里 到付里 自提里 送货上门里 安装调试里 培训指导里 售后保障里 质保里 保修里 换新里 维修里 保养里 巡检里 回访里 满意度里 评价里 口碑里 声誉里 信誉里 品牌里 形象里 知名度里 影响力里 竞争力里 核心里 优势里 特色里 亮点里 卖点里 痛点里 需求里 诉求里 期望里 目标里 愿景里 使命里 价值观里 文化里 团队里 组织里 架构里 制度里 流程里 规范里 标准里 准则里 纪律里 考核里 绩效里 奖励里 惩罚里 晋升里 加薪里 福利里 待遇里 薪酬里 工资里 奖金里 补贴里 津贴里 报销里 差旅里 住宿里 餐饮里 交通里 通讯里 办公里 房租里 水电里 物业里 社保里 公积金里 个税里 增值税里 企业所得税里 印花税里 附加税里 城建税里 教育费附加里 地方教育附加里 资源税里 环保税里 关税里 消费税里 智通里 赢家里 扬帆里 格之格里 莱盛里 云梦泽里 石油易采里 昆仑浩克里 政采云里').split(/\s+/));
    const terms = new Set();
    for (const t of all('SELECT wrong, "right" AS rt FROM terms')) { terms.add(t.wrong); terms.add(t.rt); }
    const cnt = new Map();
    const sample = new Map();
    const pat = /[\u4e00-\u9fa5]+/g;
    for (const row of all('SELECT transcript FROM calls WHERE transcript IS NOT NULL')) {
      for (const line of (row.transcript || '').split('\n')) {
        const body = line.replace(/^\[\d{2}:\d{2}:\d{2}\s*-\s*\d{2}:\d{2}:\d{2}\]\s*/, '');
        for (const m of body.matchAll(pat)) {
          const seg = m[0];
          for (let n = 2; n <= 5; n++) {
            for (let i = 0; i + n <= seg.length; i++) {
              const g = seg.slice(i, i + n);
              // 全量统计（含黑名单/术语/停用字词），供独立计数抵消碎片；输出时再过滤
              cnt.set(g, (cnt.get(g) || 0) + 1);
              if (!sample.has(g)) sample.set(g, body.slice(0, 60));
            }
          }
        }
      }
    }
    // 独立出现计数：总次数 − 作为更长词子串的次数（碎片如 油易 ⊂ 石油易采 独立数归零）
    const allArr = [];
    for (const [g, c] of cnt) {
      if (c >= 3) allArr.push({ phrase: g, count: c });
    }
    allArr.sort((a, b) => b.phrase.length - a.phrase.length); // 长词在前，便于剪枝
    const cand = allArr.filter(c => !Array.from(c.phrase).some(ch => STOP.includes(ch)));
    for (const c of cand) {
      let sub = 0;
      for (const o of allArr) {
        if (o.phrase.length <= c.phrase.length) break;
        if (o.phrase.includes(c.phrase)) sub = Math.max(sub, o.count);
      }
      c.ind = c.count - sub;
    }
    const out = cand
      .filter(c => c.ind >= 3 && !BLACK.has(c.phrase) && !terms.has(c.phrase)
        && !Array.from(c.phrase).some(ch => STOP.includes(ch)))
      .sort((a, b) => b.ind - a.ind || b.phrase.length - a.phrase.length)
      .map(c => ({ phrase: c.phrase, count: c.ind, sample: sample.get(c.phrase) || '' }));
    return { ok: true, candidates: out.slice(0, 80) };
  },

  // 分类：新增 / 改判据 / 停用
  'POST /api/dict/category': async (req, res, b) => {
    if (b.action === 'add') {
      const id = b.id || ('c' + uuid());
      const parent = b.parent_id || null;
      const level = parent ? 2 : 1;
      run(`INSERT INTO categories(id,parent_id,level,name,criteria,keywords,status,sort_order,created_at,updated_at)
           VALUES(?,?,?,?,?,?, 'active', (SELECT COALESCE(MAX(sort_order),0)+1 FROM categories), ?,?)`,
        id, parent, level, b.name, b.criteria || '', b.keywords || '', now(), now());
      addLog('cat_add', id, b.name);
      return { ok: true, id };
    }
    if (b.action === 'edit') {
      const f = b.field, v = b.value;
      if (!['name', 'criteria', 'keywords', 'status', 'is_no_content', 'sort_order', 'parent_id'].includes(f)) {
        return { ok: false, err: 'unsupported field: ' + f };
      }
      const old = get('SELECT * FROM categories WHERE id=?', b.id);
      run(`UPDATE categories SET ${f}=?, updated_at=? WHERE id=?`, v, now(), b.id);
      if (f === 'criteria' || f === 'keywords') addLog('cat_edit', b.id, `${f} 更新`);
      return { ok: true, old: old ? old[f] : null };
    }
    return { ok: false, err: 'unknown action（支持 add / toggle / del）' };
  },

  'POST /api/dict/term': async (req, res, b) => {
    if (b.action === 'add') {
      if (!b.wrong || !b.right) return { ok: false, err: '缺 wrong/right' };
      const exist = get('SELECT id, "right" AS old_rt FROM terms WHERE wrong=?', b.wrong);
      let id;
      if (exist) {
        // 修改既有术语：先把旧的修正结果还原成误词，再套新正词（避免旧修正残留）
        if (exist.old_rt && exist.old_rt !== b.wrong && exist.old_rt !== b.right) {
          refixAll(exist.old_rt, b.wrong);
        }
        run('UPDATE terms SET "right"=?, enabled=1 WHERE id=?', b.right, exist.id);
        id = exist.id;
      } else {
        id = run('INSERT INTO terms(wrong,"right",hit_count,enabled,created_at) VALUES(?,?,0,1,?)', b.wrong, b.right, now()).lastInsertRowid;
      }
      // 新词入库后，立即全库同步：转写稿/摘要/要点/待办/客户备注（改了能反哺）
      const st = refixAll(b.wrong, b.right);
      run('UPDATE terms SET hit_count=hit_count+? WHERE id=?', st.hits, id);
      addLog('term_add', String(id), `${b.wrong} → ${b.right}（全库同步 ${st.hits} 处：通话 ${st.calls} 稿 / 摘要 ${st.summaries} / 要点 ${st.highlights} / 待办 ${st.todos}）`);
      return { ok: true, id, refixed: st.hits, calls: st.calls, summaries: st.summaries, highlights: st.highlights, todos: st.todos };
    }
    if (b.action === 'toggle') {
      run('UPDATE terms SET enabled=? WHERE id=?', b.enabled ? 1 : 0, b.id);
      return { ok: true };
    }
    if (b.action === 'del') { run('DELETE FROM terms WHERE id=?', b.id); return { ok: true }; }
    return { ok: false, err: 'unknown action（支持 add / toggle / del）' };
  },

  'POST /api/dict/rule': async (req, res, b) => {
    if (b.action === 'add') {
      const rid = fb.addRule(b.pattern, b.category_id, b.source || 'manual');
      if (!rid) return { ok: false, err: '分类不存在或 pattern 为空' };
      return { ok: true, id: rid };
    }
    if (b.action === 'toggle') { run('UPDATE rules SET enabled=?, updated_at=? WHERE id=?', b.enabled ? 1 : 0, now(), b.id); return { ok: true }; }
    if (b.action === 'del') { run('DELETE FROM rules WHERE id=?', b.id); return { ok: true }; }
    return { ok: false, err: 'unknown action（支持 add / toggle / del）' };
  },

  // 设置
  'GET /api/settings': async () => {
    const rows = all('SELECT k,v FROM settings');
    const o = {};
    for (const r of rows) o[r.k] = r.v;
    return { ok: true, settings: o };
  },

  'POST /api/settings': async (req, res, b) => {
    for (const k of Object.keys(b || {})) {
      if (k === 'ok') continue;
      run('INSERT INTO settings(k,v) VALUES(?,?) ON CONFLICT(k) DO UPDATE SET v=excluded.v', k, String(b[k]));
    }
    addLog('settings', '', JSON.stringify(b).slice(0, 200));
    return { ok: true };
  },

  // 每日待办推送记录
  'GET /api/push': async (req, res, b, q) => {
    const d = q.get('date') || now().slice(0, 10);
    return { ok: true, push: get('SELECT * FROM pushes WHERE push_date=?', d), date: d };
  },

  'POST /api/push': async (req, res, b) => {
    run(`INSERT INTO pushes(push_date,kind,content,sent_at) VALUES(?,?,?,?)
         ON CONFLICT(push_date) DO UPDATE SET content=excluded.content, sent_at=excluded.sent_at`,
      b.date, b.kind || 'daily', b.content || '', now());
    return { ok: true };
  },
};
