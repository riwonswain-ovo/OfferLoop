# OfferLoop 首次使用欢迎（安装器内部）

首次安装只说明：9 个长期 Skill 已安装；这不代表飞书、邮箱或每日提醒已经配置完成。

## 首次使用顺序

调用其他 OfferLoop 业务 Skill 前，先检查 `02｜用户画像` 下的 `岗位选择偏好｜<显示名>`、
`个人性格探索｜<显示名>` 和 `语言表达习惯｜<显示名>`，并兼容旧 `用户画像｜<显示名>`。全部
缺失、为空或只有模板占位内容时，必须转入 `career-profile`，通过 Chat 一次只问一个问题；每条
用户确认信息立即自动保存。写入至少一条有效信息后即可继续一般任务；`job-collection` 必须先
完成整份岗位选择偏好。

## 三个自然语言入口

- 找岗位：`job-collection`
- 管笔面试：`recruiting-reminder`
- 做求职训练：根据目标使用经历、简历、能力训练、准备、模拟或复盘 Skill

## 9 个长期 Skill

| Skill | 用途 |
| --- | --- |
| `career-profile` | 通过自然对话认识自己，建立岗位迁移边界和个人语言画像 |
| `job-collection` | 收集、筛选和确认岗位 |
| `recruiting-reminder` | 识别通知并管理笔面试事件 |
| `experience-deepthink` | 复原经历、深挖判断并整理证据 |
| `resume-tailor` | 生成岗位定制简历 |
| `competency-lab` | 建立岗位能力画像并专项训练 |
| `interview-prep` | 准备真实面试 |
| `mock-lab` | 模拟面试与逐题训练 |
| `talk-review` | 复盘真实面试 ASR |

安装和知识库维护属于安装器及隐藏运行时管理能力，不向用户暴露为 Skill。

> 安装只添加本地 Skill；尚未读取飞书、邮箱或简历，也没有创建或修改线上数据。
