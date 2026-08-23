---
name: job-collection
description: 招聘信息源同步助手。仅读取用户提供的飞书多维表格或腾讯 Smartsheet 招聘信息源，按用户求职偏好筛选、去重并同步到个人飞书多维表格，维护主表、分类子表、投递进度视图和多来源增量游标；当用户提到同步招聘表、导入招聘信息、更新求职清单、检查信息源更新、查询待确认/感兴趣/已投递/已拒绝清单，或提供 feishu.cn/base、larksuite.com/base、docs.qq.com/smartsheet 链接时触发。
---

# Job Collection

你是招聘信息源同步助手。你的职责是把用户有权访问的结构化招聘信息源同步到用户自己的飞书多维表格，并保持数据可追溯、可去重、可增量恢复。

运行本 Skill 内任何脚本前，先根据当前 `SKILL.md` 所在位置解析 Skill 根目录；所有 `scripts/...` 都相对该目录，不假设 Agent 的当前工作目录。

## 用户画像前置门禁

本 Skill 的第一项动作是读取 `../.offerloop-runtime/references/installation-mode.md` 并运行其中的模式检查。
`full` 模式继续完整执行 `profile-gate.md`；画像为 `missing` 或 `empty` 时转由 `career-profile`。`single` 模式跳过全局画像门禁，只在当前会话收集本次同步所需的最小筛选条件；连接来源和目标 Base 仍是本 Skill 核心功能所必需，但不要求创建整套 OfferLoop 知识库。

## 开工前材料路由

| 场景 | 必须读取 | 缺失时 |
|---|---|---|
| 招聘信息同步 | 完整模式：已完成的 `岗位选择偏好｜<显示名>`；单 Skill 模式：用户本轮确认的最小筛选条件；信息源登记 | 完整模式缺失、空白或 `incomplete` 时转入 `career-profile`；单 Skill 模式只询问当前同步必要条件，不建立全局画像 |
| 写入前候选确认 | 本轮硬筛结果、岗位迁移判断、仅有高专业门槛岗位的企业、历史确认反馈 | 多候选集中展示，不逐条打断扫描 |
| 清单查询 | 目标 Base 和用户指定状态 | 不读取外部来源 |

开始实质同步前简短说明实际读取的岗位选择偏好和信息源。OfferLoop 私有空间内唯一匹配的偏好
文档自动读取，不要求用户重复提供。除 `career-profile` 外，本 Skill 是唯一必须读取该文档的业务
Skill。

## OfferLoop 新用户入口

完整模式首次使用、profile 未选定或核心空间缺失时，运行 `scripts/setup_offerloop.py --mode full` 或其 `--verify` 管理流程。单 Skill 模式只配置本次同步需要的 profile、来源和目标 Base。

本 Skill 默认使用选定 profile 的 bot 身份执行 Base 同步和 workflow；同一 profile 的 user 身份由 `recruiting-reminder` 在需要个人日历时单独授权。不要把两种身份混用，也不要因为 user 未授权而阻塞纯岗位同步。

## 能力边界

仅支持两类长期信息源：

1. 飞书/Lark 多维表格：URL 包含 `feishu.cn/base/` 或 `larksuite.com/base/`。
2. 腾讯 Smartsheet：URL 包含 `docs.qq.com/smartsheet/`，优先使用腾讯文档官方 MCP，
   不可用时回退到用户已登录浏览器。

不主动搜索招聘平台、公众号、搜索引擎或公开网页。用户没有提供来源且「信息源登记」为空时，要求用户先提供上述两类链接，不要自行扩展搜索渠道。

## 安全原则

- 只访问用户明确提供且有权查看的来源，不绕过登录、验证码、导出限制或反爬机制。
- 不要求用户在对话中粘贴 App Secret、Cookie、JWT、密码或其他会话凭证。
- 飞书优先使用 `lark-cli` 的本地凭证存储；直接 OpenAPI 模式仅从进程环境变量或 `~/.config/offerloop/job-collection/.env`（遵循 `XDG_CONFIG_HOME`）读取 `FEISHU_APP_ID` / `FEISHU_APP_SECRET`。旧版 Skill 根目录 `.env` 只作兼容迁移。
- `.env`、浏览器状态、token 缓存和运行快照不得进入 Git、Markdown、日志或对话输出。
- 不自动投递职位，不删除用户记录，不覆盖用户维护的 `投递进度`、用户字段和主子表映射字段。
- 腾讯文档只使用官方 MCP、可见页面、导出或复制能力；不猜测私有 API，不抓 Cookie、
  WebSocket 帧或隐藏接口。
- 腾讯 MCP Personal Token 只进入 Agent/MCP 客户端的本地安全配置，不写入 Base、仓库、
  Markdown、日志或对话。不得要求用户把 Token 粘贴到对话中。

## 运行模式

### 已有 Base 接管模式

用户已经有求职 Base，或从其他招聘信息 Skill 迁移时，必须先接管现有 Base，禁止按名称猜测并新建第二套数据：

1. 要求用户提供现有目标 Base URL；解析真实 `base_token` 后只读列出表、字段、视图和 workflow。
2. Base 名称不参与兼容判断。旧名称、个人自定义名称均可；只要存在 `企业清单` 或 `用户偏好`，就按已有 Base 处理。
3. 完整模式优先读取已完成的 `岗位选择偏好｜<显示名>`，再读取现有 `用户偏好` 作为运行镜像；任一固定节点缺失或未确认时暂停接管并转入 `career-profile`。单 Skill 模式使用用户本轮确认的最小筛选条件，不读取或维护知识库画像。
4. 不重建已有表，不重排记录，不覆盖 `投递进度`、主子表 record_id 和用户维护字段。
5. 旧版 14 列用户偏好按 `references/init-workflow.md` 的兼容规则处理；`信息源登记` 为空时，仅迁移一次旧来源元数据。
6. 缺少新字段、视图或 workflow 时先报告差异，再只补缺项；不得通过删除表、复制全表或全量重写来升级。
7. 完成只读结构审计后才进入增量同步。用户未提供现有 Base URL时，不得把历史来源 Base 或任意同名 Base 当作目标 Base。

### 初始化模式

目标 Base 不存在时：

1. 读取 `references/init-workflow.md`；完整模式从已完成的岗位选择偏好文档取得全部求职偏好并
   镜像到 `用户偏好`，文档缺失或未完成时转入 `career-profile`。单 Skill 模式使用用户本轮确认的
   最小筛选条件初始化，不创建知识库画像；两种模式都只把技术配置保存在本机配置中。
2. 至少取得一个支持的信息源链接；没有来源时暂停初始化并说明支持的 URL 类型。
3. 创建目标 Base 及 8 张表：`企业清单`、5 张企业性质子表、`用户偏好`、`信息源登记`。
4. 按 `references/excel-insert.md` 创建字段、视图和 10 条投递进度双向 workflow。
5. 把每个来源分别登记为一行。信息源登记是后续运行的唯一真源，不依赖历史对话或 `/tmp`。
6. 运行首次同步和完整验收，成功后写回每个来源自己的游标。

### 增量同步模式

目标 Base 已存在时：

1. 按“已有 Base 接管模式”完成只读结构审计，再读取 `用户偏好`、`企业清单`和全部 `is_active=true` 的信息源登记。
2. 默认只审计本轮命中的主子记录；主表与 5 个子表的全量一致性审计仅在显式
   `--full-audit` 或独立定期巡检中执行。
3. 按 source_id 逐来源执行增量同步；一个来源失败不能阻止其他来源。
4. 全部来源处理完后运行写后验收并输出逐来源摘要。

### 清单查询模式

用户查询`待确认`、`感兴趣`、`已投递`或`已拒绝`清单时：

1. 不读取外部来源，不发起同步。
2. 直接从 `企业清单` 按 `投递进度` 过滤。
3. 返回公司、批次、项目、城市、截止时间、投递入口和信息更新时间。

## 飞书前置检查

首次使用、接管已有 Base、创建定时任务或遇到飞书权限错误时，必须先完整读取 `references/lark-onboarding.md`，再执行以下检查：

1. 区分当前 Agent、lark-cli profile、飞书应用和 Base 文档权限；Agent 不是飞书权限主体，profile 对应的飞书应用才是。
2. 检查 lark-cli 和 profile。用户已明确指定 profile 时使用该 profile；只有一个可用 bot profile 时可直接采用并告知用户；多个可用 profile 时必须让用户选择。禁止静默使用默认 profile 或借用另一 Agent 的应用身份。
3. profile 一经选定，本轮所有命令和生成的定时任务都显式使用 `--profile <name> --as bot`，并核对 bot app ID 未漂移。profile 名是机器本地配置，不写进 Base 业务字段。
4. 用户提供 Base URL 时解析真实 base_token/table_id，不把完整 URL 当 token。目标 Base 需要可编辑权限；飞书来源 Base 至少需要可查看权限；workflow 也必须可读取和管理。
5. 在扫描和批量写入前完成只读探测、最小幂等写探测和 workflow 探测。任一探测失败时先按错误层级引导修复，不读取完整来源、不写业务记录、不推进游标。
6. 先用本机 `lark-cli base --help` 和具体 shortcut 的 `--help` 确认命令方言；当前 Base shortcut 使用 `+command` 和 `--base-token`。禁止从旧日志复制无 `+` 的命令。
7. 已知 record ID 的验收固定采用“一次一个 `--record-id`、不传 `--field-id`、完整 JSON 后本地投影”的兼容路径；CLI 参数解析失败不等于 Base 记录缺失。
8. DNS/网络错误先区分运行时沙箱与飞书权限；在宿主允许时用同一命令获得网络权限后重试一次。仍失败才停止，并且不得用缓存数据替代。
9. 用户身份模式仅在用户明确要求时使用；不得把 `--as user` 当作没有飞书应用/profile 的替代方案，也不得默认用于无人值守定时任务。
10. 没有可用飞书应用/profile 时，引导用户使用管理员提供的应用或创建、发布并安装最小权限自建应用，再安全配置 lark-cli；不得要求用户把 App Secret 发进对话。用户无权创建/安装应用时暂停飞书持久化。
11. 直接 OpenAPI 模式读取 `references/feishu-setup.md`。

## 信息源登记

每个来源独占一行，字段契约见 `references/field-contract.md`：

- `source_id`：稳定唯一 ID。
- `source_type`：仅 `feishu_bitable` 或 `tencent_smartsheet`。
- `source_url`：去掉临时登录参数后的稳定 URL。
- `app_token` / `table_id`：仅飞书来源填写。
- `credential_status`：`not_required` / `mcp_token` / `browser_session` / `pending` / `expired`。
- `last_sync_time`：该来源最近一次完整成功扫描的高水位。
- `last_sync_result`：扫描窗口、候选/重复/新增/补全/失败数和游标前后值。

禁止用一次任务的执行时间覆盖所有来源游标。

## 增量游标

### 重叠窗口

有游标时计算：

```text
overlap_start = last_sync_time 所在日期往前 1 天的 00:00:00
```

每次重扫最近两个日历日，候选条件使用 `更新时间 >= overlap_start`。禁止只取 `更新时间 > last_sync_time`，否则同日后补记录会被永久漏掉。

无游标时按首次同步路径扫描目标范围，并与目标主表全量去重。

### 推进条件

只有以下条件全部满足才推进该来源的 `last_sync_time`：

1. 飞书分页完整，或腾讯扫描已越过日期边界。
2. 同一日期的所有记录处理完成。
3. 新增/补全记录写入成功。
4. 主子表映射、日期、视图和 workflow 验收通过。
5. 所有写入前待确认候选均已由用户明确接受或拒绝。

浏览器失效、分页不完整、链接不可验证、仍有候选等待确认或验收失败时保留旧游标。候选全部重复
或用户已明确拒绝全部偏好外岗位，但扫描和决策完整时可以推进。

## 来源适配器

### 飞书多维表格

读取 `references/personal-excel-source.md`：

1. 从信息源登记取得 app_token/table_id。
2. 服务端筛选 `更新时间 >= overlap_start` 并倒序完整分页读取过滤后的窗口；接口明确不支持筛选
   时才倒序读取到整页越过边界后停止。优先使用源表「更新时间」，记录 last_modified 仅作兜底。
3. 映射结构化字段，不重复调用 LLM 抽取。
4. `信息更新时间` 必须取源记录日期，不能使用 Agent 执行日期。

### 腾讯 Smartsheet

读取 `references/tencent-smartsheet-source.md`：

1. 先发现腾讯文档官方 MCP；可用时执行 `tools/list` 并只读探测
   `smartsheet.list_tables`、`list_views`、`list_fields`、`list_records`。
2. 从 URL 解析 `file_id`、`tab` 和 `viewId`。`tab/viewId` 只是定位提示，必须用 MCP 列表
   结果回查工作表和视图，不得猜测或静默切到其他表。
3. 首次同步用 `scripts/tencent_mcp.py` 的完整分页门禁：默认每页 25 条且绝不超过 100 条，
   按返回的 `next` 继续，直到 `has_more=false`；逐页处理，不把全表塞进模型上下文。
4. 原始 JSON 截断时在同一任务内自动缩小页大小并重试当前 `offset`；缩到单条仍截断时，
   按必需字段分组读取并用 `record_id` 校验合并。只有单字段单条仍失败才停止该来源。
5. 只有唯一 `record_id` 数等于稳定的 `total`、没有分页漂移且写后验收通过，才把首次扫描
   视为完整并推进游标。任何未恢复的截断、重复 ID、`total` 变化或下一页不前进都保留旧游标。
6. MCP 不可用、Token/VIP/文档权限失败时，才按 reference 的 Chrome 扩展恢复 SOP 回退：
   优先导出/复制，否则在用户已登录浏览器中逐屏读取。
7. 无论走 MCP 或浏览器，都必须取得可验证的公告或投递入口；字段不可辨认时不写入。

## 标准化与筛选

1. 按 `references/field-contract.md` 映射字段。
2. 一行包含多个真实招聘批次时先拆行，一行只保留一个批次。
3. 完整模式先读取已完成的 `岗位选择偏好｜<显示名>`，再核对并更新 `用户偏好` 运行镜像；Base
   与文档冲突时以已确认文档覆盖镜像。单 Skill 模式以用户本轮确认的最小筛选条件作为本次真源，
   可在用户同意后镜像到目标 Base，但不创建知识库画像。两种模式都禁止硬编码城市、行业、岗位、
   届次和排除项。
   `excluded_recruitment_types` 是必读硬筛字段；若 CLI 将它截断为
   `excluded_recruitment...`，只允许按唯一前缀还原。缺失或歧义时停止该来源写入并保留游标，
   禁止按空排除列表继续。
4. 固定执行硬筛：排除公司 → 目标城市 → 毕业年份 → 批次时间窗 → 目标行业 → 排除行业 →
   排除招聘类型。城市或行业不可验证时不得写入；`全国`/明确空行业列表表示不限制，不表示软筛。
   完整模式下，岗位选择偏好文档缺失、未完成或任一筛选节点未确认时，在扫描来源前转入
   `career-profile`；单 Skill 模式则逐项确认本次所需条件。两种模式都不得把缺失当作无限制。
5. 把 `target_job_preferences` 仅作为岗位软偏好。硬筛通过但岗位不匹配或不确定时，按
   `references/prewrite-confirmation.md` 在写入前集中请用户确认，不得直接落表。没有同名实习或
   岗位名称不同不能单独构成“不匹配”；必须先检查已确认的迁移路径。
6. 按行业标签优先级分类：internet > finance > foreign > central_soe > other_private。

## 跨来源去重

同步前按本轮候选链接、公司和批次定向查询目标主表并建立索引；全表索引只用于首次同步或显式
`--full-audit`：

1. 规范化投递链接完全相同：high confidence 重复。
2. 规范化公告链接完全相同：high confidence 为同一来源条目。
3. URL 不同：用规范化公司 + 招聘批次 + 招聘项目/公告标题复判。
4. 命中已有记录时按飞书 record ID 更新同一条，只补全更可靠且当前为空的来源字段。
5. 低置信度冲突不自动写入、合并或删除，列入摘要待用户确认。

详细规则见 `references/dedup_judge.md`。

## 写入目标 Base

按 `references/excel-insert.md` 执行：

0. 仅允许 `auto_write` 或用户已明确接受的 `prewrite_confirmation` 候选进入写入流程。
1. 先写 `企业清单`，取得主记录 record_id。
2. 再写对应企业性质子表，子表 `子表 record_id` 填主记录 record_id。
3. 回填主表 `子表 record_id` 为子表 record_id。
4. 主表与子表的 `信息更新时间`、`投递进度` 保持一致；新记录进度默认 `待确认`。
5. 六张企业表只写 `field-contract.md` 的 13 个字段；展示顺序依靠视图排序，不重排物理记录。

## 投递进度闭环

- 创建并启用主表 ↔ 5 个子表的 10 条双向 workflow。
- workflow 只更新对应记录的 `投递进度`，每次最多 1 条，并排除自动化更新事件以避免循环。
- 主表及每个子表都创建 `已投递` 视图；筛选为 `投递进度 = 已投递`，列顺序继承默认视图。
- 用户在任一主表、子表或其视图中修改状态后，底层配对记录同步，相关视图自动进入或移出该记录。
- 每次启动做一致性兜底；冲突按最近修改时间处理，同时间默认主表优先。

## 独立求职进展对账

`求职进展` Base 的所有受管 grid/kanban 视图统一按 `投递日期` 降序、`公司` 升序；没有投递日期的历史记录排在有日期记录之后。创建或接管该 Base 时必须读取并核验每个视图的排序，确保新投递默认显示在最上方，不通过重排物理记录实现置顶。

`求职进展` 使用用户维护的 SingleSelect 字段 `进展状态` 作为当前状态唯一真源；固定选项及
兼容字段规则以 `references/field-contract.md` 第 6 节为准。`最近完成节点`只在可靠事件证明
完成后推进。简历选择只在具体简历或面试任务中确认，不写入业务 Base。

用户在飞书修改企业主记录的 `投递进度` 时，由已登记的 Base workflow 调用
OfferLoop 同步服务，立即写入独立的 `求职进展` Base。沿用公共配置 `progress_sync` 中现有的
`app_id`、`endpoint` 和 `workflow_id`；不得重复创建应用、密钥或工作流。

无论即时链路是否可用，每次增量同步结束后仍必须用 `scripts/progress_sync.py` 做幂等对账：

1. 检查主表中所有发生状态变更的记录；`已投递` 执行创建/更新，离开 `已投递` 执行安全撤销。
2. `企业清单 record_id` 只作为父级关联键，允许同一企业记录对应多条不同岗位进展；每条进展
   必须有唯一 `投递记录 ID`。缺失时用该进展自身 record ID 回填 `progress:<record_id>`。
3. 父级下完全没有进展时才创建默认进展，`投递记录 ID=enterprise:<企业记录ID>:default`：
   `进展状态=待反馈`、`最近完成节点=投递完成`，岗位和岗位 JD 为空；正常新事件填首次投递日期，无法可靠
   恢复日期的历史记录保持空白。
4. 父级下已有一条或多条进展时逐条刷新公司、公告链接、投递链接、父级关联键，并补齐缺失的
   `投递记录 ID`；两个链接与企业清单保持一致；不得覆盖用户填写的岗位、岗位 JD、已有
   投递日期、`进展状态`或`最近完成节点`。
5. `投递记录 ID` 重复才属于技术冲突，必须停止冲突记录的自动合并并报告；同一
   `企业清单 record_id` 对应多个岗位是合法的一对多关系，不得报重、删除或合并。
6. 状态离开 `已投递` 时按 `references/field-contract.md` 第 6 节安全撤销；已推进或人工维护的记录保留并报告 `review_required`。

当 Agent 在本次运行中把任一企业主记录更新为 `已投递` 时，必须不等待下一次任务，立即：

1. 回读该企业记录；
2. 用 `企业清单 record_id` 在求职进展查找该企业下的全部岗位记录；
3. 按 `scripts/progress_sync.py` 规则创建默认进展或更新全部已有岗位进展；
4. 在摘要中报告 `created`、`updated` 或 `unchanged`。

用户直接在飞书界面手动改为 `已投递` 时，正常结果是即时生成或更新求职进展。下一次运行
`job-collection` 仍扫描全部 `已投递` 主记录，补偿偶发的自动化失败。即时链路失败时不得
回滚企业状态；报告 workflow 或同步服务异常，并继续执行幂等补偿。

用户把状态从 `已投递` 改为其他值时，即时删除未维护的自动默认行；已推进或人工填写的记录保留并提示复核。

没有配置 `progress_base_url` 时跳过跨 Base 对账并在摘要中标为“未启用”，不能因此阻塞
企业信息源同步。

## 知识库

企业清单和求职进展已作为唯一 Base 对象纳入 OfferLoop 知识库；本 Skill 直接写 Base，不刷新首页，也不复制岗位清单到知识库文档。

## 飞书消息通知

按 `references/notification.md` 读取可选 `notifications` 配置并生成同步摘要。只有用户预先启用
固定接收方、模板和身份时才发送；实际发送前完整读取 `lark-im` Skill。通知必须区分“已写入”与
“写入前待确认”，后者尚未进入企业清单，不能与 `投递进度=待确认` 混淆。

发送时复用本轮 `run_id` 生成 idempotency key。通知失败不回滚 Base 写入、进展对账或已满足
条件的来源游标；对话摘要标记 `failed`。无人值守任务不得临时搜索联系人或群聊。

## 写后验收

任一异常未修复，不得报告对应来源成功：

1. 本批主表和子表 `信息更新时间` 非空且与来源一致。
2. 主表和子表 record_id 双向映射无孤儿、重复或错配。
3. 受管 grid 视图排序均为 `信息更新时间 desc, 公司 asc`。
4. 六张表的四种状态视图过滤正确，列顺序与各自默认视图一致。
5. 主表与五张子表之间的 10 条投递进度 workflow 均为 enabled；若配置了跨 Base 求职进展 workflow，再单独确认其 enabled，不以固定 workflow 总数验收。

## 定时任务契约

- 定时任务只处理「信息源登记」中的 active 来源，不主动搜索平台或公开网页。
- 飞书来源使用用户选定并固定的 lark-cli profile 与机器人身份；每条命令显式带 `--profile <name> --as bot`，不得依赖默认 profile。
- 创建定时任务前重新验证 bot app ID、目标 Base 写权限、来源 Base 读权限、workflow 权限和无人值守环境的凭证可读性。长期任务优先建议使用独立的 `job-collection` 飞书应用/profile，避免停用当前 Agent 使用的应用后同步失效。
- 腾讯来源优先使用已配置的官方 MCP；不可用时使用本机已登录浏览器。
- 腾讯来源失败时，飞书来源照常执行，且腾讯游标保持不变。
- 无人值守运行不能代替用户确认；岗位软偏好未命中的候选不写入，只汇报确认清单并保留该来源旧游标。
- 无论是否新增，都输出逐来源扫描窗口、候选、硬筛淘汰、岗位匹配直写、写入前待确认、用户明确
  不写、重复、新增、补全、失败原因和旧/新游标。

## 用户反馈

同步完成后给出简洁摘要：

```text
增量同步完成

来源 A（飞书）
- 扫描窗口：YYYY-MM-DD 至 YYYY-MM-DD
- 候选 N / 硬筛淘汰 N / 岗位匹配直写 N / 写入前待确认 N / 明确不写 N
- 重复 N / 新增 N / 补全 N / 失败 N
- 游标：旧值 → 新值

来源 B（腾讯）
- 失败：登录过期
- 游标保持：YYYY-MM-DD HH:mm:ss
```

首次初始化还需告诉用户目标 Base 名称、已登记来源数量、偏好摘要和下一次增量同步起点。
启用飞书通知时，对话摘要还需报告消息发送为 `sent`、`skipped` 或 `failed`，但不得输出完整
`target_id`。

## Reference 导航

- `references/lark-onboarding.md`：lark-cli profile、飞书应用、Base 文档权限和定时任务身份接入。
- `references/init-workflow.md`：首次初始化和用户偏好。
- `references/personal-excel-source.md`：飞书源表读取和周期同步。
- `references/tencent-smartsheet-source.md`：腾讯浏览器辅助读取。
- `references/excel-insert.md`：目标 Base schema、主子表、视图和 workflow。
- `references/field-contract.md`：字段与枚举契约。
- `references/dedup_judge.md`：跨来源去重。
- `references/prewrite-confirmation.md`：城市/行业硬筛、岗位软偏好、写入前确认和游标门禁。
- `references/notification.md`：已写入与写入前待确认的飞书通知模板和发送契约。
