# 工件规范

`.plan-dossier/` 全部工件文件（L0–L3 与 views/）的结构规范、编写规则与完整示例。编写或审查任一工件文件时加载本文件；分层总览见 SKILL.md 的目录结构表。

## L0 plan.yaml

```yaml
task_id: refactor-payment
version: 1
base: {repo: "acme/api", commit: "abc123", env: ["运行测试前需 source env.local.sh", "基线编译存在 1 个与本次无关的既有失败"]}
objective: "把所有支付校验收敛到 PaymentValidator"

constraints:
  - id: c1
    text: "不要修改 billing 层的分层结构"
    why: "上游按层路由，改层会让 A/B 分流失效"
    trust: unverified
    by: {model: "planner-a", run: "r17", at: "2026-11-19T10:00:00+08:00"}
    rederive_cost: high
  - id: c2
    text: "PaymentService.validate 的公开签名不得变"
    trust: checked
    assertion: {replay: "grep -rn 'def validate' src/payment/", expects: "仅 PaymentService.validate 一处"}

acceptance:
  - "所有下单路径都经过 PaymentValidator"
  - "现有 payment 测试全绿"

dag:
  - {id: s1, task: "tasks/01_extract_validator.yaml", depends_on: []}
  - {id: s2, task: "tasks/02_replace_callers.yaml", depends_on: [s1]}

risks:
  - {id: r1, text: "校验收敛后 RefundService 旁路绕过校验", mitigated_by: ["s2.1"]}

decisions:
  - id: d1
    text: "用组合而非继承"
    why: "避免 PaymentService 的构造参数扩散"
    trust: unverified
    by: {model: "planner-a", run: "r17", at: "2026-11-19T10:05:00+08:00"}

gaps:  # 计划明确未覆盖的判断维度，执行方在这些维度自行判断
  - "金额为零的边界输入分支未逐用例推导"

excluded:
  - {locator: "src/billing.py", reason: "支付校验不在 billing 层"}
  - {locator: "src/legacy/**", reason: "已废弃，不参与调用链"}

open_questions:
  - "退款路径是否也算校验入口（未确认）"
```

编写规则：

- 全文控制在 2K tokens 以内。任务细节已移入 L1，超预算说明有内容应下沉到 ledger 或任务卡。
- `excluded` 与 `gaps` 在计划冻结时必须存在，可为 `[]`，不得省略字段。`excluded` 为空时在 `open_questions` 注明"未做排除"；`gaps` 是规划方对"哪些判断维度明确没做"的显式回答，空列表表示已知维度均已覆盖。
- `gaps` 与 `open_questions` 语义不同：gaps 是已知未覆盖、无需回答的维度；open_questions 是待回答、待裁决的问题。两者不得混放。
- `risks[].mitigated_by` 非空，锚点格式：`aN` 指向 L0 acceptance 第 N 条，`sM.N` 指向任务卡 M 的 acceptance 第 N 条。给不出锚点的风险不是"已设防"，降级写进 `open_questions` 并注明。
- `base.env` 记录执行方不带上就会浪费试错的环境事实（构建前置命令、基线既有失败等），与 commit 同属任务基线。ledger 的 locator 是 path+span，装不下环境事实，且账本目录在 packet 中可被截断，所以放 base 常驻。条目过期（如基线被修复）时，变化在回写 handoff 的情况下经 State Snapshot 传递，不改冻结的 L0。
- `dag[].carryover` 是可选布尔字段，仅由规划方在升版本时写入：该节点规格相对上一版本无实质变更。省略或 `false` 表示节点是新增或重写的。完整标记标准见 [workflow-rules.md](workflow-rules.md)。升到 version 2 时形如：

  ```yaml
  # version: 2 —— s1 已重写，s2 规格原样继承
  dag:
    - {id: s1, task: "tasks/01_extract_validator.yaml", depends_on: []}
    - {id: s2, task: "tasks/02_replace_callers.yaml", depends_on: [s1], carryover: true}
  ```
- `trust: checked` 必须带 `assertion`，`replay` 是一条可原样执行的命令或明确的符号查找，规划方标注 checked 前必须实际执行过一次，未执行过只能标 unverified；`trust: unverified` 必须带 `by`（来源），constraints 还须带 `rederive_cost`（low/medium/high，decisions 免——判断类结论无重推导成本），使用前交叉核对。
- 防回退的一行式排除项放 `excluded`；详细踩坑过程放 ledger（`verdict: excluded` 的条目）。L0 不承载长篇记录。
- `excluded` 是计划的范围约束：对排除项的修改构成计划失效事件，局部失效不自动作废计划的其余部分。事件的检测、记录与修订流程见 [workflow-rules.md](workflow-rules.md)。

## L1 任务卡

```yaml
id: s1
action: "抽出校验逻辑到新模块"
depends_on: []
cites: ["L-0042", "L-0017"]
outputs: ["src/payment/validator.py"]
acceptance:
  - "PaymentValidator 覆盖全部 5 处校验规则"
```

编写规则：

- 一张卡一个 DAG 节点，文件名 `NN_动作简名.yaml`，NN 与 `dag[].id` 的序号一致。L0 的 dag 是权威拓扑；卡内 `depends_on` 是单卡自包含副本，必须与 L0 一致。
- 单卡控制在 1K tokens 以内。超出说明卡内混入了其他节点的内容或账本细节。
- `cites` 只引用 ledger.jsonl 中已存在的条目 ID，不复制条目内容，更不抄源码原文。执行方凭 ID 去账本查定位，再按定位读源码。
- `acceptance` 是本节点的可验证断言，与 L0 的全局验收互补，不得为空。
- 任务卡随 L0 一起冻结（冻结与升版本规则见 [workflow-rules.md](workflow-rules.md)）。

## L2 ledger.jsonl

只追加，每行一条：

```jsonc
{"id": "L-0042", "locator": {"path": "src/payment.py", "span": [20, 45]}, "verdict": "relevant", "intent": "定位支付校验入口", "cost": {"tool_calls": 12, "tokens": 4800}, "by": {"model": "planner-a", "run": "r17", "at": "2026-11-19T10:02:00+08:00"}, "supersedes": null, "region_sha": "sha256:44ae...", "invalidation": ["PaymentService.validate 签名变化", "src/payment.py 被移动或改名"]}
```

记录始终是自主裁量，按搜索成本（而非读取成本）衡量的重新获取成本判断：只有当条目价值（重新获取成本 × 预计复用次数）明显超过记录成本时才写入，账本为空或稀疏都可接受，不为合规而记录：

| 场景 | 记录 | 原因 |
|---|---|---|
| 已知路径，直接打开文件 | 否 | 重新打开只需数百 tokens |
| 经过多次 grep，排除大量候选后定位 | 是 | 重新获取等于再搜索一遍 |
| 排除了某个模块或目录 | 是 | 一行记录避免一次大范围探索 |
| 大文件的局部阅读 | 是 | 重新读取需要重新定位 |

字段规则：

- `verdict` 只取 `relevant`、`excluded`、`unknown` 之一。
- 修订旧结论时追加新行并在 `supersedes` 写入被替代条目的 ID，不修改原行。
- `region_sha` 可选。有运行时支持时自动计算；没有时省略——不带哈希的条目没有完整性保证，本身不足以作为编辑依据，编辑时需读取目标片段。
- `invalidation` 可选，规划阶段写入：声明式失效条件，写明在什么情况下本条结论不再成立（如"被引用符号的签名变化""被引用文件被移动"）。它是规划侧元数据，为既有的上下文失效流程提供显式触发依据；不给下游阶段新增任何义务——执行方加载片段时走的失效流程与从前完全一致。写不出具体条件时省略；模糊条件（"代码变了"）比不写更糟。
- 账本不存源码内容：存下的内容会静默过期，且没有检测手段。账本只存定位与结论，需要时按定位读取源码。

## L3 handoff/NN_to_MM.md

单份 handoff 的文件结构；是否写入与何时写入（执行方可选、推荐）以及"三段齐全才合法"的契约见 [workflow-rules.md](workflow-rules.md)。三段为：

```markdown
# s1 → s2

## Actual Outputs
- src/payment/validator.py（新建，5 处校验规则）

## Deviations
- 计划说 3 处调用点，实际 4 处，第 4 处在 RefundService

## State Snapshot
- L-0042 已过期（src/payment.py 在 s1 中被修改），s2 前需重读
- 新符号 PaymentValidator 已可被 s2 直接引用
```

- `Actual Outputs`：实际产生或修改的文件路径与摘要。
- `Deviations`：相对计划的偏离、新发现、临时妥协。没有偏离时写"无"。
- `State Snapshot`：下游启动前必须注意的事项，包括哪些账本条目已因本次修改过期。

## views/（编译产物）

- `plan.view.md`：由 plan.yaml + tasks/ 渲染的人类审阅视图，包含目标、约束、DAG 表（静态拓扑与 carryover 标记，不含执行状态）、每卡摘要、排除项。交付用户审批时给这份，不给裸 YAML。
- `review.packet.md`：审查隔离视图，内容只有四项——原始需求、变更差异、变更文件修改前后的完整内容、验收标准。由交接时编译生成，不手工编辑，不包含 plan.yaml、任务卡、excluded、账本、handoff。
- views/ 整个目录可删除可重建，冲突时以 L0-L3 为准。
