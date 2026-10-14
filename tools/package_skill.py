"""Build a deterministic, installable skill ZIP without local runtime state."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile, ZipInfo

EXCLUDED_DIRS = {"node_modules", ".venv", "__pycache__", ".git", "productions", "outputs", "validation"}
EXCLUDED_NAMES = {"runtime.local.json", ".DS_Store", "Thumbs.db"}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True, help="Output directory outside the skill")
    args = parser.parse_args()
    repo = Path(__file__).resolve().parent.parent
    source = repo / "skills" / "constitutional-classroom-pptx"
    output = args.output.resolve()
    if output == source or source in output.parents:
        parser.error("Output must be outside the skill")
    version = json.loads((source / "package.json").read_text(encoding="utf-8"))["version"]
    output.mkdir(parents=True, exist_ok=True)
    target = output / f"课程pptskill-v{version}.zip"
    files = []
    for file in sorted(source.rglob("*")):
        rel = file.relative_to(source)
        if file.is_symlink() or any(part in EXCLUDED_DIRS for part in rel.parts):
            continue
        if not file.is_file() or file.name in EXCLUDED_NAMES or file.suffix in {".pyc", ".pyo", ".log"}:
            continue
        if file.name.startswith(".env") and file.name != ".env.example":
            continue
        if file.suffix.lower() in {".pptx", ".zip"}:
            raise RuntimeError(f"Unexpected course artifact or nested archive: {rel}")
        files.append((file, rel.as_posix()))
    manifest = {"skill": source.name, "version": version, "files": []}
    with ZipFile(target, "w", compression=ZIP_DEFLATED, compresslevel=9) as archive:
        def add(name: str, data: bytes) -> None:
            info = ZipInfo(f"{source.name}/{name}", date_time=(1980, 1, 1, 0, 0, 0))
            info.compress_type = ZIP_DEFLATED
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data, compresslevel=9)
        for file, relative in files:
            data = file.read_bytes()
            add(relative, data)
            manifest["files"].append({"path": relative, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)})
        add("PACKAGE_MANIFEST.json", (json.dumps(manifest, ensure_ascii=False, indent=2)+"\n").encode("utf-8"))
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    target.with_suffix(".zip.sha256").write_text(f"{digest}  {target.name}\n", encoding="utf-8")
    print(json.dumps({"file": str(target), "sha256": digest, "files": len(files), "bytes": target.stat().st_size}, ensure_ascii=False))


if __name__ == "__main__":
    main()
