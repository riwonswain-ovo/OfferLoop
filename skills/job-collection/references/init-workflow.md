# Job Collection 初始化与接管

## 1. 先判断接管还是新建

优先读取共享配置中的 `target_base_url`。用户提供现有 Base 时必须先只读审计，不按标题
查找同名资源，也不新建第二套：

1. 列出表、字段、视图、记录数和 workflow。
2. 读取 `岗位选择偏好｜<显示名>`、已有用户偏好和信息源登记。偏好文档缺失、空白或未完成时
   转入 `career-profile` 的固定建档流程；本 Skill 不得询问任何求职偏好。
3. 对照 `field-contract.md` 和 `excel-insert.md` 报告差异。
4. 未得到结构迁移授权前，不删除字段、表或视图，不改写状态和 record ID 映射。

用户明确表示没有现有目标 Base 时才进入新建流程。创建 Base、表、workflow 或权限变更前
再次列出目标并取得确认。

## 2. 读取并镜像岗位选择偏好

`career-profile` 保存的 `岗位选择偏好｜<显示名>` 是人工可读唯一真源；`用户偏好` 表只保留
机器可读运行镜像。`job-collection` 不再负责下面任何字段的提问、解释或确认：

| 偏好 | 用途 |
|---|---|
| `graduation_year` | 从“预计毕业年份”镜像；届次和批次时间窗硬筛 |
| `target_cities`、`city_filter_mode` | 从城市范围镜像；`全国` 表示用户已明确不限制城市 |
| `selected_industries` | 从可保留行业镜像；明确不限才使用空列表 |
| `target_job_preferences` | 从愿意考虑的直接匹配、可迁移和用户补充方向合并镜像 |
| `excluded_industries` | 从明确排除行业镜像 |
| `excluded_companies` | 从明确排除公司镜像 |
| `target_companies` | 从优先关注公司镜像；仅用于展示优先级 |
| `excluded_recruitment_types` | 从明确排除招聘类型镜像 |

偏好文档为“指定城市”时镜像完整列表并设置 `city_filter_mode=include`；为“全国”时镜像 `全国`
并设置 `city_filter_mode=all`。行业、招聘类型和企业偏好只有明确“不限”或“没有”才可镜像为空
列表。文档缺失、`incomplete`、有待补节点或语义含糊时，在读取来源前转入 `career-profile`，待其
保存后返回原任务；不得根据历史企业记录反推，也不得把缺失当作无限制。

旧 Base 已有偏好但新文档为空时，同样转入 `career-profile`，由它迁移旧答案、补问缺失项并完成
最终确认。文档完成后，Base 与文档冲突时自动以文档覆盖运行镜像，不再向用户重复确认。

## 3. 登记信息源

至少需要一个用户有权访问的来源：

- 飞书/Lark Base URL，必须包含真实 table 参数；
- 腾讯 Smartsheet URL，使用用户已登录浏览器可见内容。

每个来源在 `信息源登记` 独占一行，使用稳定 `source_id`。同一来源再次提供时更新原记录，
不新增重复行。没有来源时可以完成配置检查，但不能声称初始化同步完成。

## 4. 新建企业 Base

新 Base 包含八张表：

```text
企业清单
互联网
金融银行
外企
央国企
其他私企
用户偏好
信息源登记
```

前六张企业表统一使用 `excel-insert.md` 的 13 字段结构；最后字段为
`子表 record_id`。不创建 `编号` 或其他旧版业务列。

建立 10 条主表与五张子表的投递进度双向 workflow，建立现有批次视图和四个状态视图，
受管视图排序为 `信息更新时间 desc, 公司 asc`。

## 5. 用户偏好表

一名用户一条记录，至少包含：

- 飞书用户标识；
- graduation_year；
- target_cities 与 city_filter_mode；
- target_companies；
- selected_industries；
- target_job_preferences；
- excluded_industries；
- excluded_companies；
- excluded_recruitment_types（例如暑期实习、普通实习、社招）。

`excluded_recruitment_types` 属于必读硬筛字段。任何 CLI/中间输出把长字段名显示为
`excluded_recruitment...` 时，只能在该前缀唯一对应真实字段的情况下还原；缺失或歧义时必须
停止同步并报告，禁止把它当成空数组继续写入。

所有上述偏好字段都是运行镜像，不是提问入口。写入或修复前必须已有 `career-profile` 中完成并
经用户整体确认的岗位选择偏好文档。

旧 Base 缺少 `target_job_preferences` 等镜像字段时先报告增量加字段计划并取得结构迁移授权，再从
岗位选择偏好文档写入；不从既有企业记录或历史对话反推偏好。

旧版来源定位列只读兼容；新来源统一写 `信息源登记`，不再把单个来源塞进偏好记录。

## 6. 信息源登记表

字段使用 `field-contract.md` 第 3 节：source_id、source_name、source_type、source_url、
app_token、table_id、is_active、credential_status、last_sync_time、last_sync_result。

首次同步前游标为空。只有来源完整扫描、企业双写和验收全部成功后才写高水位。
腾讯来源优先登记 `credential_status=mcp_token`；只有官方 MCP 不可用而浏览器登录态已验证时，
才登记 `browser_session`。Token 本身不写入「信息源登记」。

## 7. 独立求职进展

`progress_base_url` 指向核心空间内独立的求职进展 Base，不属于企业 Base 的子表。验证字段和
权限，并确保存在文本字段 `投递记录 ID`、SingleSelect 字段 `进展状态`、`最近完成节点`和
`公告链接`。接管旧表时只补缺失字段，并为每条缺失记录回填
`progress:<求职进展 record_id>`；`进展状态` 缺失时按 `field-contract.md` 第 6 节迁移，无法
可靠判断的记录写 `状态待确认`，不改写岗位、JD、日期或父级关联键。简历选择不写入业务
Base。若核心空间尚未完成初始化，本次企业同步应明确报告缺少定位并停止写入，不自行创建
另一套求职进展 Base。

不要在 `job-collection` 初始化过程中静默创建知识库或首页；三张 Base 由
`offerloop-setup` / `offerloop-workspace` 纳入必需的私有知识库，但业务字段和记录仍由本
Skill 管理。

## 8. 首次同步与验收

1. 按来源逐个扫描、映射、拆批次、硬筛和跨来源去重。
2. 按 `prewrite-confirmation.md` 对岗位软偏好不匹配/不确定的候选集中确认。
3. 只把岗位匹配或用户明确接受的候选按 `excel-insert.md` 双写主表与唯一子表。
4. 检查字段、状态、映射、视图和 10 条 workflow。
5. 对主表已投递记录执行求职进展幂等对账。
6. 仅在确认与写入终态完整时为每个来源独立写入结果与游标。

最终报告 Base URL、偏好摘要、来源数量、每来源候选/重复/新增/补全/失败、进展对账状态和
下一次重叠扫描起点。可选工作台按需读取 Base，不需要本 Skill 推送刷新；工作台失败
不回滚企业同步。
