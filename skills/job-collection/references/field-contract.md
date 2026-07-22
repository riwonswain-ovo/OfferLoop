# Job Collection 字段契约

本文件区分两类数据：来源解析时可临时使用的内部字段，以及最终持久化到
`求职企业清单` Base 的字段。内部字段不得因为“来源里有”就自动扩展目标 Base。

## 1. 求职企业清单持久化字段

主表 `企业清单` 与五张物理子表必须使用完全相同的 13 个字段，并保持以下顺序：

<!-- ENTERPRISE_FIELDS:START -->
1. 信息更新时间
2. 投递进度
3. 公司
4. 招聘批次
5. 招聘项目
6. 招聘岗位
7. 公告链接
8. 投递链接
9. 投递截止时间
10. 城市
11. 行业标签
12. 企业性质
13. 子表 record_id
<!-- ENTERPRISE_FIELDS:END -->

不在此列表中的来源信息可以用于筛选、判断和去重，但不能写成额外列。`编号`、
`父记录`、`专业要求`、`下一步`、`意愿程度`、`学历要求`、`内推链接`、`投递日期`、
`重点关注`、`是否笔试`、`来源平台`、`薪资范围`、`内推码`、`求职阶段`、`届次`、
`备注` 均不属于目标表结构。

### 1.1 字段类型与所有权

| 字段 | 建议类型 | 写入规则 |
|---|---|---|
| 信息更新时间 | DateTime | 使用来源记录的更新时间；不得用 Skill 执行时间冒充 |
| 投递进度 | SingleSelect | `待确认`、`感兴趣`、`已投递`、`已拒绝`；新记录默认 `待确认` |
| 公司 | Text | 必填，保留来源正式名称 |
| 招聘批次 | SingleSelect | 一条记录只允许一个批次；多批次先拆行 |
| 招聘项目 | Text | 无可靠值时留空 |
| 招聘岗位 | Text | 可保存来源中的聚合岗位信息；不复制到求职进展的“投递岗位” |
| 公告链接 | URL 或 Text | 招聘公告/来源记录链接，用于回溯 |
| 投递链接 | Text | 网申入口，也允许邮箱投递等非标准 URL 文案 |
| 投递截止时间 | Text | 允许日期、`尽快投递`、`招满即止`、`未公布` |
| 城市 | Text | 多城市用稳定分隔符保存 |
| 行业标签 | MultiSelect | 使用本文件第 4 节行业枚举 |
| 企业性质 | SingleSelect | 五种子表分类之一 |
| 子表 record_id | Text | 双向技术 ID；始终放最后，普通视图默认隐藏 |

`投递进度` 与用户人工维护字段属于用户状态。来源增量同步不得改写已有值；只有用户、
同 Base 双向 workflow 或明确的状态操作可以更新它。

## 2. 内部来源对象

来源适配器可以在内存中使用以下规范化键，但只有明确映射到第 1 节的键才持久化：

| 内部键 | 目标字段/用途 |
|---|---|
| `source_updated_at` | 信息更新时间 |
| `company_name` | 公司 |
| `recruitment_batch` | 招聘批次 |
| `project_name` | 招聘项目 |
| `job_positions` | 招聘岗位 |
| `source_url` | 公告链接 |
| `official_url` | 投递链接 |
| `application_deadline` | 投递截止时间 |
| `location` | 城市 |
| `industry_module` | 行业标签 |
| `enterprise_type` | 企业性质与子表路由 |
| `source_id`、`source_name` | 信息源登记与运行摘要，不落企业表 |
| `graduation_year`、`education_requirement`、`major_requirement` | 筛选/判断，不落企业表 |
| `referral_url`、`referral_code`、`notes`、`requires_exam` | 来源临时上下文，不落企业表 |
| `dedup_status`、`duplicate_with`、`lead_id` | 单次运行内部状态，不落企业表 |

公司为空时不得写入。投递链接为空时允许保留可靠公告链接，但必须在结果摘要中标为
缺投递入口，不能猜测链接。

## 3. 信息源登记

每个来源独占一条记录：

| 字段 | 规则 |
|---|---|
| `source_id` | 稳定唯一 ID，同一来源后续复用 |
| `source_name` | 用户可读名称 |
| `source_type` | `feishu_bitable` 或 `tencent_smartsheet` |
| `source_url` | 去除临时认证参数后的稳定 URL |
| `app_token` / `table_id` | 仅飞书来源填写 |
| `is_active` | 是否参与下一次同步 |
| `credential_status` | `not_required` / `browser_session` / `pending` / `expired` |
| `last_sync_time` | 本来源独立的成功扫描高水位 |
| `last_sync_result` | 窗口、候选、重复、新增、补全、失败和游标摘要 |

某个来源失败时只保留该来源旧游标，不影响其他来源继续处理。

## 4. 分类枚举

### 4.1 行业标签

内部 ID 为：`internet`、`finance`、`fmcg`、`manufacturing`、
`newenergy_auto`、`healthcare`、`education`、`realestate`、
`culture_media`、`energy_chem`、`crossborder`、`marketing_consulting`、
`central_soe`，以及兜底 `other`。显示名以 `references/industries/` 中的定义为准。

### 4.2 企业性质与子表

| 内部 ID | 企业性质/子表 |
|---|---|
| `internet` | 互联网 |
| `finance` | 金融银行 |
| `foreign` | 外企 |
| `central_soe` | 央国企 |
| `other_private` | 其他私企 |

判定优先级固定为：互联网 > 金融银行 > 外企 > 央国企 > 其他私企。每条企业记录只进入
一张子表；分类不确定时使用“其他私企”并在本次摘要中提示，不得复制到多个子表。

## 5. 去重与稳定 ID

按以下顺序判断：

1. 规范化后的投递链接完全相同；
2. 规范化后的公告链接完全相同；
3. 公司 + 招聘批次 + 招聘项目/公告标题复判。

`lead_id` 和已删除的 `编号` 都不是持久化唯一键。企业主表使用飞书记录自身的
`record_id`；主子表通过最后一列 `子表 record_id` 双向关联。

## 6. 求职进展对账契约

企业记录第一次进入 `已投递` 时，当前 Agent 在同次运行中跨 Base 以企业主表 `record_id` 为唯一键
upsert：

- 新建：当前阶段=`已投递`、公司=来源公司、投递岗位为空、岗位 JD 为空、投递日期为
  本次首次变更日期，并逐值复制企业清单的公告链接和投递链接；
- 求职进展不保留“原招聘信息”字段；每次对账都刷新公告链接与投递链接，使其与企业清单一致；
- 历史迁移日期无法可靠恢复时，投递日期留空；
- 重复事件不得覆盖用户填写的投递岗位、岗位 JD、投递日期或更后的面试阶段；
- 已有进展只刷新公司、公告链接、投递链接和技术 ID；不得写入已删除的 `原招聘信息` 字段；
- 飞书 Base workflow 调用 OfferLoop 同步服务是手动状态变更的即时主链路；当前 Agent 本次运行
  产生的状态变更立即直写，`job-collection` 每次运行再执行相同规则的幂等补偿。
