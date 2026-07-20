# Job Collection 初始化与接管

## 1. 先判断接管还是新建

优先读取共享配置中的 `target_base_url`。用户提供现有 Base 时必须先只读审计，不按标题
查找同名资源，也不新建第二套：

1. 列出表、字段、视图、记录数和 workflow。
2. 读取已有用户偏好和信息源登记，只询问当前操作必需但缺失的值。
3. 对照 `field-contract.md` 和 `excel-insert.md` 报告差异。
4. 未得到结构迁移授权前，不删除字段、表或视图，不改写状态和 record ID 映射。

用户明确表示没有现有目标 Base 时才进入新建流程。创建 Base、表、workflow 或权限变更前
再次列出目标并取得确认。

## 2. 收集最小求职偏好

按需询问，不做一次性长表单：

| 偏好 | 用途 |
|---|---|
| `graduation_year` | 届次和批次时间窗硬筛 |
| `target_cities` | 城市硬筛；`全国` 表示软筛 |
| `selected_industries` | 行业范围和分类参考 |
| `excluded_industries` | 排除行业硬筛 |
| `excluded_companies` | 排除公司硬筛 |
| `target_companies` | 仅用于优先展示，不作排他筛选 |

已有值原样保留。用户说“没有限制”时保存明确的空列表或 `全国`，不要把缺失和无偏好混为
一谈。

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
- excluded_industries；
- excluded_companies；
- excluded_recruitment_types（例如暑期实习、普通实习、社招）。

`excluded_recruitment_types` 属于必读硬筛字段。任何 CLI/中间输出把长字段名显示为
`excluded_recruitment...` 时，只能在该前缀唯一对应真实字段的情况下还原；缺失或歧义时必须
停止同步并报告，禁止把它当成空数组继续写入。

旧版来源定位列只读兼容；新来源统一写 `信息源登记`，不再把单个来源塞进偏好记录。

## 6. 信息源登记表

字段使用 `field-contract.md` 第 3 节：source_id、source_name、source_type、source_url、
app_token、table_id、is_active、credential_status、last_sync_time、last_sync_result。

首次同步前游标为空。只有来源完整扫描、企业双写和验收全部成功后才写高水位。

## 7. 独立求职进展

`progress_base_url` 是可选联动资源，不属于企业 Base 的子表。存在时只读验证字段和权限；
不存在时企业同步仍可独立运行，并在摘要中标为“求职进展对账未启用”。

不要在 `job-collection` 初始化过程中静默创建知识库或首页；这些资源由
`offerloop-workspace` 在用户明确要求时管理。

## 8. 首次同步与验收

1. 按来源逐个扫描、映射、拆批次、硬筛和跨来源去重。
2. 按 `excel-insert.md` 双写主表与唯一子表。
3. 检查字段、状态、映射、视图和 10 条 workflow。
4. 对主表已投递记录执行求职进展幂等对账（若已配置）。
5. 每个来源独立写入结果与游标。

最终报告 Base URL、偏好摘要、来源数量、每来源候选/重复/新增/补全/失败、进展对账状态和
下一次重叠扫描起点。工作台已配置时，成功后通知 `offerloop-workspace` 刷新状态；刷新失败
不回滚企业同步。
