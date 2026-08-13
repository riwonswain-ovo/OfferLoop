# 腾讯智能表格来源

腾讯 Smartsheet 是 `job-collection` 的一个结构化来源分支。读取顺序固定为：

1. 腾讯文档官方 MCP；
2. 用户有权使用的 XLSX/CSV 导出或复制；
3. 用户已登录 Chrome 中的可见页面分批扫描。

只使用用户明确提供且有权查看的 `https://docs.qq.com/smartsheet/` 链接。不猜测私有 API，
不读取 Cookie，不抓 WebSocket 帧，不绕过登录、VIP、内容权限、验证码或导出限制。

## 官方 MCP 首选

腾讯文档官方 MCP 端点为 `https://docs.qq.com/openapi/mcp`。Personal Token 只能配置在
Agent/MCP 客户端的本地安全存储中，不写入 Base、仓库、Markdown、日志或对话。不得要求用户
把 Token 粘贴进对话。

开始前按当前 Agent 的连接器发现规则查找 `tencent-docs` MCP。没有连接器时报告
`credential_status=pending`，继续执行“浏览器兜底”；不能猜测或调用腾讯私有接口。

### MCP 只读预检

实际工具定义以 MCP `tools/list` 为准，不从历史日志硬编码。至少确认以下工具存在：

- `smartsheet.list_tables`
- `smartsheet.list_views`
- `smartsheet.list_fields`
- `smartsheet.list_records`

依次执行最小只读探测：

1. 从来源 URL 解析 `file_id`、`tab`、`viewId`。
2. `smartsheet.list_tables(file_id)`，确认目标工作表存在且可见。
3. `smartsheet.list_views(file_id, sheet_id)`，确认目标视图。
4. `smartsheet.list_fields(file_id, sheet_id, limit=100)`，完整分页取得字段定义。
5. `smartsheet.list_records(file_id, sheet_id, view_id, offset=0, limit=1)`，
   验证记录读取、真实链接和日期值格式。

URL 中的 `tab` 和 `viewId` 只能作为定位提示。必须用 MCP 返回的工作表、视图 ID 和标题复核，
不能因为网页参数看起来像 ID 就跳过 `list_tables/list_views`。目标 URL 指向登记的工作表时使用
该工作表；用户明确要求“每日更新”时按标题精确匹配，并确认 API 返回 ID 与目标一致。

以下任一情况停止 MCP 写入路径并保留旧游标：

- Token 鉴权失败；
- VIP 权限不足；
- 来源文档对 Token 所属用户不可见；
- 目标工作表或视图无法唯一定位；
- 必需字段缺失或返回类型无法解释；
- 公告链接和投递链接只返回不可验证的显示文本。

## 首次存量完整分页

首次同步不得依赖一次 MCP 调用、一次模型回复或客户端展示的首屏结果。固定使用
`scripts/tencent_mcp.py` 的完整分页门禁：

```text
offset=0, limit=25
  → JSON 截断：25 → 12 → 6 → 3 → 1，重试同一 offset
  → 单条仍截断：按字段分组读取，用 record_id 校验合并
  → 处理并落地本页
  → has_more=true：offset=next
  → has_more=false：停止
  → 唯一 record_id 数必须等于稳定 total
```

### 分页规则

1. `limit` 默认 25、最大为 100；不得通过超大单页请求规避分页。默认值来自当前腾讯 MCP
   调用链的实测安全起点，不把它视为服务端永久不变的上限。
2. 每页只请求同步必需字段，优先包括：公司/公告标题、更新时间、截止日期、行业、招聘类型、
   工作地点、公告入口和投递入口。字段名以源表真实列名映射，不臆造不存在的列。
3. 原始文本不是完整 JSON 或 UTF-8 时，自动将页大小减半并重试同一 `offset`；一旦找到安全
   页大小，后续页沿用该值，避免重复触发截断。此恢复发生在同一次任务内，不要求用户重新发起。
4. 页大小缩到 1 仍截断时，递归拆分 `field_titles`，分别读取同一行；各分组的 `total`、
   `has_more`、`next` 和 `record_id` 必须一致，才能合并。单字段单条仍截断则失败关闭。
5. 每页必须明确包含 `total`、`records`、`has_more/hasMore` 和 `next`。返回摘要、字段省略或
   无法解析的内容不能进入后续处理。
6. 每页返回后立即标准化、硬筛和去重；按 `prewrite-confirmation.md` 只写岗位匹配或用户明确
   接受的候选，模型上下文中不保留全表原始数据。
7. 记录本页 `offset`、`next`、实际页大小、截断重试次数、返回数、累计唯一 `record_id` 数和
   首尾更新时间。
8. `has_more=true` 但本页为空、`next <= offset`、某页失败、重复 `record_id`、
   `total` 在分页期间变化，均视为来源发生漂移或结果截断。
9. 最后一页必须同时满足 `has_more=false`、所有页无错误、唯一 `record_id` 数等于 `total`。
10. 完整扫描期间若来源发生变化，保留旧游标；重新扫描或在低峰期运行，并在完整扫描后重扫
   顶部重叠窗口。不得把不完整结果汇报为首次全量完成。

MCP 可能把工具结果放在 `structuredContent`，也可能放在单个 text content 中。只有成功解析成
包含 `total`、`records`、`has_more/hasMore` 和 `next` 的对象后才能进入分页判断。客户端把输出
截断、总结或省略字段时，必须失败关闭。

## 增量读取

1. 使用该来源自己的 `last_sync_time` 计算
   `overlap_start = last_sync_time 所在日期往前 1 天的 00:00:00`。
2. 调用 `smartsheet.list_records`，按源表真实“更新时间”字段降序排列，默认每页 25 条，
   遇到截断按首次存量分页规则自动缩页。
3. MCP 当前没有通用条件过滤参数时，从顶部逐页读取；看到 `< overlap_start` 的日期后，
   仍需处理完该页以及边界日期的全部记录再停止。
4. 每页按 `record_id` 和全局招聘去重索引处理。行号、`offset` 只用于单次运行连续性检查，
   不能作为跨日业务游标。
5. 更新日期必须取来源字段，不使用 Agent 执行时间。
6. 只有目标窗口扫描完整、同日记录处理完成、没有尚未决定的写入前确认、写入与写后验收全部通过，才推进
   `last_sync_time`。
7. 候选全部重复但窗口完整时可以推进；MCP 失败、分页不完整或链接不可验证时保留旧游标。

## 字段与链接

先用 `list_fields` 获取字段标题和类型，再把源字段映射到 `field-contract.md`。不得要求 LLM
重新猜测结构化字段。

- 文本字段读取其真实文本。
- 日期字段按腾讯 MCP 返回的毫秒时间戳或明确日期字符串解析。
- URL 字段必须取得真实 `link`；只有“点击查看”等显示文字时不得伪造 URL。
- 单选/多选字段保留真实选项文本。
- 一行包含多个真实招聘批次时按主流程拆行。

每行至少需要公司或可可靠解析公司的公告标题，并取得公告入口或投递入口之一。两类入口都缺失时
不写入生产表，列入待确认。

## 浏览器兜底

官方 MCP 不可用时，才使用以下路径。MCP 来源失败不能阻止其他来源继续处理。

### Chrome 扩展恢复 SOP

腾讯登录态只允许来自用户自己的 Chrome 会话。开始前完整读取当前 Agent 可用的浏览器控制
能力说明，并按其连接与清理规则执行：

1. 检测浏览器控制能力；首次连接失败后等待约 2 秒，仅重试一次。
2. 仍失败时运行官方诊断：Chrome 运行状态、扩展启用状态和 native host。不得读取 Cookie
   或手工修改 native host。
3. 诊断正常但通道未连接时，在用户已授权的前提下打开 Default Profile 新窗口并重试。
   仍失败则要求用户导出 XLSX/CSV；不用 AppleScript、私有 API或未登录内置浏览器替代。
4. 连接成功后命名会话，优先认领精确匹配的腾讯标签；没有现成标签时再新建标签。
5. 任务结束前恢复临时 viewport，并按 Chrome Skill 的 `tabs.finalize` 规则释放会话。

### 导出、复制和视觉扫描

1. 打开来源 URL，确认标题、只能查看/可编辑状态、目标工作表和目标视图。
2. 打开“文件”菜单实测导出和复制权限；能导出时优先使用 XLSX/CSV 完成结构化首次回填。
3. 导出/复制均不可用时，在可见行号、日期和链接都能复核的前提下逐屏扫描。
4. 每屏与上一屏重叠 1-2 行，记录首尾行号、首尾日期、累计读取数和停止位置。
5. 中断后从检查点前 1-2 行恢复，用公司、日期和链接核对连续性；行号不作为跨日游标。
6. 必须处理完同一日期并看到 `< overlap_start` 的记录后才能停止增量扫描。
7. OCR 只能帮助定位候选行；字段和真实 URL 必须由可见单元格或点击后的页面复核。

不得只读取首屏 8-12 行后推进游标，也不得因为待扫描行数超过固定阈值就宣称无法完成。
只有关键字段不可辨认、行号不连续或链接无法验证时才暂停。

## 登记与验收

腾讯来源仍使用 `source_type=tencent_smartsheet`：

- MCP 只读预检通过：`credential_status=mcp_token`。
- MCP 不可用但浏览器登录态通过：`credential_status=browser_session`。
- 尚未配置或无法验证：`credential_status=pending`。
- Token 或会话过期：`credential_status=expired`。

`source_url` 保留稳定的 Smartsheet URL 和目标 `tab/viewId`，删除临时登录参数。Token 不写入
任何业务字段；`app_token/table_id` 仍只用于飞书来源。

每次摘要报告：访问模式、目标工作表/视图、扫描窗口、页数、请求/最小实际页大小、截断重试数、
字段拆分页数、来源 `total`、累计唯一记录数、重复数、硬筛淘汰/通过数、岗位匹配直写数、
写入前待确认数、用户明确不写数、主子表新增/补全数、日期缺失数、映射异常数、排序异常数和
游标是否推进。
首次同步只有完整翻页并通过验收时才能称为“存量完整扫描”；增量同步要明确扫描的日期窗口。
