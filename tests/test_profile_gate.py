from pathlib import Path
import importlib.util
import unittest


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = (
    ROOT
    / "skills"
    / "offerloop-workspace"
    / "scripts"
    / "profile_gate.py"
)


def load_module():
    spec = importlib.util.spec_from_file_location("profile_gate", SCRIPT)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


class ProfileGateTest(unittest.TestCase):
    def setUp(self):
        self.gate = load_module()

    def assert_empty(self, markdown):
        self.assertEqual(self.gate.assess_profile(markdown)["status"], "empty")

    def assert_ready(self, markdown):
        self.assertEqual(self.gate.assess_profile(markdown)["status"], "ready")

    def test_blank_and_title_only_profiles_are_empty(self):
        self.assert_empty("")
        self.assert_empty("# 用户画像｜小王\n")

    def test_empty_schema_and_placeholders_are_empty(self):
        self.assert_empty(
            """# 用户画像｜小王

## 求职硬条件
- 城市：待补充
- 行业领域：
- 招聘类型与届别：未知

## 岗位偏好
- 目标岗位：N/A
- 可接受相邻岗位：[]
- 明确排除：待补充：后续确认

## 经历、能力与证据
- 已确认优势：能力｜证据｜来源

## 性格、兴趣与环境偏好
- 未确认推断：不得写入正式画像

## 产物信息
- 状态：incomplete
"""
        )

    def test_one_confirmed_value_is_enough_even_if_incomplete(self):
        self.assert_ready(
            """# 用户画像｜小王

## 岗位偏好
- 目标岗位：AI 产品经理

## 产物信息
- 状态：incomplete
"""
        )

    def test_new_self_profile_schema_without_user_content_is_empty(self):
        self.assert_empty(
            """# 用户画像｜小王

## 当前的自我认识
- 用户怎样描述自己：
- 已确认的稳定特质：特质｜用户如何理解它｜来源
- 已被用户否认的解释：解释｜否认原因

## 情绪与困惑记录
- 日期｜用户带来的情绪或困惑｜必要的触发背景｜对话后厘清的认识｜仍未解决或待继续观察

## 岗位可迁移边界
- 直接匹配方向：方向｜依据
- 可迁移方向：方向｜迁移路径｜用户确认
- 信息不足方向：方向｜缺少什么信息
- 当前未见基础的高专业门槛：方向/门槛｜判断来源｜待用户确认
- 边界声明：以上不是永久岗位黑名单，不得写成“绝对不能做”

## 已确认的语言画像

### 自然口语
- 开场方式：
- 句子长度与节奏：

### 书面表达
- 信息组织方式：

## 样本来源
- 日期｜样本名称或来源｜口语/书面｜使用场景｜证据权重

## 典型改写记录
- Agent 原表达｜用户实际改写｜反映出的语言习惯｜用户确认

## 待确认与继续观察
- 候选特征｜观察来源｜出现次数｜当前置信度
"""
        )

    def test_confirmed_self_understanding_is_ready(self):
        self.assert_ready(
            """# 用户画像｜小王

## 当前的自我认识
- 用户怎样描述自己：我很容易因为不确定性焦虑，但会通过拆解问题恢复掌控感。
"""
        )

    def test_confirmed_free_form_preference_is_ready(self):
        self.assert_ready(
            """# 用户画像｜小王

## 表达与协作风格
- 用户确认更喜欢先讲结论，再解释原因。
"""
        )

    def test_empty_job_preference_schema_is_empty(self):
        self.assert_empty(
            """# 岗位选择偏好｜小王

## 基本求职信息
- 当前学历：
- 所学专业：
- 预计毕业年份：
- 过往接触的岗位方向：

## 招聘信息保留范围
- 城市筛选模式：指定城市 / 全国
- 可直接保留的城市：
- 可保留的行业：不限 / 具体行业

## 岗位选择结论
### 直接匹配且愿意考虑
- 岗位方向｜判断依据｜用户确认
### 可迁移且愿意考虑
- 岗位方向｜迁移路径｜用户确认

## 招聘信息使用规则
- 城市、招聘类型、行业和明确排除公司按照已确认范围执行筛选。
- 岗位名称不同或没有同名实习，不能直接排除招聘信息。
- 可迁移岗位按照已确认的迁移路径保留。
- 只有可靠来源展示了企业完整招聘范围，并且全部岗位都是用户确认完全不考虑的方向时，才在写入企业清单前让用户确认。
- 用户接受某一次边界外机会，不自动修改长期岗位偏好。

## 待补充信息
- 尚未回答或尚未确认的内容：
"""
        )

    def test_confirmed_job_preference_is_ready(self):
        self.assert_ready(
            """# 岗位选择偏好｜小王

## 基本求职信息
- 所学专业：工商管理
"""
        )


if __name__ == "__main__":
    unittest.main()
