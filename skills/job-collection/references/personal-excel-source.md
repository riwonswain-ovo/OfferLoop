# 飞书多维表格来源

飞书 Base 来源必须通过实时 OpenAPI 数据同步。不得使用历史快照、本地临时文件或旧脚本代替
「信息源登记」、用户偏好或远端记录。

## 1. 来源定位

1. 只从目标 Base 的「信息源登记」读取 `is_active=true` 的来源。
2. 以该行的 `source_id`、`app_token`、`table_id`、`last_sync_time` 为唯一定位信息。
3. `source_url` 仅用于回溯；不要从历史对话或自动化记忆还原 token、table ID 或游标。
4. URL 缺少 `table` 参数时暂停该来源，不能猜测 Base 中的目标表。

## 2. 读取约定

飞书身份、profile、Base 权限和固定通知群由初始化流程配置。普通同步复用已保存身份；定位缺失或权限
失效时转入初始化修复。当前 CLI 的 Base shortcut 使用带 `+` 的命令名和 `--base-token`，例如：

```bash
lark-cli base +table-list --base-token <BASE_TOKEN> --profile <PROFILE> --as bot
lark-cli base +record-list --base-token <BASE_TOKEN> --table-id <TABLE_ID> --format json --profile <PROFILE> --as bot
```

不要凭记忆混用旧版 `record-list`、`record-get` 或 `--app-token` 语法；先以本机
`lark-cli base --help` 和具体 shortcut 的 `--help` 为准。

已知兼容路径：

- 已知 record ID 的写后回读：每次只传一个 `--record-id`，不传 `--field-id`，再从完整 JSON
  本地投影需要字段。
- 不得把重复 `--record-id` 或带字段投影的 `+record-get` 解析错误解释成 Base 数据缺失。
- 批量查找使用 `+record-list` / `+record-search`；分页以返回的 `has_more` 和 offset 为准。

## 3. 用户偏好硬前置

扫描前读取完整的 `用户偏好` 结构化字段。完整模式先读取已完成的
`岗位选择偏好｜<显示名>` 并刷新镜像；文档缺失、未完成或任一节点未确认时转入
`job-collection` 的「用户偏好」。缺失筛选条件时一次只问一个问题并保存用户确认结果。必须取得毕业
年份、目标城市、排除公司、岗位偏好、明确不考虑岗位和
`excluded_recruitment_types`，不能把缺失当作“不限”。行业标签只作展示，不参与筛选。

批次时间窗不是用户偏好字段。候选路由对拆分后的单值 `recruitment_batch` 调用
`scripts/sync_utils.py` 的 `batch_time_window_match()`，根据运行日期和 `graduation_year` 自动判断。
能识别且不在当前投递期的招聘季作为硬条件不匹配；批次名称缺失或无法识别时进入待确认写入。

若 CLI 返回 `excluded_recruitment...`：

1. 仅在该前缀唯一命中 `excluded_recruitment_types` 时还原；
2. 缺失、歧义或值不可确认时停止该来源写入；
3. 保留来源旧游标，禁止按空排除列表继续。

对命中的暑期实习、普通实习和社招执行硬排除。多值招聘类型先结合公告标题判断真实批次，
再拆成“一条记录一个批次”；标题只描述实习招聘时不得机械生成校招副本。

## 4. 有界增量读取

1. 计算 `overlap_start = last_sync_time 所在日期前 1 天的 00:00:00`。
2. 使用 `+record-list --filter-json` 在服务端限定日级
   `更新时间 >= overlap_start`。datetime 字段不支持 `>=` 运算符时，固定表达为
   `更新时间 == ExactDate(overlap_start 日期) OR 更新时间 > ExactDate(overlap_start 日期)`；前者覆盖
   边界整天，后者覆盖所有后续日期。并用
   `--sort-json '[{"field":"更新时间","desc":true}]'` 倒序读取；按返回的
   `has_more` 和 `offset` 完整读取这个**过滤后的窗口**，禁止继续读取窗口外历史页。
3. 只有 API 明确返回不支持该筛选条件时才回退：仍按「更新时间」倒序分页；必须处理完所有
   `更新时间 == overlap_start` 的记录；读到整页均 `< overlap_start` 后立即停止。不得因游标未推进、
   存在待确认项或上次运行失败而重扫全表。
4. `has_more=true` 时空页、响应明确返回但不大于当前值的 offset、跨页重复 record ID 或时间顺序
   逆转均安全失败并保留旧游标。当前 `+record-list` 是请求侧数值 offset 方言；若响应未回传
   offset，按协议使用 `当前 offset + 本页实际记录数` 确定性推进，不得在空页或游标停滞时猜测。
5. 优先使用来源业务字段「更新时间」；缺失时才使用可验证的记录修改时间。
6. 记录实际读取页数和记录数、`overlap_start`、窗口命中数、最大真实来源日期、停止原因、
   是否启用服务端筛选和 `full_audit`。

某页读取失败时按 `failure-handling.md` 最多重试 3 次并保留临时检查点；仍失败则该来源保留正式
游标，其他 source_id 继续执行。

## 5. 映射、筛选与去重

把源字段规范化为 `field-contract.md` 的内部来源对象：

| 常见源字段 | 内部键 |
|---|---|
| 公司 | `company_name` |
| 招聘批次/招聘类型 | `recruitment_batch` |
| 招聘项目/公告标题 | `project_name` |
| 招聘岗位 | `job_positions` |
| 公告链接 | `source_url` |
| 投递链接/官网入口 | `official_url` |
| 截止时间 | `application_deadline` |
| 城市/工作地点 | `location` |
| 行业标签 | `industry_module` |
| 更新时间 | `source_updated_at` |

已经是结构化字段时不要再次用 LLM 抽取。映射不到的来源字段只作临时上下文，不扩展目标表。

完成标准化和多批次拆行后，为每个候选构造 `CandidateRouteInputs`，由 `route_candidate()` 执行统一路由；飞书适配层不复制另一套筛选实现。固定条件顺序为：

1. 目标城市；
2. 毕业年份；
3. 使用候选自己的 `recruitment_batch` 计算批次时间窗；
4. `excluded_recruitment_types`；
5. 排除公司；
6. 岗位偏好与明确不考虑岗位。

任一条件缺失或无法判断，以及同一岗位同时命中愿意考虑与明确不考虑方向，都进入待确认写入。完成路由后按 `dedup_judge.md` 与目标主表候选索引去重，再按 `prewrite-confirmation.md` 处理最终写入状态。

企业性质路由固定为：互联网 > 金融银行 > 外企 > 央国企 > 其他私企。不得把同一记录复制到
多个性质子表。

## 6. 写入与重复

只有岗位匹配或用户明确接受的新记录才按 `excel-insert.md` 执行主表、子表双写和 record ID
回填。待确认写入或用户明确拒绝的候选不落企业表。六张企业表只使用当前 13 字段契约。

命中明确重复时直接跳过，不更新已有业务字段。中低置信度冲突列入待确认写入，不自动合并。

## 7. 写后回读与游标

本批每对主子记录使用单 record、无投影的 `+record-get` 兼容路径回读，确认：

- 公司、来源日期和企业性质正确；
- 主子 record ID 双向一致；
- 新记录状态为 `待确认`，既有状态未改变；
- 公告和投递入口与写入值一致。

日常同步只回读本轮新增或更新的主子记录。字段、视图和 workflow 的完整验收在初始化、接管、
用户显式 `--full-audit` 或实际异常修复时执行。

仅当分页完整、同日全部候选处理完成、没有尚未决定的待确认写入、写入与验收通过且通知成功时，将该来源
游标推进到本批最大真实来源日期。无新增但扫描完整且全部为重复/硬筛淘汰/用户明确拒绝时也可以
推进。写入、回读、待确认写入、通知或验收失败时保留旧游标，
并在 `last_sync_result` 记录失败阶段。

## 8. 内部运行指标

在结构化运行结果中记录扫描窗口、源记录数、拆行后候选、硬筛淘汰、直写、待确认、重复、跳过、
失败、旧/新游标和分页完整性。用户可见输出统一由 `notification.md` 的固定模板生成。
