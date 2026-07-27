#!/usr/bin/env python3
"""Install the OfferLoop Agent add-on into one existing workbench app."""

from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
import shutil
import tempfile
from pathlib import Path


SKILL_ROOT = Path(__file__).resolve().parents[1]
ADDON_ROOT = SKILL_ROOT / "assets" / "workbench-addon"
WORKER_ROOT = SKILL_ROOT / "assets" / "agent-worker"
WORKBENCH_TEMPLATE_ROOT = (
    SKILL_ROOT.parent
    / "offerloop-workbench"
    / "assets"
    / "workbench-template"
)


class MaterializeError(RuntimeError):
    """Raised when the target is not a compatible OfferLoop workbench."""


def _read(path: Path) -> str:
    if not path.is_file():
        raise MaterializeError(f"missing required workbench file: {path.name}")
    return path.read_text(encoding="utf-8")


def _replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if text.count(old) != 1:
        raise MaterializeError(f"unable to patch {label}; target template differs")
    return text.replace(old, new, 1)


def _validate_destination(
    workbench_dir: Path,
    expected_app_id: str,
) -> str:
    if not workbench_dir.is_dir():
        raise MaterializeError(
            "destination must be an existing Miaoda project directory"
        )
    package_json = workbench_dir / "package.json"
    if not package_json.is_file():
        raise MaterializeError("destination is not a Miaoda workbench app")
    binding = workbench_dir / ".spark" / "meta.json"
    try:
        metadata = json.loads(binding.read_text(encoding="utf-8"))
    except FileNotFoundError as error:
        raise MaterializeError(
            "destination is not bound to a Miaoda app; missing .spark/meta.json"
        ) from error
    except (OSError, json.JSONDecodeError) as error:
        raise MaterializeError("destination Miaoda binding is invalid") from error
    app_id = str(metadata.get("app_id", "")).strip()
    if not app_id:
        raise MaterializeError("destination Miaoda binding has no app_id")
    if not expected_app_id:
        raise MaterializeError("expected App ID is required")
    if app_id != expected_app_id:
        raise MaterializeError(
            "destination App ID does not match the expected existing workbench"
        )
    return app_id


def _require_known_baseline(target: Path, baseline_relative: Path) -> str:
    target_text = _read(target)
    baseline = WORKBENCH_TEMPLATE_ROOT / baseline_relative
    if not baseline.is_file():
        raise MaterializeError(
            "offerloop-workbench baseline is unavailable; install that Skill first"
        )
    if target_text != baseline.read_text(encoding="utf-8"):
        raise MaterializeError(
            f"refusing to overwrite modified {baseline_relative}; "
            "reconcile the local changes before adding Agent"
        )
    return target_text


def _integration_state(text: str, markers: tuple[str, ...], label: str) -> bool:
    present = [marker in text for marker in markers]
    if any(present) and not all(present):
        raise MaterializeError(f"incomplete Agent integration in {label}")
    return all(present)


def _integrated_sources(workbench_dir: Path) -> dict[Path, str]:
    app_module = workbench_dir / "server" / "app.module.ts"
    layout = workbench_dir / "client" / "src" / "components" / "Layout.tsx"
    page = (
        workbench_dir
        / "client"
        / "src"
        / "pages"
        / "workbench"
        / "WorkbenchPage.tsx"
    )

    app_text = _read(app_module)
    app_integrated = _integration_state(
        app_text,
        (
            "import { AgentChatModule }",
            "    AgentChatModule,\n",
        ),
        "server/app.module.ts",
    )
    if not app_integrated:
        app_text = _require_known_baseline(
            app_module,
            Path("server/app.module.ts"),
        )
        app_text = _replace_once(
            app_text,
            "import { WorkbenchModule } from './modules/workbench/workbench.module';",
            "import { AgentChatModule } from './modules/agent-chat/agent-chat.module';\n"
            "import { WorkbenchModule } from './modules/workbench/workbench.module';",
            "server/app.module.ts import",
        )
        app_text = _replace_once(
            app_text,
            "    WorkbenchModule,\n",
            "    WorkbenchModule,\n    AgentChatModule,\n",
            "server/app.module.ts modules",
        )

    layout_text = _read(layout)
    layout_integrated = _integration_state(
        layout_text,
        (
            "AgentLayoutContext",
            "AgentChatPanel",
            "<Outlet context={context}",
        ),
        "client/src/components/Layout.tsx",
    )
    if not layout_integrated:
        _require_known_baseline(
            layout,
            Path("client/src/components/Layout.tsx"),
        )
        layout_text = _read(ADDON_ROOT / "integration" / "Layout.tsx")

    page_text = _read(page)
    page_integrated = _integration_state(
        page_text,
        (
            "AgentLayoutContext",
            "useOutletContext<AgentLayoutContext>()",
            "onClick={openAgent}",
        ),
        "client/src/pages/workbench/WorkbenchPage.tsx",
    )
    if not page_integrated:
        page_text = _require_known_baseline(
            page,
            Path("client/src/pages/workbench/WorkbenchPage.tsx"),
        )
        page_text = _replace_once(
            page_text,
            "  RefreshCw,\n",
            "  PanelRightOpen,\n  RefreshCw,\n",
            "WorkbenchPage.tsx icon import",
        )
        page_text = _replace_once(
            page_text,
            "} from 'lucide-react';\n",
            "} from 'lucide-react';\n"
            "import { useOutletContext } from 'react-router-dom';\n",
            "WorkbenchPage.tsx router import",
        )
        page_text = _replace_once(
            page_text,
            "} from '@shared/api.interface';\n",
            "} from '@shared/api.interface';\n\n"
            "import type { AgentLayoutContext } from '@client/src/components/Layout';\n",
            "WorkbenchPage.tsx layout type",
        )
        page_text = _replace_once(
            page_text,
            "  const state: WorkbenchDataState = useWorkbenchData();\n",
            "  const state: WorkbenchDataState = useWorkbenchData();\n"
            "  const { agentOpen, openAgent } = useOutletContext<AgentLayoutContext>();\n",
            "WorkbenchPage.tsx layout context",
        )
        page_text = _replace_once(
            page_text,
            '          <Button\n            variant="outline"\n'
            "            onClick={() => {\n",
            "          {!agentOpen ? (\n"
            '            <Button variant="default" onClick={openAgent}>\n'
            "              <PanelRightOpen />\n"
            "              智能助手\n"
            "            </Button>\n"
            "          ) : null}\n"
            '          <Button\n            variant="outline"\n'
            "            onClick={() => {\n",
            "WorkbenchPage.tsx Agent trigger",
        )

    return {app_module: app_text, layout: layout_text, page: page_text}


def _atomic_copy(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        dir=target.parent,
        prefix=f".{target.name}.",
        delete=False,
    ) as handle:
        temporary = Path(handle.name)
    try:
        shutil.copy2(source, temporary)
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


def _atomic_write(target: Path, content: str) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        dir=target.parent,
        prefix=f".{target.name}.",
        mode="w",
        encoding="utf-8",
        delete=False,
    ) as handle:
        handle.write(content)
        temporary = Path(handle.name)
    try:
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


def _backup_integration_files(
    workbench_dir: Path,
    targets: list[Path],
) -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    backup_root = (
        workbench_dir.parent
        / ".offerloop-backups"
        / f"{workbench_dir.name}-agent-integration-{stamp}"
    )
    for target in targets:
        relative = target.relative_to(workbench_dir)
        backup = backup_root / relative
        backup.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(target, backup)
    return backup_root


def _addon_files() -> list[tuple[Path, Path]]:
    files: list[tuple[Path, Path]] = []
    for source in ADDON_ROOT.rglob("*"):
        if not source.is_file() or "integration" in source.parts:
            continue
        files.append((source, source.relative_to(ADDON_ROOT)))
    return sorted(files, key=lambda item: str(item[1]))


def materialize(
    workbench_dir: Path,
    worker_dir: Path | None = None,
    *,
    apply: bool = False,
    expected_app_id: str,
) -> dict[str, object]:
    workbench_dir = workbench_dir.resolve()
    _validate_destination(workbench_dir, expected_app_id)

    integrated = _integrated_sources(workbench_dir)
    changes: list[str] = []
    pending_copies: list[tuple[Path, Path]] = []
    for source, relative in _addon_files():
        target = workbench_dir / relative
        if not target.is_file() or target.read_bytes() != source.read_bytes():
            changes.append(str(relative))
            pending_copies.append((source, target))

    pending_writes: list[tuple[Path, str]] = []
    for target, content in integrated.items():
        if target.read_text(encoding="utf-8") != content:
            changes.append(str(target.relative_to(workbench_dir)))
            pending_writes.append((target, content))

    worker_changes: list[str] = []
    pending_worker_copies: list[tuple[Path, Path]] = []
    if worker_dir is not None:
        worker_dir = worker_dir.resolve()
        for source in sorted(WORKER_ROOT.rglob("*")):
            if not source.is_file():
                continue
            relative = source.relative_to(WORKER_ROOT)
            target = worker_dir / relative
            if target.name == ".env.local":
                continue
            if not target.is_file() or target.read_bytes() != source.read_bytes():
                worker_changes.append(str(relative))
                pending_worker_copies.append((source, target))

    backup_dir: Path | None = None
    if apply:
        if pending_writes:
            backup_dir = _backup_integration_files(
                workbench_dir,
                [target for target, _ in pending_writes],
            )
        for source, target in pending_copies:
            _atomic_copy(source, target)
        for target, content in pending_writes:
            _atomic_write(target, content)
        for source, target in pending_worker_copies:
            _atomic_copy(source, target)

    return {
        "applied": apply,
        "binding_verified": True,
        "backup_dir": str(backup_dir) if backup_dir else None,
        "creates_second_miaoda_app": False,
        "workbench_dir": str(workbench_dir),
        "workbench_changes": changes,
        "worker_dir": str(worker_dir) if worker_dir else None,
        "worker_changes": worker_changes,
        "next_steps": [
            "push and publish the existing workbench app",
            "create a two-route OpenAPI key for the same workbench App ID",
            "start the local Codex worker",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workbench-dir", type=Path, required=True)
    parser.add_argument("--worker-dir", type=Path)
    parser.add_argument(
        "--expected-app-id",
        required=True,
        help="App ID already recorded for the existing OfferLoop workbench",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="write changes; without this flag the command is a dry run",
    )
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    result = materialize(
        args.workbench_dir,
        args.worker_dir,
        apply=args.apply,
        expected_app_id=args.expected_app_id,
    )
    if args.json:
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        mode = "applied" if result["applied"] else "dry-run"
        print(f"OfferLoop Agent add-on {mode}: {len(result['workbench_changes'])} changes")


if __name__ == "__main__":
    main()
