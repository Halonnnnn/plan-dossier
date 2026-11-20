# plan-dossier 消融实验

## 1. 实验信息

执行人、实验时间窗、随机种子与本报告冻结 commit 见描述区，不在此表重复。

| 项 | 值 |
|---|---|
| Harness | deepseek-harness |
| 模型 | planner：claude opus5.5；executor：deepseek-v4.1-flash-1031 |
| 权限模式 / 思考档位 | planner：high；executor：default/low |

上下文洞察：使用插件 dsh-context 提供 DSH 的上下文洞察支持。

## 2. 研究问题与假设

核心问题：plan-dossier 单独加载时，相对裸基线，是否带来可测量的净收益。

| 假设 | 内容 | 判定规则（跑前锁死） |
|---|---|---|
| H1 | T1（跨阶段任务）上，A1 通过数 ≥ A0，且 search-to-first-edit 中位数更低 | 成立：两条件同时满足且配对比较中 A1 优势 run 数 ≥ 2/3；方向相反判不成立；混合判无结论 |
| H2 | T2（小任务）上，A1 正确降级（plain text / minimal，无 full form 工件），tokens 开销相对 A0 ≤ +20% | 成立：两条件同时满足；出现 full form 工件即判不成立 |

不预设关于 ledger 准确率的假设：它是观测项（已知弱点），只报告不判定。

## 3. 实验设计

### 3.1 自变量

唯一变量：skill 加载。

| 臂 | 加载内容 | 说明 |
|---|---|---|
| A0 | 无任何 skill | 裸基线 |
| A1 | 仅 plan-dossier | 单变量测 plan-dossier |

### 3.2 冻结的控制变量

以下各项在所有 run 间字节级或配置级相同，任一项变动即作废该 run：

- SDD 文档（逐字相同）与初始 prompt（逐字相同）
- 初始 repo 快照（同一 commit）
- 项目级规范（AGENTS.md 或同等文件，逐字相同）
- 模型版本、权限模式、思考档位
- 每 run 全新工作空间目录，无项目记忆、无历史 session、无 `.plan-dossier/` 残留
- 全程无人工介入：不回答执行中的问题，不纠正方向

### 3.3 任务

| 任务 | 形态 | 选择标准 | 状态 |
|---|---|---|---|
| T1 | plan 与 execute 分两个 session，规模够触发 full form | 真实踩过坑的跨模块改动；多文件、有依赖顺序、规划期需要排除若干方向 | 待定（填写 SDD 路径与验收脚本路径） |
| T2 | 单 session 完成 | 单文件小 feature；理想结果是 plan-dossier 自行判断走 plain text | 待定（同上） |

### 3.4 Run 矩阵与执行顺序

2 臂 × 2 任务 × 3 次重复 = 12 runs。顺序由种子 20261120 洗牌生成，按序执行，禁止按臂连跑：

| 序 | run | 序 | run |
|---|---|---|---|
| 1 | T1-A0-r3 | 7 | T1-A1-r3 |
| 2 | T2-A1-r3 | 8 | T1-A1-r2 |
| 3 | T1-A0-r1 | 9 | T2-A0-r1 |
| 4 | T1-A1-r1 | 10 | T2-A0-r3 |
| 5 | T2-A1-r2 | 11 | T2-A1-r1 |
| 6 | T1-A0-r2 | 12 | T2-A0-r2 |

工作空间命名：`runs/{task}-{arm}-r{n}/`，run 结束后封存，永不复用。

预算宽松时的升级项（不改变分析口径）：T1 提到每臂 5 次，新增 run 后整体重新洗牌（种子 20261121）。

## 4. 单次 Run 协议

1. 复制冻结快照到全新工作空间目录
2. 新 session：输入该任务的固定初始 prompt，完成规划（T1 到工件冻结为止；T2 在单 session 内一次做完）
3. T1：再开新 session，按工件执行；A0 对照组同样分两个 session，第二个 session 只给 SDD
4. 跑验收断言脚本（T1/T2 各自固定脚本，行为级断言）
5. 归档：session transcript（JSONL）、`.plan-dossier/` 工件（如有）、最终 diff、验收脚本输出、token/耗时报告
6. 封存工作空间
7. run 中途失败照实记录，不重试、不换写法（失败本身是数据）

## 5. 指标操作化定义

| 指标 | 定义 | 数据来源 | 适用 |
|---|---|---|---|
| 任务通过数 | 验收断言脚本 binary 通过的 run 数 | 脚本输出 | 两臂 |
| search-to-first-edit | 执行阶段首个 Edit/Write 之前的 Grep/Glob/Read 等探索类工具调用次数 | transcript | 两臂 |
| reuse ratio | 任务卡 cites 中被执行阶段实际消费的比例（消费 = 查阅 ledger 条目并按 locator 访问目标区域） | transcript + 工件 | 仅 A1 |
| staleness 后误用率 | 编辑 stale 条目（hash 不符或已声明 invalidation）指向区域且未先重读的次数 / stale 命中总数 | transcript + 工件 | 仅 A1 |
| tokens / wall time | 每 run 总量 | harness 报告 | 两臂 |
| ledger 准确率 | cites 可解析率（ID 存在、locator 路径与 span 在冻结时有效） | 工件，盲评 | 仅 A1 |

盲评规程：判分者不接触 run 目录名与臂号，材料匿名编号后评分。

## 6. 统计口径

- n=3 只做方向性结论：报每格中位数 + 全部散点，不做显著性检验
- 配对比较按 (task, rep) 对齐：T1-A1-r1 对 T1-A0-r1
- 结论用语只允许三档：成立 / 不成立 / 无结论

## 7. 结果（跑数后填写）

### 7.1 Run 总表

| run | 通过 | tokens | wall time | search-to-first-edit | 备注 |
|---|---|---|---|---|---|
| T1-A0-r1 | | | | | |
| T1-A0-r2 | | | | | |
| T1-A0-r3 | | | | | |
| T1-A1-r1 | | | | | |
| T1-A1-r2 | | | | | |
| T1-A1-r3 | | | | | |
| T2-A0-r1 | | | | | |
| T2-A0-r2 | | | | | |
| T2-A0-r3 | | | | | |
| T2-A1-r1 | | | | | |
| T2-A1-r2 | | | | | |
| T2-A1-r3 | | | | | |

### 7.2 汇总（每格中位数）

| 指标 | T1-A0 | T1-A1 | T2-A0 | T2-A1 |
|---|---|---|---|---|
| 通过数（/3） | | | | |
| search-to-first-edit | | | | |
| tokens | | | | |
| wall time | | | | |
| reuse ratio | — | | — | |
| ledger 准确率 | — | | — | |
| staleness 误用 | — | | — | |

### 7.3 假设判定

| 假设 | 判定 | 依据 |
|---|---|---|
| H1 | | |
| H2 | | |

### 7.4 观测记录（不判定）

- A1 在 T2 的形态选择实际是什么（plain text / minimal / full），与判断理由
- ledger 准确率实际值与失败模式分类
- 偏差与意外：run 失败、工具异常、SDD 歧义暴露

## 8. 效度威胁与局限（结论解释上限）

- n=3 是方向性证据，不足以支撑任何“显著”表述
- 任务只有 T1/T2 一对，结论不外推到其他任务类型
- A1 与 A0 的差含 skill 提示词本身的 token 开销——这是“净效应”定义的一部分，但归因叙述时必须说明
- 验收断言由实验设计者编写，若断言有误，对两臂同等作用，但可能同时错杀
- 模型版本漂移风险由同一时间窗缓解，窗口跨天时在 7.4 记录

## 9. 冻结清单（首跑前逐项确认）

- [ ] T1/T2 的 SDD 与初始 prompt 定稿
- [ ] T1/T2 验收断言脚本可执行且两臂同版
- [ ] 初始 repo commit hash 记录
- [ ] 模型版本、权限模式、思考档位记录
- [ ] 本报告 commit（冻结点）
- [ ] runs/ 目录与归档结构就位

## 10. 附录

- metrics.csv 列结构：`run_id, task, arm, rep, order, pass, tokens, wall_time, s2fe_toolcalls, reuse_ratio, ledger_acc, staleness_misuse, notes`
- 材料：SDD 全文、验收断言脚本、每 run transcript 与工件路径清单（跑后附）
