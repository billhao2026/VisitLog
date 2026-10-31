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
    const BLACK = new Set(('    一下 一下子 一个 一些 一会 一会儿 一块 一定 一年 一方面 一样 一点 \n    一百 一看 一眨眼 一种 一般 一言为定 一言九鼎 一言既出 一起 一部分 七十 万分感谢 \n    万分感谢您 三十 三年后 三百 上午好 上架 上档次 上档次里 上线 上线里 上门 上门的 \n    上面 下一步 下下周 下个月 下午好 下周 下回 下次 下次见 下线 下线里 不久 \n    不久之后 不久以后 不含税 不含税里 不含运 不含运里 不好意思 不客气 不开票 不开票里 不敢当 不是 \n    不用谢 不要紧 不过 专员 专员里 专门 业务 业大学 两天 两家 两年 两百 \n    个税 个税里 中午好 中学 中学里 中标 中端 为什么 主任 主任里 主体 主导 \n    主管 主管里 主要 举例来说 举报 举报里 久仰 久仰久仰 久仰大名 久闻大名 么久 么做 \n    么多 么想 么说 之前 九十 也就是说 也是 书记 书记里 了解 争议 争议里 \n    事情 二十 于是 五十 五年后 五百 些事 些品 些要 些项目 交付 交付里 \n    交流 交流的 交通 交通里 产品 亮度 亮度里 亮点 亮点里 人事 人事里 人人印 \n    人印 人员 人家 什么 什么事 什么事儿 什么情况 什么样 什么需 今天 介绍 介绍里 \n    从此 从此以后 仓库 他们 他那边 付款 代价 代理 代理商 代表 代表里 以后 \n    以说 仲裁 仲裁里 件事 价值 价值观 价值观里 价格 任务 任务里 企业所得税 企业所得税里 \n    优势 优势里 优惠 优惠里 优点 会觉得 会议室 会议室里 但是 位置 低一点 低价 \n    低价里 低端 住宿 住宿里 体验 体验里 作为 作用 你们 你们好 你们这 你们这边 \n    你们那边 你好 你看 你那边 使命 使命里 例如 供应 供应商 供货 便宜 便宜一点 \n    便宜里 促销 促销价 促销价里 促销里 保修 保修里 保养 保养里 保护 保持沟通 保持联系 \n    保证 保障 信息 信息化 信息化里 信息里 信誉 信誉里 修改 修改里 借款 借款里 \n    做一 做一些 做到哪 停用 停用里 偶尔 催收 催收里 催款 入围 入股 入股里 \n    全国 全部 八十 八百 公司 公司里 公告 公告里 公安 公安里 公积金 公积金里 \n    六十 关注 关税 关税里 关系 兵器 兵器里 其中 其实 其次 具体 兼容 \n    再次 再联系 再见 军工 军工里 军队 军队里 决策 准则 准则里 准备 准确 \n    几多 凭证 凭证里 出厂价 出厂价里 出来 分开 分红 分红里 分辨率 分辨率里 刚才 \n    刚才讲 刚才说 删除 删除里 利润 利用 利益 别客气 到付 到付里 到时候 到期 \n    到期里 到货 到那会儿 到那时 制度 制度里 前景 前途 前面 办公 办公里 功率 \n    功率里 加一下 加入 加入里 加薪 加薪里 劣势 包括 包涵 包装 包邮 包邮里 \n    区别 区域 医院 医院里 十五 十块 十年后 升级 升级里 华为 协助 协助里 \n    协议 协调 单价 单位 单位里 单发 单子 单据 单据里 单独 卖点 卖点里 \n    卫生 卫生里 印花税 印花税里 危害 即刻 厂家 压一年 压力 原来 原装 去做 \n    去做一些 去年 去推 去提 去用 去跟 参与 参与里 参数 参数里 及时沟通 反对 \n    反对里 反差 反差里 反正 反馈 反馈的 发布 发布里 发票 发票里 发货 取消 \n    取消里 变动 变更 变更里 口碑 口碑里 另一个 另一方面 只要 叫什么 可以 可以去 \n    可以多 可以存 可以帮 可以推 可以的 可以直接 可以聊 可能 可靠 可靠里 台式 台式机 \n    台式机里 台账 台账里 合作 合同 合适 同事 同意 同意里 同时 同样 后天 \n    后年 后果 后面 君子一言 含税 含税里 含运 含运里 启动 启动的 启用 启用里 \n    呆账 呆账里 周期 周期里 咋 咋了 咋做 咋做啊 咋办 咋办啊 咋回事 咋回事儿 \n    咋回事儿啊 咋回事啊 咋处理 咋处理啊 咋安排 咋安排啊 咋弄 咋弄啊 咋搞 咋搞啊 咋整 咋整啊 \n    咋样 咋样了 咋样了啊 咋样啊 咋解决 咋解决啊 和解 和解里 咨询 咨询里 咱们 咱们可以 \n    咱们这 咱们这边 品牌 品牌里 品质 哈哈 哈哈哈 哪个 哪些 哪儿 哪里 哪里哪里 \n    售后 售后保障 售后保障里 唯一 商用 商量 商量的 啥事 啥情况 四十 四十五块钱 回复 \n    回复的 回头 回头见 回款 回访 回访里 因为 因此 团队 团队里 困难 国产 \n    国企 国企里 国家 地区 地址 地方 地方教育附加 地方教育附加里 地点 均匀 均匀里 坏处 \n    坏账 坏账里 块钱 坚固 坚固里 型号 型号里 城建税 城建税里 培训 培训指导 培训指导里 \n    培训里 基本 增值税 增值税里 声誉 声誉里 处理 处理里 处置 处置里 处长 处长里 \n    复盘 复盘里 多久 多多包涵 多多海涵 多大 多少 多少天 多少钱 多有得罪 多沟通 多联系 \n    多谢 多谢您 多远 多长 多长时间 大后天 大学 大学里 大家 大家好 大屏 大屏里 \n    大方 大方里 大概 大气 大气里 大部分 天跟 太客气了 太见外了 太麻烦 央企 央企里 \n    失敬 失敬失敬 失败 失败里 奖励 奖励里 奖金 奖金里 好一点 好咧 好商量 好嘞 \n    好处 好的 好说 如今 如何 如何做 如何办 如何安排 如何弄 如何解决 如果 如雷贯耳 \n    始终 威胁 存一下 存储 存储里 学校 学校里 学生 学生里 学院 学院里 安排 \n    安排的 安装调试 安装调试里 完价 完成 完成的 完成里 定了 定价 定要 实惠 实惠装 \n    实惠里 实话 实际 实际上 审批 审核 客户 客气了 客气啥 家长 家长里 容量 \n    容量里 对接 对接人 对接人里 对接的 对比度 对比度里 对账 寿命 将来 小伙伴 小学 \n    小学里 少一点 尤其 尤其是 就是 就是说 就这么办 就这么定 就这么着 就这么说 就这样 尺寸 \n    尺寸里 尽快 尽快的 尽量 尽量的 局长 局长里 届时 展示 展示里 巡检 巡检里 \n    工作 工厂 工商 工商里 工程 工程师 工程里 工资 工资里 差不多 差价 差异 \n    差旅 差旅里 已经 市场 市场价 市场价里 希望 帮助 帮助里 常沟通 常联系 干吗 \n    干啥 干嘛 平台 平板 幸会 幸会幸会 幼儿园 幼儿园里 库存 应该 延期 延期里 \n    建议 建设 建设里 开展 开展的 开票 开票里 异常 异常里 张数 弱项 强项 \n    当初 当前 当时 形象 形象里 影响 影响力 影响力里 待会儿 待遇 待遇里 很开心 \n    很荣幸 很荣幸认识 很高兴 很高兴认识 得罪了 微信 微信群 微信联系 快一点 快递 怎么 怎么了 \n    怎么做 怎么办 怎么回事 怎么处理 怎么安排 怎么弄 怎么样 怎么算 怎么解决 怎么说 怎样 性价比 \n    性价比里 总 总之 总监 总监里 总结 总结里 总部 您太客气了 您好 您看 情况 \n    惩罚 惩罚里 想了解 想做 想法 想要 想跟 意义 意向 意思 感兴趣 感恩 \n    感激不尽 感谢 感谢您 愿意 愿景 愿景里 慢一点 成交 成功 成功里 成本 成本价 \n    成本价里 成熟 我们 我们这 我们这边 我看 我这边 或者 截止 截止里 户去 房租 \n    房租里 所以 手册 手册里 手机 手续 打扰 打电话 扩容 扩容里 扩建 扩建里 \n    批发 批发价 批发价里 承诺 技术 技术里 投影 投影里 投标 投诉 投诉里 投资 \n    投资里 折扣 折扣里 报价 报修 报告 报告里 报废 报废里 报表 报表里 报警 \n    报警里 报销 报销里 抵押 抵押里 担保 担保里 拆除 拆除里 招标 招标里 拜拜 \n    拜访 拜访的 挂价 指定 指导价 指导价里 指标 指标里 挑战 挣钱 损失 损害 \n    换句话说 换新 换新里 换货 授权 排查 排查里 接下来 接受 接着 推一 推一些 \n    推动 推动的 推进 推进的 推迟 推迟里 推送 推送里 提供 提供一些 提前 提前里 \n    提成 提成里 提醒 提醒里 提问 提问里 搬迁 搬迁里 操作指南 操作指南里 支持 支持里 \n    收尾 收尾里 收据 收据里 收货 改天见 改造 改造里 政企 政企里 政府 政府里 \n    故障 故障里 效果 效率 效益 教师 教师里 教程 教程里 教育 教育费附加 教育费附加里 \n    教育里 教训 教训里 数字 数字化 数字化里 数字里 数量 整体 文件 文化 文化里 \n    新增 新增里 新建 新建里 方便 方式 方案 方案里 方面 无所谓 日期 日期里 \n    早上好 时候 时尚 时尚里 时间 时间里 昂贵 昂贵里 明天 明天见 明年 明白 \n    明白明白 明白明白明 明确 明细 明细里 昨天 晋升 晋升里 晚上好 晚安 智慧 智慧里 \n    智能 智能化 智能化里 智能里 更换 更换里 更新 更新里 替代 替代里 替换 替换里 \n    最后 最终 最近 月发 有些 有兴趣 有空 有空见 朋友们 服务 服务商 服务器 \n    服务器里 期望 期望里 期权 期权里 未来 机会 机关 机关里 机器 机器里 机构 \n    条款 来去 来回 来讲 架构 架构里 标准 标准里 校准 校准里 校长 校长里 \n    样例 样例里 样品 样品里 核实 核心 核心里 根本 案例 案例里 检察 检察里 \n    检查 检查里 检测 检测里 模式 模板 模板里 欠款 欠款里 款项 款项里 正品 \n    正常 此时此刻 段卖 比如 比如说 比方说 比较 毕竟 毛病 水电 水电里 汇报 \n    汇报里 沟通 沟通的 没事 没事儿 没关系 没多久 没有 没毛病 没问题 油田 油田里 \n    法院 法院里 津贴 津贴里 活动 活动里 流程 流程里 测试 测试里 海涵 消费税 \n    消费税里 涛说 清单 清单里 清晰度 清晰度里 清楚 渠道 渠道价 渠道价里 满意度 满意度里 \n    漏洞 漏洞里 演示 演示里 灰度 灰度里 点单 烟草 烟草里 然后 片刻 物业 \n    物业里 物流 特价 特价里 特别 特别多 特别是 特色 特色里 环保税 环保税里 现代 \n    现代里 现在 现货 生产 用一 用户 用户端 电信 电信里 电力 电力里 电压 \n    电压里 电商 电商平台 电子 电子里 电流 电流里 电脑 电脑里 电话 电话联系 痛点 \n    痛点里 白明白明白 白板 白板里 百分之 监控 监狱 监狱里 目前 目录 目录里 目标 \n    目标里 直接 相信 看一看 看看 眼下 瞬间 知名度 知名度里 知道 短信联系 短处 \n    石化 石化里 石油 石油里 研究 研究所 研究所里 研究的 研究研究 研究院 研究院里 硬件 \n    硬件里 确定 确定的 确实 确认 礼品 礼品里 社保 社保里 福利 福利里 科长 \n    科长里 移动 移动里 稍候 稍候片刻 稍后 稍等 稍等一下 稍等片刻 税务 税务里 稳定 \n    稳定里 空间 立刻 立即 竞争力 竞争力里 笔记本 笔记本里 第一 第二 等一下 等一等 \n    等于 等等 答疑 答疑里 简约 简约里 简言之 管理 管理里 精度 精度里 系统 \n    系统里 素材 素材里 纠纷 纠纷里 约定 纪律 纪律里 组织 组织里 细腻 细腻里 \n    经办人 经办人里 经常 经常沟通 经常联系 经理 经理里 经营 经费 经费里 经销 经销商 \n    经验 经验里 结局 结束 结束里 结果 结算 结论 绩效 绩效里 维修 维修里 \n    维护 维护里 编码 缩容 缩容里 缺点 缺陷 缺陷里 网络 网络设备 网络设备里 网络里 \n    美观 美观里 群里 老师 老板 老板里 考核 考核里 而且 耐用 耐用里 聊一 \n    聊聊 聊聊的 联系 联系人 联系人里 联系的 联通 联通里 股权 股权里 肯定 能保 \n    能够 能帮 能拿 能满足 能解决 自己 自提 自提里 航天 航天里 航空 航空里 \n    船舶 船舶里 色彩 色彩里 节点 节点里 芯片 英硕 荣幸 落地 落实 落实的 \n    薪酬 薪酬里 融资 融资里 行 行吧 行政 行政里 行的 补贴 补贴里 装修 \n    装修里 要一 要做 要求 要走 见外了 见面 见面的 规格 规格里 规范 规范里 \n    觉得 角度来讲 解决 解决里 解答 解答里 譬如 计划 计划里 订单 订货 认为 \n    认可 认可里 讨论 讨论的 记得 讲解 讲解里 设备 设备里 设置 设置里 设计 \n    评价 评价里 诉求 诉求里 诉讼 诉讼里 试用 试用里 询问 询问里 说像 说到做到 \n    说到哪 说好了 说完 说定了 说实话 说明 说明书 说明书里 说明里 说话算数 说话算话 说话要算数 \n    请多包涵 请多多包涵 请多多海涵 请多海涵 请稍候 请稍候片刻 请稍后 请稍等 请稍等片刻 请问 调整 调整里 \n    调解 调解里 调试 调试里 谢谢 谢谢刘总 谢谢刘经理 谢谢吴总 谢谢吴经理 谢谢孙总 谢谢孙经理 谢谢张总 \n    谢谢张经理 谢谢徐总 谢谢徐经理 谢谢您 谢谢朱总 谢谢朱经理 谢谢李总 谢谢李经理 谢谢杨总 谢谢杨经理 谢谢林总 谢谢林经理 \n    谢谢老板 谢谢胡总 谢谢胡经理 谢谢赵总 谢谢赵经理 谢谢郑总 谢谢郑经理 谢谢郭总 谢谢陈总 谢谢陈经理 谢谢领导 谢谢马总 \n    谢谢马经理 谢谢高总 谢谢高经理 谬赞了 负担 负责 负责人 负责人里 负责的 负责线 财务 财务里 \n    财政 财政里 账期 质保 质保里 质押 质押里 质检 质疑 质疑里 质量 贵一点 \n    贵姓 贷款 贷款里 资料 资料里 资格 资源税 资源税里 资金 资金里 赔偿 赔偿里 \n    赚钱 赞成 赞成里 赠品 赠品里 走一趟 走走 起来 跑一趟 跑一趟的 跟用户 跟电商平台 \n    跟进 跟进的 转型 转型里 转眼 软件 软件里 轻便 轻便里 较多 迁移 迁移里 \n    过去 过去的 过奖了 过来 过来的 运作 运维 运维里 运营 运营里 近期 近来 \n    返点 返点里 还原 还原里 还得 还是 还有 还能 还要 还需要 这一块 这一块的 \n    这个 这个事 这个产品 这个品牌 这个平台 这个项目 这么 这些 这些事 这些项目 这件事 这几家 \n    这块 这块儿 这块的 这家 这样 这样吧 这边 进去 进度 进度里 违约 违约里 \n    追偿 追偿里 退出 退出里 退货 送货 送货上门 送货上门里 适合 选品 选择 通知 \n    通知里 通讯 通讯里 速度 速度里 逼真 逼真里 逾期 逾期里 那个 那个事 那个产品 \n    那个品牌 那个平台 那个项目 那么 那些 那些事 那些项目 那件事 那会儿 那几家 那块的 那家 \n    那就这么 那就这么办 那就这么定 那就这么着 那就这样 那时候 那样 那行 那边 邮件联系 邮政 邮政里 \n    部分 部长 部长里 部门 部队 部队里 都好说 都成 都行 配合 配合里 配置 \n    配置里 采购 采购人 采购的 采购里 里程碑 里程碑里 重新 重要 重量 重量里 金额 \n    铁路 铁路里 银来 银行 银行里 销售 销售的 锁定 错误 错误里 长处 长时间 \n    问题 问题里 阶段 阶段里 阻力 附加税 附加税里 附近 附近的 降级 降级里 随便 \n    随意 随时 随时沟通 随时联系 隐患 隐患里 障碍 零售 零售价 零售价里 需求 需求里 \n    需要 非常 非常感谢 非常感谢您 非常荣幸 项目 项目里 预算 预算里 预警 预警里 领先 \n    领先未来 领导 领导里 频率 频率里 颜色 风险 风险里 餐饮 餐饮里 首先 马上 \n    驷马难追 验收 验收里 验证 验证里 验货 高价 高价里 高端 高端里 麻烦').split(/\s+/));
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
    // 独立出现计数：总次数 − 作为更长词子串的次数（碎片词独立数归零）
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
