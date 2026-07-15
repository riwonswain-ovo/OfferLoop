# 字段契约

> 约束 Job Collection 在 prompt、抽取结果、飞书多维表格、用户偏好、追加写入所使用的字段名与规则。所有模块按本契约命名，避免不同步骤字段不一致导致无法合并或去重。
> skill 模式下没有数据库表，这份契约是**对话内结构**与**飞书多维表格列**的统一约定。

---

## 1. 信息来源字段

### 1.1 必填

| 字段名 | 含义 |
|---|---|
| `source_id` | 信息源唯一 ID，建议使用 `SRC_CUSTOM_YYYYMMDDHHMMSS` |
| `source_name` | 信息源名称 |
| `source_url` | 信息源 URL |
| `source_type` | `feishu_bitable` / `tencent_smartsheet` |
| `is_active` | 是否启用 |
| `is_login_required` | 是否需登录 |
| `credential_status` | 登录态：`valid` / `expired` / `待登录` / `不适用` |

### 1.2 可选

| 字段名 | 含义 |
|---|---|
| `industry_module` | 所属行业模块，取值见下表 |
| `last_login_at` | 最近登录时间 |
| `estimated_expiry_at` | 预计登录态失效时间 |
| `app_token` | 飞书源表专属：从 URL 解析的 bitable app_token（`source_type=feishu_bitable` 时必填，解析规则见 `personal-excel-source.md`「飞书源表 URL 解析」节） |
| `table_id` | 飞书源表专属：从 URL 解析的 bitable table_id（`source_type=feishu_bitable` 时必填） |
| `last_sync_time` | 该来源独立的成功扫描高水位；每日任务仍回看最近两个日历日，失败不推进 |
| `last_sync_result` | 扫描窗口、候选/重复/新增/补全/失败数及游标前后值 |
| `added_at` | 登记时间戳（ISO 日期时间） |

### 1.2.1 源表元数据字段契约（信息源登记 sheet 专用）

信息源登记 sheet（见 `init-workflow.md` 6.1 节 Sheet 3）每个字段取值约定：

| 字段名 | 取值约定 |
|---|---|
| `source_id` | `SRC_CUSTOM_YYYYMMDDHHMMSS` 格式，唯一标识。同一源表多次同步复用同一 ID，不变 |
| `source_name` | 用户可读名，如「第三方招聘汇总表」「每日更新」。仅用于用户提示 |
| `source_type` | `feishu_bitable` / `tencent_smartsheet`。同步所有 active 且具备对应读取能力的来源 |
| `source_url` | 原始 URL（用户贴的那条）。`app_token` / `table_id` 解析自此 |
| `app_token` | 飞书 bitable 的 app_token（URL path 段）。非飞书源表留空 |
| `table_id` | 飞书 bitable 的 table_id（URL query `table=` 段）。非飞书源表留空 |
| `is_login_required` | `true` / `false`。飞书源表若用户已加 AI 应用为协作者则 `false` |
| `is_active` | `true` / `false`。用户暂停某源表时改 `false`，0.6 步跳过该行不同步 |
| `credential_status` | `not_required`（免登录）/ `pending`（待登录）/ `valid`（登录态可用） |
| `last_sync_time` | 每个 source_id 独立的成功扫描高水位，如 `2026-07-07T23:59:59+08:00`。每日增量仍从该日期前一天 00:00 重扫；只有该来源完整扫描并验收成功才推进 |
| `last_sync_result` | 写扫描窗口、候选/重复/新增/补全/失败数和游标前后值。失败时保留旧游标并写 `失败:<原因>` |
| `added_at` | 登记时间戳，append 行时写入，之后不变 |

**0.6 步读这一 sheet 而非偏好 sheet 的 4 列**——偏好 sheet 的 4 列（`source_table_app_token` 等）仅作本规则上线前的老用户向后兼容，新用户不再写那 4 列。

### 1.3 `industry_module` 取值

| ID | 名称 |
|---|---|
| `internet` | 互联网与科技 |
| `finance` | 金融 |
| `fmcg` | 快消与零售 |
| `manufacturing` | 制造业 |
| `newenergy_auto` | 新能源与汽车 |
| `healthcare` | 医疗与健康 |
| `education` | 教育 |
| `realestate` | 房地产与建筑 |
| `culture_media` | 文化传媒与娱乐 |
| `energy_chem` | 能源与化工 |
| `crossborder` | 出海与跨境 |
| `marketing_consulting` | 广告营销与咨询 |
| `central_soe` | 央国企 |

每个取值的详细配置见 `references/industries/{id}.md`。

### 1.4 信息源范围

本 skill 不内置默认招聘平台。每个来源都由用户提供并登记；不接受招聘网站、搜索引擎或社交平台 URL。

### 1.5 使用规则

- 需登录的信息源，必须由用户完成授权或提供有效登录态
- **不绕过验证码、风控、反爬机制**
- 登录态失效 → 提示用户重新登录，不静默跳过

### 1.6 `enterprise_type` 取值（企业性质，用于子表分类）

| ID | 显示名 | 判定要点 |
|---|---|---|
| `internet` | 互联网 | 主营业务是互联网产品/服务（电商、社交、内容、SaaS、AI 等），含字节、阿里、腾讯、美团、拼多多等大厂 + 互联网创业公司 |
| `finance` | 金融银行 | 银行 / 证券 / 券商 / 基金 / 保险 / 信托 / 资管等金融机构，含央行、商业银行、外资银行、券商 |
| `foreign` | 外企 | 总部在境外、在华有实体分支机构的外资企业（含外资咨询、外资快消、外资制造等） |
| `central_soe` | 央国企 | 国资委直属央企 + 地方国企 + 国有控股企业 |
| `other_private` | 其他私企 | 不属于上述 4 类的民营/私营企业 |

**优先级判定（命中即归，不重复出现）**：`internet` > `finance` > `foreign` > `central_soe` > `other_private`

例：
- 招商银行（国有控股商业银行）→ 命中 `finance`（优先级高于 `central_soe`），归「金融银行」子表
- 某外资投行 → 命中 `finance`（金融机构优先于外资身份），归「金融银行」子表
- 某央企下属互联网子公司 → 命中 `internet`（优先级最高），归「互联网」子表
- 某外资快消公司 → 不命中国企/金融/互联网，命中 `foreign`，归「外企」子表
- 某民营制造业公司 → 不命中前 4 类，归「其他私企」子表

### Canonical classify() 伪代码（K6）

所有判定 `enterprise_type` 的脚本必须照本节伪代码实现，禁止同步与审计脚本各自维护不同的字符串匹配逻辑。

```python
# 输入：飞书记录的 fields 字典（已按 excel-insert.md 22 列定义）
# 输出：5 取值之一 "互联网" / "金融银行" / "外企" / "央国企" / "其他私企"

INDUSTRY_TO_ET = {
    "互联网与科技": "互联网",        # internet
    "金融": "金融银行",              # finance
    # 其余 11 个行业模块不直接决定企业性质，靠企业性质字段 + 主营业务判
}

def classify(fields):
    industry = fields.get("行业标签", []) or []
    if not isinstance(industry, list):
        industry = [industry] if industry else []
    # 优先按行业标签命中 internet / finance
    for ind in industry:
        if ind in INDUSTRY_TO_ET:
            return INDUSTRY_TO_ET[ind]
    # 否则按企业性质字段（SingleSelect 字符串）判
    etype = str(fields.get("企业性质", "") or "")
    if etype in ("外企", "外资"): return "外企"
    if "央" in etype or "国" in etype: return "央国企"
    # 兜底
    return "其他私企"
```

要点：
- **优先按 `行业标签` 字段命中 internet / finance**——这两个行业模块 ID 跟子表分类一一对应，命中即归，不需要再走企业性质字段
- 其他行业（制造业、新能源、医疗等）**不直接决定企业性质**，需要再读「企业性质」字段判外企/央国企/其他私企
- 「企业性质」字段是 SingleSelect，飞书返回的是字符串，直接 `in` 判断即可
- 「外企」命中判定兼容 `外资` 写法（用户手动改的存量数据可能有这种写法）

---

## 2. 用户偏好字段

| 字段名 | 含义 |
|---|---|
| `graduation_year` | 毕业年份，如 `2027届` |
| `target_cities` | 目标城市列表，或 `["全国"]` |
| `city_filter_mode` | 城市筛选模式 `hard` / `soft` |
| `target_companies` | 目标公司列表（仅加分，不作硬筛选） |
| `selected_industries` | 行业方向列表（取值见 1.3 节 13 个 ID） |
| `excluded_industries` | 排除行业列表（取值同 `selected_industries`，强过滤） |
| `excluded_companies` | 排除公司列表（强过滤） |

### 字段说明

- `target_cities = ["全国"]` → `city_filter_mode = "soft"`
- 具体城市 → `city_filter_mode = "hard"`
- `target_companies` 只加分不硬筛
- `excluded_industries` / `excluded_companies` 命中默认不推送，除非用户明确要求看

---

## 3. 企业线索字段

### 3.1 写入前必填

| 字段 | 含义 |
|---|---|
| `lead_id` | 企业线索唯一 ID，格式 `LEAD_YYYYMMDD_NNNN`（日期+序号）。**AI 内部工作字段，不落飞书表**——飞书主表"编号"列存的是纯顺延数字（见 `excel-insert.md` 第 9 行「序号，追加时接续已有最大编号」），lead_id 只活在对话上下文里用于跨步骤定位 |
| `company_name` | 公司名称 |
| `recruitment_batch` | 招聘批次（如：暑期实习 / 提前批 / 秋招 / 春招 / 补录） |
| `official_url` | 官方投递链接或招聘信息原始链接 |
| `source_id` | 信息来源 ID |
| `info_status` | 信息状态。**飞书主表「投递进度」列只持久化三态映射（见 3.5 节），其余态仅作 AI 内部工作字段不落表** |

缺任一字段 → 进待确认队列，不写入飞书正式表。

### 3.2 推荐

| 字段 | 含义 | 飞书主表落列 |
|---|---|---|
| `graduation_year` | 届次（2026届 / 2027届 / 2028届）。从公告里抽取或按批次推算（规则见 `SKILL.md` 第三步「届别规则」） | 落到飞书字段「届次」（MultiSelect） |
| `project_name` | 招聘项目名称（有就填，没有留空。如：JDS / TET / 星图 / 阿里星 / 技术大咖。一个企业同批次里可能并存多个项目） | 落到飞书字段「招聘项目」 |
| `job_positions` | 该企业本批次招的主要岗位类别（如「Java 开发、产品经理、管培生」），多个用 `、` 分隔。公告没明确岗位类别的留空 | 落到飞书字段「招聘岗位」 |
| `education_requirement` | 学历门槛（本科 / 硕士 / 博士 / 本科及以上 等）。公告没写明留空 | 落到飞书字段「学历要求」 |
| `major_requirement` | JD 里的专业对口要求（如「经济学、金融学、数学」），多个用 `、` 分隔。公告没提留空 | 落到飞书字段「专业要求」 |
| `requires_exam` | 是否需要笔试，三态：`要笔试` / `不要笔试` / `未知` | 落到飞书字段「是否笔试」（MultiSelect） |
| `source_url` | 来源表中记录的公告页面 URL，用于回溯这条信息从哪看到 | 落到飞书字段「公告链接」（Url 字段） |
| `official_url` | 网申入口 URL 或投递方式（如「邮箱投递：xxx@xx.com」）。**注意是字符串字段，可承载非 URL 形式的投递方式** | 落到飞书字段「投递链接」（Text 字段） |
| `notes` | 抽取时拿不准的额外信息（如「需现场投递」「只招本地」「需 onsite 笔试」等），可空 | 落到飞书字段「备注」 |
| `source_name` | 信息来源名称 | 落到飞书字段「来源平台」 |
| `source_id` | 信息来源 ID（必填字段，重复出现） | **不单独落列**，AI 调 API / 跨会话恢复信息源时按 1.4 节从 source_name 反查映射 |
| `industry_module` | 所属行业模块（13 个 ID 之一 + `other`） | 落到飞书字段「行业标签」（按显示名落，ID 在内部用） |
| `enterprise_type` | 企业性质（5 取值之一，见 1.6 节）。驱动「写到哪个子表」+ 主表「企业性质」字段显示名 | 落到飞书字段「企业性质」（SingleSelect） |
| `sub_table_record_id` | 该条线索在对应子表里的 record_id，用于投递进度同步定位 | 落到飞书字段「子表 record_id」（Text，AI 内部用，用户可隐藏列） |
| `source_updated_at` | 该招聘信息在来源表里的更新时间；没有可靠日期时留空 | 落到飞书字段「信息更新时间」（DateTime 字段） |
| `application_deadline` | 投递截止时间——可写 ISO 日期，也可写 `尽快投递` / `招满即止` / `未公布` 等灵活文案 | 落到飞书字段「投递截止时间」（Text 字段） |
| `location` | 工作地点 | 落到飞书字段「城市」 |
| `referral_url` | 内推链接 | 落到飞书字段「内推链接」 |
| `referral_code` | 内推码 | 落到飞书字段「内推码」 |
| `lead_id` | 同 3.1 节 | **不落飞书表**，AI 内部工作字段。飞书主表"编号"列存纯顺延数字（见 `excel-insert.md`） |
| `job_category` | 岗位类别（粗粒度分类，区别于 `job_positions` 具体岗位名） | **不落飞书表**，AI 内部工作字段 |
| `duplicate_with` | 与哪条线索重复 | **不落飞书表**，AI 内部工作字段 |
| `dedup_status` | 去重状态 | **不落飞书表**，AI 内部工作字段 |
| `qa_status` | 质检状态：空 / `已下架待复核` / `命中排除项` | **不单独落列**——`已下架待复核` 在推送时由 AI 加备注表达 |
| `info_status` | 同 3.1 节 | 按三态映射落到飞书字段「投递进度」（详见 3.5 节） |
| `created_at` | 创建时间 | **不单独落列**，飞书表自带行创建时间 |
| `updated_at` | 更新时间 | **不单独落列**，飞书表自带行修改时间 |

> **"AI 内部工作字段"指什么**：本 skill 是 skill 模式，没有数据库——这些字段在对话上下文 + 临时 LLM 内存里流转，用于跨步骤传递状态，不持久化进飞书表。下次触发 skill 时这些字段重新生成。

> **链接字段三套语义不要混**：
> - `source_url`（「公告链接」）= 信息源页面 URL，回溯用，不参与去重判定
> - `official_url`（「投递链接」）= 网申入口，**参与去重判定**（见 `dedup_judge.md` 环节 B）
> - `referral_url`（「内推链接」）= 员工推荐通道，不参与去重判定，只作回填

### 3.3 `info_status` 取值

`new` 新发现 / `pending_review` 待确认 / `pushed` 已推送 / `saved` 已收藏 / `applied` 已投递 / `expired` 已截止 / `rejected` 已拒绝 / `ignored` 已忽略

### 3.4 `dedup_status` 取值

`unique` 非重复 / `duplicate` 重复 / `possible_duplicate` 疑似 / `merged` 已合并

### 3.5 `info_status` × 飞书表三态映射

飞书主表「投递进度」字段只持久化三态：`待确认` / `已投递` / `已拒绝`。`info_status` 的 8 个取值按下面映射落表：

| `info_status` | 飞书「投递进度」列 |
|---|---|
| `new` | `待确认`（新条目写入主表默认态） |
| `pending_review` | `待确认` |
| `pushed` | `待确认`（已推送给用户但用户还没决定） |
| `saved` | `待确认`（用户收藏了但还没投，本 skill 不持久化"收藏"作为独立态） |
| `applied` | `已投递` |
| `expired` | 仍标 `待确认`，但在推送时附备注"该条已过截止时间" |
| `rejected` | `已拒绝` |
| `ignored` | `已拒绝`（用户明确不投） |

`new` / `pending_review` / `pushed` / `saved` / `expired` 都落到"待确认"——这些态的区分只活在 AI 内存里驱动推送逻辑（比如 `expired` 在推送时加备注），飞书表层面只看"用户是否已决定"。

---

## 4. 典型数据示例

### 4.1 信息源

```json
{
  "source_id": "SRC_CUSTOM_20260713090000",
  "source_name": "第三方招聘汇总表",
  "source_url": "https://example.feishu.cn/base/bascnExample?table=tblExample",
  "source_type": "feishu_bitable",
  "is_active": true,
  "is_login_required": false,
  "credential_status": "not_required"
}
```

### 4.2 用户偏好

```json
{
  "target_cities": ["北京", "上海", "杭州"],
  "city_filter_mode": "hard",
  "target_companies": ["字节跳动", "阿里巴巴", "腾讯"],
  "selected_industries": ["internet", "central_soe"],
  "excluded_industries": ["finance"],
  "excluded_companies": []
}
```

### 4.3 企业线索

```json
{
  "lead_id": "LEAD_20260703_0001",
  "company_name": "某互联网公司",
  "recruitment_batch": "秋招",
  "project_name": "星图计划",
  "job_positions": "Java 开发、产品经理、管培生",
  "education_requirement": "本科及以上",
  "major_requirement": "计算机、软件工程、数学",
  "requires_exam": "要笔试",
  "graduation_year": "2027届",
  "official_url": "https://example.com/campus/apply",
  "source_url": "https://example.feishu.cn/base/bascnExample?table=tblExample",
  "source_id": "SRC_DEFAULT_04",
  "info_status": "new",
  "source_name": "牛客",
  "industry_module": "internet",
  "enterprise_type": "internet",
  "sub_table_record_id": "recXXXXXX",
  "application_deadline": "2026-08-31",
  "location": "北京",
  "notes": "需 onsite 笔试",
  "job_category": ["产品"],
  "duplicate_with": null,
  "dedup_status": "unique",
  "qa_status": "",
  "created_at": "2026-07-03T09:00:00+08:00",
  "updated_at": "2026-07-03T09:00:00+08:00"
}
```

---

## 5. 写入规则

- 写入前检查必填字段，缺失 → 进待确认队列，不写入正式表
- `公司名` / `招聘批次` / `投递链接`（指 `official_url`，不含 `referral_url`、`source_url`）与现有记录高度相似 → 走 `references/dedup_judge.md` 去重判断，写入 `duplicate_with` 和 `dedup_status`
- 命中 `excluded_industries` / `excluded_companies` → 不推送（用户明确要求看除外）
- `来源平台` 不同的同一企业招聘条目 → 合并，`来源平台` 字段标多个
- `referral_url` / `referral_code` 不参与去重判定，只作回填——新条目跟主表已有条目判定为同一条时，把新条目带的内推信息回填到旧条的 `referral_url` / `referral_code` 字段（若旧条相应字段为空）
- 通过硬筛选的企业线索直接写入主表，不做匹配度打分——本 skill 只求搜集全面，匹配判断交给用户
