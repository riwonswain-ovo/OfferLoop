# 飞书多维表格来源

飞书 Base 来源必须通过实时 OpenAPI 数据同步。不得使用历史快照、本地临时文件或旧脚本代替
「信息源登记」、用户偏好或远端记录。

## 1. 来源定位

1. 只从目标 Base 的「信息源登记」读取 `is_active=true` 的来源。
2. 以该行的 `source_id`、`app_token`、`table_id`、`last_sync_time` 为唯一定位信息。
3. `source_url` 仅用于回溯；不要从历史对话或自动化记忆还原 token、table ID 或游标。
4. URL 缺少 `table` 参数时暂停该来源，不能猜测 Base 中的目标表。

## 2. lark-cli 调用约定

开始前读取 `lark-onboarding.md`，固定 profile 和 bot app ID。当前 CLI 的 Base shortcut 使用
带 `+` 的命令名和 `--base-token`，例如：

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

扫描前实时读取完整用户偏好。必须取得：毕业年份、目标城市、目标/排除公司、目标/排除行业、
批次时间窗，以及 `excluded_recruitment_types`。

若 CLI 返回 `excluded_recruitment...`：

1. 仅在该前缀唯一命中 `excluded_recruitment_types` 时还原；
2. 缺失、歧义或值不可确认时停止该来源写入；
3. 保留来源旧游标，禁止按空排除列表继续。

对命中的暑期实习、普通实习和社招执行硬排除。多值招聘类型先结合公告标题判断真实批次，
再拆成“一条记录一个批次”；标题只描述实习招聘时不得机械生成校招副本。

## 4. 完整增量读取

1. 计算 `overlap_start = last_sync_time 所在日期前 1 天的 00:00:00`。
2. 完整分页读取来源表，不把首个 page 当全量。
3. 优先使用来源业务字段「更新时间」；缺失时才使用可验证的记录修改时间。
4. 仅保留 `source_updated_at >= overlap_start` 的候选，但必须完成所有分页后才能声明扫描完整。
5. 记录源记录数、拆行后候选数、最大真实来源日期和分页停止位置。

某页读取失败时重试一次；仍失败则该来源失败并保留游标。其他 source_id 继续执行。

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

按以下顺序执行：

1. 多批次拆行；
2. 排除公司；
3. 目标城市任一命中；
4. 毕业年份匹配；
5. 批次时间窗；
6. 排除行业；
7. `excluded_recruitment_types` 硬排除；
8. 按 `dedup_judge.md` 与目标主表全局索引去重。

企业性质路由固定为：互联网 > 金融银行 > 外企 > 央国企 > 其他私企。不得把同一记录复制到
多个性质子表。

## 6. 写入与补全

新记录按 `excel-insert.md` 执行主表、子表双写和 record ID 回填。六张企业表只允许当前
13 字段契约；不得创建、读取、写入或验收已删除的 `编号` 等旧字段。

命中重复时：

- 不创建新记录；
- 只补全来源拥有且为空或明确更旧的字段；
- 来源更新日期更晚时，可同步更新主表和对应子表的 `信息更新时间`；
- 不覆盖 `投递进度`、双向 `子表 record_id` 或用户维护字段；
- 低置信度冲突列入待确认，不自动合并。

## 7. 写后回读与游标

本批每对主子记录使用单 record、无投影的 `+record-get` 兼容路径回读，确认：

- 公司、来源日期和企业性质正确；
- 主子 record ID 双向一致；
- 新记录状态为 `待确认`，既有状态未改变；
- 公告和投递入口与写入值一致。

随后按 `excel-insert.md` 验收受管 grid 排序、四类状态视图和 workflow。不得依赖固定视图数量。

仅当分页完整、同日全部候选处理完成、写入与验收通过时，将该来源游标推进到本批最大真实
来源日期。无新增但扫描完整且全部为重复时也可以推进。写入、回读或验收失败时保留旧游标，
并在 `last_sync_result` 记录失败阶段。

## 8. 逐来源摘要

无论是否新增，都输出：扫描窗口、源记录数、拆行后候选、重复、硬筛后、新增、补全、失败、
待确认冲突、旧/新游标和是否完整分页。不得用“0 条”掩盖未执行；未执行必须明确写原因。
