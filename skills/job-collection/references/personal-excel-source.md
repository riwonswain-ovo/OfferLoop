# 用户自有文档表格处理教程

> 用户上传飞书表格作为信息源时，必须先读取本文件。本 skill 不主动搜索招聘平台，结果仅来自登记的飞书 Base 与腾讯 Smartsheet。
>
> 腾讯 Smartsheet 是浏览器辅助来源：导出/复制可用时优先结构化导入；不可用时按 `tencent-smartsheet-source.md` 逐屏扫描、复核日期边界和真实链接。

## 一、识别表格类型

按 URL 域名判断来源类型：

| URL 特征 | 类型 | 处理方式 |
|---|---|---|
| 含 `feishu.cn/base/` 或 `larksuite.com/base/` | 飞书多维表格 | 走第二节 |
| 域名 `docs.qq.com/smartsheet/` | 腾讯智能表格 | 走第三节和 `tencent-smartsheet-source.md` |

## 二、飞书多维表格

**直接读结构化行数据**，不走抽取流程。

1. 用飞书开放平台 / SDK 或 MCP 工具读取表格所有行
2. 按 `references/field-contract.md` 的"企业线索字段"对源表列做映射：
   - 源表常见的列名：公司 / 招聘批次 / 城市 / 投递链接 / 截止时间 / 来源 / 备注 / 内推链接 / 内推码
   - 映射到企业线索字段的 `company_name` / `recruitment_batch` / `project_name` / `location` / `official_url` / `application_deadline` / `source_name` / `referral_url` / `referral_code`
   - 源表若把"批次"和"项目"合在一列（如"2027届秋招-星图"）→ 抽取时按"批次"在前、"项目"在后拆开分别填 `recruitment_batch` 和 `project_name`
   - 源表的"投递链接"列若混着官方网申入口和内推链接两种 → 按内容分到 `official_url` 和 `referral_url` 两个字段，不要全塞 `official_url`
3. 映射不到的字段先标"未标注"，不要直接丢弃
4. **不重复调 LLM 抽取**——已经是结构化数据，再抽只会丢信息
5. 把映射后的企业线索直接送去重与城市筛选

### 2.1 多批次拆行（强制，上传阶段必做）

**判定规则**：源表「招聘批次」列（或映射到 `recruitment_batch` 的列）字段值含以下任一常见分隔符时，**必须拆成多行**，不能整行照搬：

| 分隔符集 | 字符 |
|---|---|
| 中文标点 | `、` `，` `；` |
| 英文标点 | `,` `;` |
| 斜杠/竖线 | `/` `\|` |
| 空白类 | 换行符、全角空格 |

> 若分隔符不在上述集合内（如 `+` `&&` `·` `~` 等怪分隔符）→ 按一个批次整行保留，不硬拆；后续 `dedup_judge.md` 环节 B 的 LLM 复判若发现该行批次字段含异常多值再单独处理。

**拆行操作**（对每条含多批次的源行）：

1. 按命中的分隔符把「招聘批次」字段拆成数组 `batches = [b1, b2, ..., bN]`，N ≥ 2
2. 生成 N 行输出，每行字段值按以下规则填：
   - **复制不变**：除「招聘批次」外的所有字段（公司、城市、投递链接、截止时间、来源、内推链接、内推码等）
   - **单值填入**：「招聘批次」字段分别填 `b1`、`b2`、...、`bN`
3. 拆完每行都是"一行 = 一个(公司, 批次)"的标准粒度，直接进入后续去重与城市筛选

**输入输出示例**：

源表一行：

| 公司 | 招聘批次 | 城市 | 投递链接 | 截止时间 |
|---|---|---|---|---|
| 字节跳动 | 暑期实习、秋招提前批 | 北京 | https://xxx | 2026-08-31 |

拆成两行：

| 公司 | 招聘批次 | 城市 | 投递链接 | 截止时间 |
|---|---|---|---|---|
| 字节跳动 | 暑期实习 | 北京 | https://xxx | 2026-08-31 |
| 字节跳动 | 秋招提前批 | 北京 | https://xxx | 2026-08-31 |

**为什么必须拆**：

- **投递进度变更消歧**：用户后续说"投了字节跳动"时，AI 必须能定位到具体批次才能改投递进度。一行多批次会让 AI 无法判断投的是哪一批，投递进度闭环失效
- **去重键不退化**：`dedup_judge.md` 环节 B 的 dedup 键是 `公司 + 招聘批次`（隐含单值前提）。一行多批次会让 dedup 键退化成只看公司名，把不同批次当成重复错杀
- **旧数据治理兜底**：即便上传阶段漏拆，`excel-insert.md`「旧数据治理：多批次拆行」节也会在每次触发 skill 时扫主表补拆——但上传阶段就拆干净能省掉后续治理成本

### 2.2 飞书表 → 飞书主表/子表周期同步（含卡点 K1-K11）

**场景**：用户有一张持续更新的招聘信息汇总飞书表，希望按日期增量同步到自己的主表 + 5 子表。以下流程用于新用户首次同步和后续定时同步。

#### 增量同步入口（后续触发时自动回拉源表，必做）

**失败模式**：首次上传后只使用本地快照，会导致后续运行看不到源表新增记录。每次增量同步都必须重新读取远端来源，并以「信息源登记」中的独立游标为基准。

**规则**：后续触发 skill 时（非首次上传），如果用户之前上传过表 A，**必须主动回拉表 A 看是否有新增记录**，不能再依赖旧快照。完整流程见 SKILL.md 第 0.6 步。本节只描述同步逻辑本身（5 条硬筛 + 双写 + 拆行），增量判定逻辑（按更新时间过滤、last_sync_time 维护）在 SKILL.md 第 0.6 步。

**实现要点**：
1. 回拉表 A 只读「信息源登记」sheet 里的 `app_token` + `table_id`（不要从 /tmp 或用户偏好表读，/tmp 跨会话可能被清；用户偏好表里的旧 `source_table_*` 只允许在信息源登记为空时做一次迁移），list_records 翻页拿全
2. 计算 `overlap_start = last_sync_time 所在日期往前 1 天的 00:00:00`，按源表「更新时间」优先、`last_modified` 兜底，取 `>= overlap_start` 的记录；每天重扫两个日历日并与目标主表去重，禁止严格使用 `> last_sync_time`
3. 增量记录仍跑完整 5 硬筛 + 拆行 + classify + 双写流程（不能因为"之前同步过"就跳过硬筛——用户偏好可能变了）
4. 同步写入主表 + 子表时同时写「信息更新时间」字段，值取源表「更新时间」列；同步完后更新信息源登记 sheet 该源表行的 `last_sync_time` + `last_sync_result` 字段（PUT 到 SOURCE_REGISTRY_TABLE 那一行，按 `source_id` 匹配）——不要只写到 `/tmp/last_sync_time.txt`。/tmp 仅作为飞书 API 写入失败时的兜底。详见下方「首次同步完写回信息源登记 sheet」节
5. 每批写完必须读回验收：本批主表 + 子表「信息更新时间」均非空且等于源表「更新时间」；主表无空 `子表 record_id` 的孤儿重复行；子表无反指已删除主表的孤儿行；48 个 grid 视图排序均为 `信息更新时间 desc, 编号 desc`；6 个 `已投递` 视图过滤和列顺序正确；10 条投递进度双向 workflow 均为 enabled。验收失败先修复，不能报同步成功。

#### 飞书源表 URL 解析（登记 + 同步前必做）

用户上传飞书源表时只给 URL，不会主动拆 `app_token` / `table_id`——Agent 必须自己解析后写入信息源登记 sheet（登记时）+ 读取后调 list_records（同步时）。规则：

**Python 代码**：

```python
from scripts.sync_utils import parse_feishu_bitable_url

# 用法
app_token_src, table_id_src = parse_feishu_bitable_url(
    "https://example.feishu.cn/base/bascnExample?table=tblExample&view=vewExample"
)
# → app_token_src="bascnExample", table_id_src="tblExample"
```

**边界情况**：
- URL 带 `larksuite.com` 域名（海外版）→ helper 已支持
- URL 不带 `?table=xxx` query string → 用户可能只贴了 base 链接没带 table_id，问用户要具体表链接（一张 base 可以有多张 table）
- URL 带 `?sheet=xxx` 而非 `?table=xxx` → 是飞书电子表格（非多维表格），不属于本节处理范围

#### 同步前红线（新人必读，违一则全批回滚）

**失败模式**：硬编码城市、届次或排除项会让同步结果与用户偏好错位。同步实现必须遵守以下规则：

1. **硬筛规则一律启动时 GET PROFILE_TABLE 动态读**，禁止在脚本里硬编码 `TARGET_CITIES` / `EXCLUDED_COMPANIES` / `EXCLUDED_INDUSTRIES` / `graduation_year`。用户偏好表的 `target_cities` / `graduation_year` / `excluded_companies` / `excluded_industries` 字段是唯一真源——硬编码会和用户实际画像错位，同步出一堆违规行。具体 GET 代码见下方「硬筛规则必须动态读用户偏好表（K5/K10/K11/K12）」节。

2. **5 条硬筛按顺序执行，任一不过即丢**：
   - 黑名单公司（精确匹配）→ 排除
   - 城市（任一命中 `target_cities` 即留）
   - 届次（任一届次值含 `graduation_year` 数字字符串即留，详见第 3 条）
   - **批次时间窗（按今天日期 + 用户毕业年份判断批次是否在投递期，详见第 4 条）**
   - 黑名单行业（行业标签中文显示名任一命中即排除）

   顺序不能换：城市先于届次是因为城市违规更常见，先筛掉能减少届次字符串匹配次数；届次先于批次时间窗是因为届次是字符串子串匹配成本低于时间窗判定；批次时间窗先于黑名单行业是因为时间窗能把一大批"春招/秋招补录"等过期批次直接砍掉，减少行业标签映射次数。

3. **届次匹配必须用 `replace("届", "")` 拿数字串做 `in` 子串匹配**：
   - profile 存的是 `'2027届'`，源表届次格式可能是 `'2027届'` 也可能是 `'2027'`（不带"届"）
   - 直接 `'2027届' in '2027'` → **False**，会把 7 条合法 27 届记录错杀
   - 正确写法：`grad_year_key = profile["graduation_year"].replace("届", "").strip()` → 用 `'2027'` 做 `in` 子串匹配
   - 这样 `'2027' in '2027届'` / `'2027' in '2027'` / `'2027' in '2024,2025,2026,2027届'` 全 True，`'2027' in '2028届'` 仍 False

4. **批次时间窗硬筛（K12，必须做，否则会把春招/秋招补录等过期批次同步进来）**：

   **为什么要这条**：源表「届次」字段是平台标"适用届次范围"，不是"招聘针对的届次"。一条批次=春招补招、届次=`['2026','2027届']` 的记录，对 2027 届在校生来说根本不能投（春招补招针对即将毕业的 2026 届），但因为届次字段含 `2027届` 会被第 3 条届次硬筛放行。届次硬筛只解决"届次范围匹配"，解决不了"批次时间窗匹配"——必须独立一条规则用今天日期判断批次是否在投递期。

   **规则**：批次字段含关键字 → 查对应时间窗（相对用户毕业年 `grad_year`，毕业月份统一按 6 月）→ 今天落在窗内才保留。批次字段无关键字命中（实习/校园招聘/社招/未明确）→ 保留不过滤。

   ```python
   from datetime import date

   def batch_in_time_window(batch_str, today, graduation_year_str):
       """批次是否在用户当前投递期内。today 是 date 对象。"""
       grad_year = int(graduation_year_str.replace("届", "").strip())
       b = batch_str or ""

       # 关键字判断顺序：先补招/补录（更具体），再春招，再秋招提前批，再秋招专场/秋招，再暑期实习
       if "补招" in b or "补录" in b:
           if "春" in b:
               # 春招补招：毕业当年 3-7 月
               return date(grad_year, 3, 1) <= today <= date(grad_year, 7, 31)
           if "秋" in b:
               # 秋招补录：毕业前一年 11 月 - 毕业当年 3 月
               return date(grad_year - 1, 11, 1) <= today <= date(grad_year, 3, 31)
           # 批次只写「补招/补录」无春秋前缀 → 时间窗不可判定，保留
           return True
       if "春招" in b:
           # 春招/春招专场：毕业当年 1-6 月
           return date(grad_year, 1, 1) <= today <= date(grad_year, 6, 30)
       if "秋招提前批" in b or "提前批" in b:
           # 秋招提前批：毕业前一年 7-10 月
           return date(grad_year - 1, 7, 1) <= today <= date(grad_year - 1, 10, 31)
       if "秋招专场" in b or "秋招" in b or "秋季" in b:
           # 秋招/秋招专场：毕业前一年 7 月 - 毕业当年 1 月（起始月用 7 月匹配互联网大厂提前预热节奏）
           return date(grad_year - 1, 7, 1) <= today <= date(grad_year, 1, 31)
       if "暑期实习" in b or "暑假实习" in b:
           # 暑期实习：毕业前一年 3-9 月
           return date(grad_year - 1, 3, 1) <= today <= date(grad_year - 1, 9, 30)
       # 实习/校园招聘/社招/未明确批次 → 时间窗不可判定，保留
       return True
   ```

   **硬筛调用**（在届次硬筛通过之后调）：
   ```python
   batch_str = extract_text(src_fields.get("批次"))  # 拆行后是单值，取第一个
   if not batch_in_time_window(batch_str, date.today(), profile["graduation_year"]):
       return None
   ```

   **验证用例**（今天 2026-07-08、用户 2027 届、`grad_year=2027`）：
   - `暑期实习` → 窗 `2026-03-01 ~ 2026-09-30` → ✅ 保留
   - `秋招提前批` → 窗 `2026-07-01 ~ 2026-10-31` → ✅ 保留
   - `秋招专场` → 窗 `2026-07-01 ~ 2027-01-31` → ✅ 保留（7 月 8 日已入窗）
   - `秋招补录` → 窗 `2026-11-01 ~ 2027-03-31` → ❌ 筛掉
   - `春招专场` → 窗 `2027-01-01 ~ 2027-06-30` → ❌ 筛掉
   - `春招补招` → 窗 `2027-03-01 ~ 2027-07-31` → ❌ 筛掉
   - `实习` / `校园招聘` / `社招` / `未明确` → 时间窗不可判定 → 保留

**违反以上 3 条任一** → 同步出来的数据必然含违规行，需要写 cleanup 脚本扫主表 + 子表 batch_delete 回滚（清理成本远高于一开始就动态读偏好表的成本）。

#### 同步流程总骨架

```
1. list 源表全部行 → 按更新时间过滤 → 取本批 50 条
2. 多批次拆行（2.1 节）→ N 条变 M 条
3. 字段映射（源 19 列 → 飞书主表 22 列，映射表见下）
4. 硬筛选（K5/K10/K11/K12：拆行后再筛，5 条规则全从用户偏好表动态读）
   - 黑名单公司：精确匹配即排除
   - 城市：任一命中 target_cities 即留
   - 届次：任一届次含 graduation_year 数字字符串即留（'2027届' → 用 '2027' 做 in 子串匹配）
   - 批次时间窗：按今天日期 + 用户毕业年判断批次是否在投递期（春招/秋招补录等过期批次筛掉）
   - 黑名单行业：行业标签中文显示名任一命中即排除
5. classify 判定企业性质（按 field-contract.md 1.6 节优先级）
6. 双写主表 + 子表 + 回填主表「子表 record_id」（K6：失败累计不让单条阻塞）
7. 打印本批摘要：编号范围 + 行业分布 + 子表分布 + 失败明细
8. 停下等用户确认 → 用户回「继续」后跑下一批（K7）
9. 全部批次跑完后【必做】：把该源表的 `last_sync_time` + `last_sync_result` 写回信息源登记 sheet（见下方「首次同步完写回信息源登记 sheet」节）
```

#### 首次同步完写回信息源登记 sheet（必做，不做下次触发 0.6 步会失效）

**为什么必须做**：增量同步依赖信息源登记 sheet 的 `last_sync_time`。首次同步后不写回，后续运行将失去可靠基准。

**写回内容**（PUT 到信息源登记 sheet 那一行，sheet 结构见 `init-workflow.md` 6.1 节 Sheet 3）：

```python
def writeback_source_registry_row(source_id, last_sync_time, last_sync_result):
    """同步完调一次，按 source_id 在信息源登记 sheet 里匹配行，更新 last_sync_time + last_sync_result"""
    # 1. GET 信息源登记 sheet 全部行，按 source_id 匹配到那一行的 record_id
    r = feishu_api("GET", f"/bitable/v1/apps/{APP_TOKEN}/tables/{SOURCE_REGISTRY_TABLE}/records?page_size=100")
    items = r.get("data", {}).get("items") or []
    target_rid = None
    for it in items:
        if it.get("fields", {}).get("source_id") == source_id:
            target_rid = it.get("record_id")
            break
    if not target_rid:
        # source_id 没匹配到行——可能用户手动删过，append 一行兜底
        payload = {
            "source_id": source_id,
            "last_sync_time": last_sync_time,
            "last_sync_result": last_sync_result,
        }
        feishu_api("POST",
            f"/bitable/v1/apps/{APP_TOKEN}/tables/{SOURCE_REGISTRY_TABLE}/records",
            payload)
        return

    # 2. PUT 写回 2 个字段
    payload = {
        "last_sync_time": last_sync_time,  # ISO 日期时间，如 "2026-07-07T00:00:00+08:00"
        "last_sync_result": last_sync_result,  # 如 "+37 行 / 失败 0 条"
    }
    feishu_api("PUT",
        f"/bitable/v1/apps/{APP_TOKEN}/tables/{SOURCE_REGISTRY_TABLE}/records/{target_rid}",
        payload)
```

**`last_sync_time` 取值**：本批同步的源表记录里最大的「更新时间」字段值（毫秒时间戳转 ISO 日期时间）。如果是多批同步，**全部批次跑完后**取最后一批的最大值写回。

**`last_sync_result` 取值**：简要可读结果，如 `+37 行 / 失败 0 条`、`+12 行 / 失败 2 条:token 过期`、`无新增`。用户后续可在飞书表里直接看到每个源表最近一次同步结果。

**字段类型注意**：
- `source_id` / `last_sync_result` 在信息源登记 sheet 里建为 Text 类型
- `last_sync_time` 建为 DateTime 类型（飞书多维表格原生支持），写入时用毫秒时间戳；若建表时漏建这一列，可退而用 Text 类型存 ISO 字符串

**向后兼容**：本规则上线前老偏好 sheet 可能有 `source_table_app_token` / `source_table_table_id` / `source_table_name` / `last_sync_time` 4 列。只有当信息源登记 sheet 为空时，允许读取这 4 列迁移出一条信息源登记记录；迁移完成后不再读取或写入这些旧字段。

**飞书 API 写入失败的兜底**：若 PUT 信息源登记 sheet 返回非 0 code，退到 `/tmp/last_sync_time.txt` + `/tmp/source_table_a_app_token.txt` 兜底，并告诉用户「last_sync_time 写回飞书失败，已暂存 /tmp，建议下次触发前手动补写到信息源登记 sheet，否则增量同步会失效」。

#### 字段映射表（源表 19 列 → 飞书主表 22 列，K1）

飞书主表 22 列定义见 `excel-insert.md`「表格列定义」节。源表 19 列映射如下，缺的 5 列按本表填：

| 飞书主表列 | 源表列 | 映射规则 |
|---|---|---|
| 编号 | — | **顺延数字**：当前主表最大编号 +1（K1） |
| 信息更新时间 | 更新时间 | 源表更新时间，写入 DateTime；主表 + 对应子表必须写同一值。若源表该列为空则留空，不用当前时间替代 |
| 投递进度 | — | **默认 `待确认`** |
| 公司 | 公司名称 | 直传 |
| 届次 | 届次 | 数组 → MultiSelect |
| 招聘批次 | 批次 | 数组 → **拆行后单值** → SingleSelect |
| 招聘项目 | — | **留空**（源表无此列，K1） |
| 招聘岗位 | 招聘岗位 | 直传 |
| 城市 | 工作地点 | 数组 → 中文「、」分隔字符串 |
| 投递截止时间 | 截止时间 | 直传；空值填「未公布」 |
| 学历要求 | 学历要求 | 直传 |
| 专业要求 | 专业要求 | 直传 |
| 行业标签 | 行业分类 | **26 取值映射到 14 industry_module ID**，见下方映射表（K2） |
| 是否笔试 | 是否笔试 | 数组含「要笔试」→ `要笔试`；含「免笔试/不要笔试」→ `不要笔试`；否则 `未知` |
| 来源平台 | 公告来源 | 空值填「用户上传飞书表」 |
| 公告链接 | 公告链接 | Url 字段抽 link；type=11 触发 UserFieldConvFail 时改 type=1（K4） |
| 投递链接 | 投递链接 | Url 字段优先抽 link，回退抽 text |
| 内推链接 | — | **留空**（K1） |
| 内推码 | — | **留空**（K1） |
| 备注 | 备注 | 直传 |
| 企业性质 | — | **classify() 判定**，不直接读源表「企业性质」列（K3） |
| 子表 record_id | — | **双写后回填**：先写主表拿 main_rid → 写子表拿 sub_rid → update 主表该列填 sub_rid |

#### 源表 26 个行业分类 → 14 个 industry_module ID 精确映射（K2）

源表「行业分类」字段是 26 个具体取值（如「IT/互联网/游戏」「通信/电子/半导体」），**不要用泛关键词做 `in ind_str` 字符串包含匹配**——本轮跑通时第一次用了「互联网 in ind_str」「金融 in ind_str」这类泛匹配，结果 44/54 条全部不命中落到「其他」标签。正确做法是按下方精确映射表逐个对应，映射不到的兜底到 `other`：

```python
SOURCE_INDUSTRY_TO_ID = {
    # internet（互联网与科技）
    "IT/互联网/游戏": "internet",
    "通信/电子/半导体": "internet",  # 央企互联网子公司（如中国电信-天翼云）按优先级归 internet（K3）
    "智能硬件": "internet",
    # finance（金融）
    "金融业": "finance",
    # fmcg（快消与零售）
    "快速消费品": "fmcg",
    "贸易/批发/零售": "fmcg",
    "耐用消费品": "fmcg",
    # manufacturing（制造业）
    "机械/制造业": "manufacturing",
    # newenergy_auto（新能源与汽车）
    "汽车制造/维修/零配件": "newenergy_auto",
    "新能源": "newenergy_auto",
    # healthcare（医疗与健康）
    "医疗/医药/生物": "healthcare",
    # education（教育）
    "教育/培训/科研": "education",
    # realestate（房地产与建筑）
    "房地产业/建筑业": "realestate",
    # culture_media（文化传媒与娱乐）
    "文化/传媒/广告/体育": "culture_media",
    # energy_chem（能源与化工）
    "能源/化工/环保": "energy_chem",
    # marketing_consulting（广告营销与咨询）
    "财务/审计/税务": "marketing_consulting",
    "咨询": "marketing_consulting",
    "商务服务业": "marketing_consulting",
    "人力资源服务": "marketing_consulting",
    # central_soe（央国企）
    "政府/机构/组织": "central_soe",
    # other（其他 / 兜底）
    "交通/物流/仓储": "other",
    "农林牧渔": "other",
    "生活服务业": "other",
    "法律": "other",
    "检测/认证": "other",
    "未明确": "other",
}
```

映射到 ID 后再转中文显示名（落到飞书主表「行业标签」列），ID→显示名对照见 `excel-insert.md`「行业标签取值」节。

#### classify 判企业性质的优先级陷阱（K3）

**不要直接读源表「企业性质」字段落到飞书主表「企业性质」列**——源表里某条记录可能标「央企」，但它的「行业分类」是「通信/电子/半导体」（如中国电信-天翼云），按 `field-contract.md` 1.6 节优先级 `internet > finance > foreign > central_soe > other_private`，央企互联网子公司应归「互联网」子表，不归「央国企」子表。

正确判定流程（照搬 `field-contract.md` 1.6 节 canonical classify()）：

```python
def classify(industry_labels, src_enterprise_type):
    """industry_labels 是映射后的中文显示名列表（如 ['互联网与科技', '央国企']）"""
    # 1. 优先按行业标签命中 internet / finance
    for ind in industry_labels:
        if ind == "互联网与科技": return "互联网"
        if ind == "金融": return "金融银行"
    # 2. 否则按源表「企业性质」字段判
    etype = str(src_enterprise_type or "")
    if etype in ("外企", "外资"): return "外企"
    if "央" in etype or "国" in etype: return "央国企"
    # 3. 兜底
    return "其他私企"
```

例：
- 中国电信-天翼云：行业标签=[互联网与科技]，源表企业性质=央企 → classify 返回「互联网」（命中 internet 优先级）
- 航天科技四院：行业标签=[制造业]，源表企业性质=央企 → classify 不命中 internet/finance，走企业性质字段 → 返回「央国企」
- 源乐晟资产：行业标签=[金融]，源表企业性质=民营 → classify 命中 finance → 返回「金融银行」

#### 公告链接字段写表时也会触发 1254066（K4）

`excel-insert.md` 第 467 行已记录「建表时」type=11 可能被识别成 User 字段报 `1254066 UserFieldConvFail`。本轮同步时踩到的额外坑：**建表已成功、字段已是 type=11 的情况下，写表（batch_create）时同样会触发 1254066**——不同 app 级配置下飞书对 type=11 的解析不一致。

修复路径（一次性，所有 6 sheet 都要改）：

```bash
# 1. list fields 拿到「公告链接」字段的 field_id
curl -s -X GET "https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/fields" \
  -H "Authorization: Bearer ${TOKEN}" | jq '.data.items[] | select(.field_name=="公告链接")'

# 2. PUT 改字段类型为 type=1 Text
curl -s -X PUT "https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/fields/${FIELD_ID}" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"field_name":"公告链接","type":1}'
```

改完后 batch_create 时「公告链接」字段直接传 URL 字符串即可，失去点击跳转能力但功能不丢。**主表 + 5 子表共 6 sheet 都要改一遍**——只改主表会导致子表写入同样报 1254066。

#### 硬筛规则必须动态读用户偏好表（K5/K10/K11/K12）

**失败模式**：同步脚本硬编码目标城市或遗漏届次硬筛，会写入不符合用户偏好的记录。

**正确做法**：sync 脚本启动时按表名解析「用户偏好」的真实 table_id，动态拿 4 个硬筛规则：

```python
PROFILE_TABLE = resolve_table_id_by_name("用户偏好")

def get_user_profile():
    r = feishu_api("GET",
        f"/bitable/v1/apps/{APP_TOKEN}/tables/{PROFILE_TABLE}/records?page_size=10")
    f = r["data"]["items"][0]["fields"]
    cities_str = extract_text(f.get("target_cities"))
    target_cities = {c.strip() for c in cities_str.split(",") if c.strip()}
    grad_year = extract_text(f.get("graduation_year"))  # '2027届'
    excluded_companies_str = extract_text(f.get("excluded_companies"))
    excluded_companies = {c.strip() for c in excluded_companies_str.split(",") if c.strip()}
    excluded_industries_str = extract_text(f.get("excluded_industries"))
    excluded_industries = {c.strip() for c in excluded_industries_str.split(",") if c.strip()}
    return {
        "target_cities": target_cities,
        "graduation_year": grad_year,
        "excluded_companies": excluded_companies,
        "excluded_industries": excluded_industries,
    }
```

**5 条硬筛规则**（在 `map_record` 里按顺序判，任一不过就 `return None`）：

1. **黑名单公司**（K11）：`company in profile["excluded_companies"]` → 排除。精确匹配，不做子串。
2. **城市硬筛**（K5）：源表「工作地点」是数组，**任一城市命中 `target_cities` 即保留**（命中即留，不要全部城市都在目标列表里才留）：
   ```python
   hit = any(c in profile["target_cities"] for c in cities) if cities else False
   if not hit:
       return None
   ```
3. **届次硬筛**（K10）：源表「届次」是数组，**任一届次值含 graduation_year 数字字符串即保留**。注意要把 `'2027届'` 去掉「届」字用 `'2027'` 做 `in` 子串匹配——否则源表里写 `'2027'`（不带「届」）的条目会被 `'2027届' in '2027'` 误判为 False 错杀：
   ```python
   grad_year_key = profile["graduation_year"].replace("届", "").strip()  # '2027届' → '2027'
   grade_hit = any(grad_year_key in str(g) for g in grades) if grades else False
   if not grade_hit:
       return None
   ```
   这样 `'2027'` 能命中 `'2027届'`、`'2027'`、`'2024,2025,2026,2027届'`，不会误命中 `'2028届'`。
4. **批次时间窗硬筛**（K12）：届次硬筛只判"届次范围匹配"，判不了"批次时间窗匹配"——一条批次=春招补招、届次=`['2026','2027届']` 的记录对 2027 届在校生根本不能投，但届次硬筛会放行。必须再加一条用今天日期判断批次是否在投递期：
   ```python
   from datetime import date

   def batch_in_time_window(batch_str, today, graduation_year_str):
       """批次是否在用户当前投递期内。today 是 date 对象。"""
       grad_year = int(graduation_year_str.replace("届", "").strip())
       b = batch_str or ""

       if "补招" in b or "补录" in b:
           if "春" in b:
               return date(grad_year, 3, 1) <= today <= date(grad_year, 7, 31)
           if "秋" in b:
               return date(grad_year - 1, 11, 1) <= today <= date(grad_year, 3, 31)
           return True
       if "春招" in b:
           return date(grad_year, 1, 1) <= today <= date(grad_year, 6, 30)
       if "秋招提前批" in b or "提前批" in b:
           return date(grad_year - 1, 7, 1) <= today <= date(grad_year - 1, 10, 31)
       if "秋招专场" in b or "秋招" in b or "秋季" in b:
           return date(grad_year - 1, 7, 1) <= today <= date(grad_year, 1, 31)
       if "暑期实习" in b or "暑假实习" in b:
           return date(grad_year - 1, 3, 1) <= today <= date(grad_year - 1, 9, 30)
       return True

   # map_record 里调用：
   batch_str = extract_text(src_fields.get("批次"))  # 拆行后是单值
   if not batch_in_time_window(batch_str, date.today(), profile["graduation_year"]):
       return None
   ```
   完整规则说明 + 验证用例见上方「同步前红线」第 4 条。
5. **黑名单行业**（K11）：行业标签映射后的中文显示名（如「互联网与科技」）任一命中 `excluded_industries` 即排除：
   ```python
   if profile["excluded_industries"]:
       for ind in industry_labels:
           if ind in profile["excluded_industries"]:
               return None
   ```

**硬筛顺序**：黑名单公司 → 城市 → 届次 → 批次时间窗 → 黑名单行业。城市先于届次是因为城市违规更常见（非目标城市条目占比高），先筛掉能减少届次字符串匹配的调用次数；届次先于批次时间窗是因为届次是字符串子串匹配成本低于时间窗判定；批次时间窗先于黑名单行业是因为时间窗能把一大批过期批次直接砍掉，减少行业标签映射次数。

**硬筛必须在拆行之后做**（K5 原有规则保留）：先按城市筛源表行 → 再拆多批次的顺序是错的，会让"工作地点=北京、批次=[暑期实习, 秋招]"的行在拆行前就被筛掉或保留，无法对拆出来的两条独立行分别判定。

```python
# 1. 拆行
for src in batch_src:
    split_rows.extend(split_batches(src["fields"]))  # 2.1 节

# 2. 字段映射 + 硬筛（届次/城市/黑名单公司/批次时间窗/黑名单行业）
profile = get_user_profile()  # 启动时读一次
for sf in split_rows:
    m = map_record(sf, profile)  # map_record 内部做 5 条硬筛
    if m is None:
        skipped += 1
        continue
    mapped.append(m)
```

**清理已同步违规数据**：先生成 dry-run 清单，确认主表和子表 record_id 配对后再删除。清理逻辑必须与同步脚本共享同一份硬筛规则，禁止直接全删子表重建。

#### 双写失败用 fail 列表累计，不让单条阻塞（K6）

错误做法：双写时主表成功 → 子表失败 → 整批 abort。这会留下"半条"记录（主表有行、子表没行、主表「子表 record_id」列为空），且后续条目全被阻塞。

正确做法：

```python
fail = []
for i, m in enumerate(mapped):
    seq = next_seq + i
    m["编号"] = str(seq)
    # 1. 写主表
    main_rid, err = write_record(MAIN_TABLE, m)
    if not main_rid:
        fail.append({"seq": seq, "company": m["公司"], "stage": "main", "err": err})
        continue
    # 2. 写子表
    sub_tid = SUB_TABLES[m["企业性质"]]
    sub_payload = dict(m)
    sub_payload["子表 record_id"] = main_rid
    sub_rid, err = write_record(sub_tid, sub_payload)
    if not sub_rid:
        fail.append({"seq": seq, "company": m["公司"], "stage": "sub_write", "err": err})
        continue
    # 3. 回填主表
    ok, _ = update_record(MAIN_TABLE, main_rid, {"子表 record_id": sub_rid})
    if not ok:
        fail.append({"seq": seq, "company": m["公司"], "stage": "backfill", "err": "update failed"})
        continue
    success_main += 1
    success_sub += 1

# 摘要里打印 fail 列表，下批前用户决定回滚还是补救
```

注意：
- 主表写成功 + 子表写失败时，主表那条行的「子表 record_id」列为空——下批同步前要决策是回滚（删主表那条）还是补救（重写子表）。默认**留着不删**，由用户决定；下次触发 skill 时 `excel-insert.md` 「单边写入失败的修复」节会自动补子表
- fail 列表里 `err` 字段截前 200 字打印，避免飞书 API 错误 JSON 太长刷屏

#### 分批同步每批 50 条，停下等用户确认（K7）

源表 715 条一次同步太多，用户没法核对。强制分批：

- `BATCH_SIZE = 50`（按源表记录数，拆行后可能 60+ 条）
- 每批同步完打印摘要：

  ```
  === 第 N 批结果 ===
  源记录: 50 → 拆行后 62 → 城市筛后 54
  主表写入: 54 条
  子表写入: 54 条
  失败: 0 条
  
  编号范围: 1-54
  行业标签分布: 互联网与科技 23, 制造业 8, 金融 6, 其他 4, ...
  企业性质/子表分布: 互联网 23, 其他私企 13, 央国企 12, 金融银行 6, 外企 0
  
  下一批起始编号: 55
  === 第 N 批结束，等用户确认后再执行第 N+1 批 ===
  ```

- 用户回「继续」/「下一批」→ 跑下一批（BATCH_INDEX += 1，起始编号接续）
- 用户回「这批有问题」→ 停下排查，不进下一批
- 用户回「跳过这批」→ 跳过 [N*50:(N+1)*50] 这段，下一批从 [(N+1)*50:(N+2)*50] 开始（编号不跳，仍接续主表当前最大值）

**重跑同批前必须先清空主表 + 5 子表**（用 `batch_delete` 一次最多 500 条）——否则会写入重复行。清空脚本流程：list 主表 + 5 子表全部行 → 累加 record_id → 分表 batch_delete。

#### list_records 翻页（K8）

主表 + 5 子表超过 500 条时单次 list 拿不全。必须用 `page_size=500 + page_token` 翻页：

```python
def list_records(table_id):
    all_records = []
    page_token = None
    while True:
        path = f"/bitable/v1/apps/{APP_TOKEN}/tables/{table_id}/records?page_size=500"
        if page_token:
            path += f"&page_token={page_token}"
        r = feishu_api("GET", path)
        if r.get("code") != 0:
            break
        data = r.get("data", {}) or {}
        all_records.extend(data.get("items") or [])
        if not data.get("has_more"):
            break
        page_token = data.get("page_token")
    return all_records
```

主表超过 500 条时算起始编号也要翻页拿全——`get_next_seq` 遍历全部主表记录找最大编号。

#### 6 个批次视图和 `已投递` 视图的 filter + 所有 grid 视图的 sort 必须配（K9）

**场景**：每张表（主表 + 5 子表）都建了默认视图 + 6 个批次视图（暑期实习 / 秋招提前批 / 秋招 / 春招 / 补录 / 其他批次）+ `已投递` 视图。批次视图必须按招聘批次过滤，`已投递` 必须按 `投递进度 = 已投递` 过滤；所有 grid 视图还必须有 sort，否则新同步的信息会沉到末尾。**每批同步完必须检查 7 个过滤视图，并给每张表的 8 个 grid 视图设置 sort**。

**视图名 → 归并的批次选项名（跨表通用）**：

| 视图名 | 归并的批次选项名 |
|---|---|
| 暑期实习 | 暑期实习、暑期实习生、暑期 |
| 秋招提前批 | 秋招提前批、提前批 |
| 秋招 | 秋招、秋季校园招聘、秋招正式批、秋招专场 |
| 春招 | 春招、春季校园招聘、春招专场 |
| 补录 | 补录、春招补录、秋招补录、校招补录、春招补招 |
| 其他批次 | 实习、社招 |

**关键 API 坑（踩了一整轮才发现）**：

1. **PATCH view 的过滤字段是 `property.filter_info`，不是 `property.filter`**——用 `property.filter` 返回 code=0 但 property 静默被吞成 null，filter 不生效
2. **SingleSelect 字段的 `value` 必须是 JSON 字符串，不是数组**——飞书 API 报错信息明确说「the condition value of 'Single Option' must be a legal json string, and the content is a list of strings, which like `'["optaxx","optbxx"]'`」。直接传 `["optVUCx0a1"]` 数组会报 9499 Invalid parameter type；直接传 `"optVUCx0a1"` 字符串会报 1254001
3. **每个 condition 一个选项，conjunction=or 归并**——不要试图用一个 condition 的 value 数组塞多个选项 ID，飞书 SingleSelect 不支持
4. **list_views 不返回 property**——验证 filter 是否生效不能用 list_views（property 永远是 null），要单独 GET `/views/{view_id}` 才能看到 filter_info
5. **跨表 option_id 可能不同**——主表「暑期实习」的 option_id 是 `optVUCx0a1`，但子表可能是另一个 ID。每张表都要单独 list_fields 拿「招聘批次」字段的 options 映射，不能硬编码主表的 option_id

**给单张表配 7 个过滤视图 + 8 个 grid 视图 sort 的脚本骨架**：

```python
VIEW_BATCH_NAMES = {
    "暑期实习": ["暑期实习", "暑期实习生", "暑期"],
    "秋招提前批": ["秋招提前批", "提前批"],
    "秋招": ["秋招", "秋季校园招聘", "秋招正式批", "秋招专场"],
    "春招": ["春招", "春季校园招聘", "春招专场"],
    "补录": ["补录", "春招补录", "秋招补录", "校招补录", "春招补招"],
    "其他批次": ["实习", "社招"],
}

def lark_cli_view_set_sort(table_id, view_id, sort_payload):
    run_lark([
        "base", "+view-set-sort",
        "--base-token", APP_TOKEN,
        "--table-id", table_id,
        "--view-id", view_id,
        "--json", json.dumps(sort_payload, ensure_ascii=False),
        "--format", "json",
    ])

def apply_view_filters_and_sort(table_id):
    # 1. list_views 拿 view_name → view_id
    r = feishu_api("GET", f"/bitable/v1/apps/{APP_TOKEN}/tables/{table_id}/views")
    views = {v["view_name"]: v["view_id"] for v in r["data"]["items"]}

    # 2. list_fields 拿「招聘批次」和「投递进度」的 field_id / option_id
    r = feishu_api("GET", f"/bitable/v1/apps/{APP_TOKEN}/tables/{table_id}/fields")
    batch_field = None
    status_field = None
    for f in r["data"]["items"]:
        if f["field_name"] == "招聘批次":
            batch_field = f
        elif f["field_name"] == "投递进度":
            status_field = f
    field_id = batch_field["field_id"]
    opts = {o["name"]: o["id"] for o in batch_field["property"]["options"]}

    # 3. 给当前表的全部 8 个 grid 视图设置 sort：最新信息置顶
    sort_payload = {"sort_config": [{"field": "信息更新时间", "desc": True}, {"field": "编号", "desc": True}]}
    for view_id in views.values():
        lark_cli_view_set_sort(table_id, view_id, sort_payload)

    # 4. 给 6 个批次视图 PATCH filter_info
    for view_name, batch_names in VIEW_BATCH_NAMES.items():
        view_id = views.get(view_name)
        if not view_id:
            continue  # 视图不存在跳过
        opt_ids = [opts[n] for n in batch_names if n in opts]
        if not opt_ids:
            continue  # 该表没有这些选项跳过（如外企表无实习/社招）
        conditions = [
            {"field_id": field_id, "operator": "is", "value": json.dumps([oid])}
            for oid in opt_ids
        ]
        payload = {
            "property": {
                "filter_info": {"conjunction": "or", "conditions": conditions}
            }
        }
        feishu_api("PATCH",
            f"/bitable/v1/apps/{APP_TOKEN}/tables/{table_id}/views/{view_id}",
            payload)

    # 5. 给「已投递」视图设置状态过滤；创建/修复列顺序见 excel-insert.md
    delivered_view_id = views.get("已投递")
    status_opts = {o["name"]: o["id"] for o in status_field["property"]["options"]}
    if delivered_view_id and status_opts.get("已投递"):
        payload = {
            "property": {
                "filter_info": {
                    "conjunction": "and",
                    "conditions": [{
                        "field_id": status_field["field_id"],
                        "operator": "is",
                        "value": json.dumps([status_opts["已投递"]]),
                    }],
                }
            }
        }
        feishu_api("PATCH",
            f"/bitable/v1/apps/{APP_TOKEN}/tables/{table_id}/views/{delivered_view_id}",
            payload)
```

**验证 filter 生效**（不能用 list_views，要单独 GET 单个视图 + 用 view_id 拉记录数）：

```python
# 1. GET 单个视图看 filter_info
r = feishu_api("GET",
    f"/bitable/v1/apps/{APP_TOKEN}/tables/{table_id}/views/{view_id}")
assert r["data"]["view"]["property"]["filter_info"]["conditions"]

# 2. 用 view_id 拉记录数，主表预期：暑期实习 15、秋招提前批 7、秋招 18、春招 4、其他批次 10
r = feishu_api("GET",
    f"/bitable/v1/apps/{APP_TOKEN}/tables/{table_id}/records?view_id={view_id}&page_size=500")
n = len(r["data"]["items"])
```

**自动跑在 sync_batchN.py 末尾**：每批同步完，对 6 张表都调一遍 `apply_view_filters_and_sort(table_id)`，因为新写入的记录可能引入新的批次选项值（如某条用了「春招专场」而该表之前没这个 option），不重跑会让该选项对应的视图过滤不到这条新记录；同时 sort 保证新更新信息显示在表格最上方。运行成本：6 表 ×8 视图 sort + 6 表 ×7 过滤视图，需串行调用并对飞书限流做短暂重试。

#### 同步脚本结构模板

实现批量同步时可按本节模板在未跟踪的 `.work/` 目录创建临时脚本：

```python
#!/usr/bin/env python3
"""第 N 批同步：50 条源表记录 → 飞书主表 + 子表双写。"""
import json, sys, subprocess
sys.path.insert(0, "/path/to/skills/job-collection/scripts")
from get_token import get_token

APP_TOKEN = "..."  # 用户自己的 base app_token
MAIN_TABLE = "..."
PROFILE_TABLE = "..."  # 用户偏好表（K5/K10/K11/K12 动态读硬筛规则，必填）
SUB_TABLES = {"互联网": "...", "金融银行": "...", "外企": "...", "央国企": "...", "其他私企": "..."}
SOURCE_FILE = ".work/source_candidates.json"  # 本轮远端读取后的临时候选
BATCH_SIZE = 50
BATCH_INDEX = 1  # 改这一行

# SOURCE_INDUSTRY_TO_ID、INDUSTRY_ID_TO_NAME、classify()
# 全部照搬本节 + field-contract.md 1.6 节
# 不要硬编码 TARGET_CITIES / EXCLUDED_COMPANIES / EXCLUDED_INDUSTRIES ——
# 这些必须启动时从 PROFILE_TABLE 动态读（K5/K10/K11/K12）

# feishu_api / extract_text / extract_url / split_batches / map_record
# / get_user_profile / write_record / update_record / list_main_records
# / get_next_seq / main 全部照搬本节骨架

if __name__ == "__main__":
    main()
```

该模板是结构示例，不包含用户专属 token 或 table_id。实际运行时必须按表名解析真实 ID，并动态读取用户偏好。

### 字段对齐注意

- 源表的"链接"列常混着多种 URL（招聘官网、网申入口、推文链接），全部保留，由质检阶段判定是否过期
- 源表的"截止时间"格式可能多种（`2026-08-31`、`8月底`、`常年`），统一转 ISO 日期或写`招满即止` / `未公布`
- 源表若有"匹配度""评级"或类似分级列，**忽略**——本 skill 不打分，直接保留原始行进入后续去重与硬筛选

## 三、腾讯智能表格（浏览器辅助来源）

腾讯 Smartsheet 不走飞书 API，也不猜测私有接口。用户已登录且表格可见时，按 `references/tencent-smartsheet-source.md` 使用浏览器逐屏读取、日期边界和重叠行校验。导出/复制可用时优先结构化导入；不可用时允许视觉扫描，但必须取得可验证的公告或投递入口。

定时增量必须使用该来源在「信息源登记」中的独立 `last_sync_time`，重扫最近两个日历日，并与飞书来源共用目标主表去重索引。浏览器不可用或未扫描到日期边界时保留旧游标，不得声称同步成功。

## 四、合并与优先级

全部 active 用户来源共享目标主表去重索引：

- 已在目标主表里 → 不重复添加；新来源更完整时只补全来源字段
- 不在目标主表里 → 作为新增企业加入

## 五、用户上传失败的处理

- 链接打不开 / 需要权限申请 → 明确告诉用户「表格访问被拒，请检查是否设为公开可读，或把 AI 应用加入协作者」
- 表格是空表 → 询问用户是不是还没填，确认后按初始化流程创建新表
- 表格不是招聘信息表（明显是其他主题）→ 提示用户发错了链接，问要不要换
- 用户发腾讯 Smartsheet 链接 → 按第三节和 `tencent-smartsheet-source.md` 探测浏览器/导出能力；权限或登录失败时明确报告并保留来源登记
