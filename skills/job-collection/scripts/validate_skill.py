#!/usr/bin/env python3
"""Repository-level checks for publishing the skill safely."""

from __future__ import annotations

import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
REQUIRED_FILES = {
    "SKILL.md",
    "references/init-workflow.md",
    "references/personal-excel-source.md",
    "references/tencent-smartsheet-source.md",
    "references/excel-insert.md",
    "references/field-contract.md",
    "references/dedup_judge.md",
    "references/prewrite-confirmation.md",
    "references/failure-handling.md",
    "references/notification.md",
    "scripts/tencent_mcp.py",
    "scripts/tencent_mcporter.py",
    "scripts/notification_authorization.py",
    "scripts/incremental_scan.py",
    "scripts/dedupe_candidates.py",
    "scripts/sync_pipeline.py",
    "scripts/execution_contract.py",
    "tests/test_sync_utils.py",
    "tests/test_dedupe_candidates.py",
    "tests/test_sync_pipeline_missing_links.py",
}

TEXT_SUFFIXES = {".md", ".py", ".toml", ".yml", ".yaml", ".example"}
PRIVATE_PATTERNS = {
    "personal absolute path": re.compile(r"/(?:Users|home)/[^/<>'\s]+/"),
    "concrete Feishu Base token": re.compile(r"\bbascn(?!Example\b)[A-Za-z0-9_-]{8,}\b"),
    "concrete Feishu table id": re.compile(r"\btbl(?!Example\b)[A-Za-z0-9]{10,}\b"),
    "concrete Feishu view id": re.compile(r"\bvew(?!Example\b)[A-Za-z0-9]{10,}\b"),
    "secret assignment": re.compile(
        r"FEISHU_APP_SECRET=(?!replace-me\b|x{8,}\b)[A-Za-z0-9_-]{20,}"
    ),
    "concrete Tencent Docs token": re.compile(
        r"TENCENT_DOCS_TOKEN=(?!replace-me\b|x{8,}\b)[^\s#]{20,}"
    ),
}


def text_files() -> list[Path]:
    result = []
    for path in ROOT.rglob("*"):
        if not path.is_file() or ".git" in path.parts:
            continue
        if path.name in {"LICENSE", "VERSION", ".gitignore"} or path.suffix in TEXT_SUFFIXES:
            result.append(path)
    return result


def validate_frontmatter(errors: list[str]) -> None:
    skill = (ROOT / "SKILL.md").read_text(encoding="utf-8")
    if not skill.startswith("---\n") or "\n---\n" not in skill[4:]:
        errors.append("SKILL.md: missing YAML frontmatter")
        return
    frontmatter = skill.split("---", 2)[1]
    if not re.search(r"^name:\s*job-collection\s*$", frontmatter, re.MULTILINE):
        errors.append("SKILL.md: name must be job-collection")
    description = re.search(r"^description:\s*(\S.+)$", frontmatter, re.MULTILINE)
    if not description or description.group(1).strip() in {"|", ">"}:
        errors.append("SKILL.md: description must be a non-empty single-line scalar")
    if len(skill.splitlines()) > 200:
        errors.append("SKILL.md: core instructions exceed 200 lines; move details to references/")


def validate_references(errors: list[str]) -> None:
    pattern = re.compile(
        r"(?:\.\./\.offerloop-runtime/)?references/[A-Za-z0-9_./-]+\.md"
    )
    for path in text_files():
        if path == ROOT / "scripts/validate_skill.py":
            continue
        content = path.read_text(encoding="utf-8")
        for reference in pattern.findall(content):
            if reference.startswith("../.offerloop-runtime/"):
                runtime_reference = reference.removeprefix("../.offerloop-runtime/")
                installed_target = ROOT.parent / ".offerloop-runtime" / runtime_reference
                source_target = (
                    ROOT.parents[1]
                    / "runtime"
                    / "offerloop"
                    / "workspace"
                    / runtime_reference
                )
                target = (
                    installed_target if installed_target.is_file() else source_target
                )
            else:
                target = ROOT / reference
            if not target.is_file():
                errors.append(f"{path.relative_to(ROOT)}: missing reference {reference}")

    skill = (ROOT / "SKILL.md").read_text(encoding="utf-8")
    for script in re.findall(r"scripts/[A-Za-z0-9_./-]+\.py", skill):
        if not (ROOT / script).is_file():
            errors.append(f"SKILL.md: missing script {script}")


def validate_private_data(errors: list[str]) -> None:
    for path in text_files():
        if path == ROOT / "scripts/validate_skill.py":
            continue
        content = path.read_text(encoding="utf-8")
        for label, pattern in PRIVATE_PATTERNS.items():
            for match in pattern.finditer(content):
                line = content.count("\n", 0, match.start()) + 1
                errors.append(f"{path.relative_to(ROOT)}:{line}: {label}")


def validate_scope(errors: list[str]) -> None:
    removed = [
        ROOT / "references/login-platforms.md",
        ROOT / "references/platform-search.md",
        ROOT / "references/extract_jobs.md",
        ROOT / "references/lark-onboarding.md",
        ROOT / "references/feishu-setup.md",
        ROOT / "references/industries",
        ROOT / "scripts/get_token.py",
        ROOT / ".env.example",
    ]
    for path in removed:
        if path.is_dir():
            exists = any(path.rglob("*"))
        else:
            exists = path.exists()
        if exists:
            errors.append(f"{path.relative_to(ROOT)}: unsupported platform-search file exists")
    if (ROOT / "agents" / "openai.yaml").exists():
        errors.append("agents/openai.yaml: retired UI metadata must remain absent")
    skill = (ROOT / "SKILL.md").read_text(encoding="utf-8")
    if "定时任务" in skill or "无人值守" in skill:
        errors.append("SKILL.md: scheduling belongs to user-managed configuration")
    routing_markers = [
        "仅请求去外部平台或网上搜索岗位",
        "没有受支持的来源链接或已登记来源上下文时不触发",
    ]
    for marker in routing_markers:
        if marker not in skill:
            errors.append(f"SKILL.md: missing routing boundary {marker!r}")
    deletion_markers = ["先只读取得旧记录", "写入并回读验证", "target.delete_scoped"]
    for marker in deletion_markers:
        if marker not in skill:
            errors.append(f"SKILL.md: missing scoped replacement boundary {marker!r}")
    retry_markers = ["max_retries=3", "初次调用之外最多再"]
    for marker in retry_markers:
        if marker not in skill:
            errors.append(f"SKILL.md: missing retry boundary {marker!r}")


def validate_current_contract(errors: list[str]) -> None:
    """Reject legacy instructions that previously overrode the 13-field contract."""
    legacy_patterns = {
        "legacy numbered sort": re.compile(r"信息更新时间\s*desc\s*,\s*编号"),
        "legacy fixed view count": re.compile(r"48\s*个\s*grid|48/48|6/6.*已投递"),
        "legacy 22-column schema": re.compile(r"主表\s*22\s*列|飞书主表\s*22\s*列"),
        "legacy sequence allocation": re.compile(r"当前主表最大编号\s*\+\s*1|下一批起始编号"),
        "legacy missing-link confirmation": re.compile(
            r"两个链接都缺失(?:时)?(?:为|：)?\s*`?awaiting_write_confirmation`?|"
            r"两个链接都缺失时进入待确认写入"
        ),
    }
    for path in text_files():
        if path == ROOT / "scripts/validate_skill.py":
            continue
        content = path.read_text(encoding="utf-8")
        for label, pattern in legacy_patterns.items():
            match = pattern.search(content)
            if match:
                line = content.count("\n", 0, match.start()) + 1
                errors.append(f"{path.relative_to(ROOT)}:{line}: {label}")

    required_markers = {
        "references/tencent-smartsheet-source.md": [
            "只通过",
            "官方腾讯文档 MCP",
            "has_more=false",
            "scan_incremental_records()",
            "IncrementalCheckpoint",
            "scripts/tencent_mcporter.py probe",
            "--server tencent-docs",
            "不得通过在 `.config`、`.codex`、`.agents`",
        ],
        "references/init-workflow.md": [
            "不自行创建或补建另一套资源",
            "待确认批次数据",
            "excluded_job_preferences",
            "target.audit` → `mapping.propose",
        ],
        "references/excel-insert.md": ["普通同步只回读本轮", "转入初始化修复"],
        "references/personal-excel-source.md": [
            "13 字段契约",
            "每次只传一个 `--record-id`",
            "--filter-json",
            "--full-audit",
        ],
        "references/dedup_judge.md": [
            "同一规范公司、同一真实招聘批次",
            "已投递` 或 `已拒绝",
            "秋招专场",
            "去法定后缀后的名称",
        ],
        "references/prewrite-confirmation.md": [
            "hard_filtered",
            "auto_write",
            "awaiting_write_confirmation",
            "来源记录删除",
            "完整标准化字段",
            "逐来源开放保存的高水位",
            "CandidateRouteInputs",
            "同一岗位同时命中",
            "same_position_preference_conflict",
            "job_scope_complete=false",
            "auto_write_or_confirm",
            "record.normalize",
            "stable_keys",
            "第一次 finalize",
            "两个链接都缺失：直接 `hard_filtered`",
            "不计入待确认数量",
            "旧版规则创建的待确认批次",
            "recruitment_type_match()",
            "不得在来源适配器中写死排除词",
            "Summer Internship",
        ],
        "references/notification.md": [
            "群消息是持久化状态的展示投影",
            "待确认状态",
            "失败来源 N 个",
            "plan_confirmation_decision",
            "committable_sources",
            "to_source_json",
            "merge_source_json",
            "NotificationState",
            "内容哈希",
            "外发目的地的授权在同步开始前解决",
            "不得先执行五分钟同步",
            "scripts/notification_authorization.py check",
            "长期授权",
            "其他 Skill、其他群或其他消息类型",
        ],
        "references/failure-handling.md": [
            "初次调用失败后最多自动重试三次",
            "最多执行四次",
            "旧连接误判自愈",
            "废弃尚未成功发送的旧失败摘要",
        ],
    }
    for relative, markers in required_markers.items():
        content = (ROOT / relative).read_text(encoding="utf-8")
        for marker in markers:
            if marker not in content:
                errors.append(f"{relative}: missing recovery marker {marker!r}")


def main() -> int:
    errors: list[str] = []
    missing = sorted(path for path in REQUIRED_FILES if not (ROOT / path).is_file())
    errors.extend(f"missing required file: {path}" for path in missing)
    validate_frontmatter(errors)
    validate_references(errors)
    validate_private_data(errors)
    validate_scope(errors)
    validate_current_contract(errors)

    if errors:
        print("Skill validation failed:", file=sys.stderr)
        for error in errors:
            print(f"- {error}", file=sys.stderr)
        return 1
    print("Skill validation passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
