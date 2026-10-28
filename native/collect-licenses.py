"""Collect notices from the exact Cargo dependency sources used by the host build."""
import json
import shutil
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parent
destination = Path(sys.argv[1])
destination.mkdir(parents=True, exist_ok=True)
version = subprocess.run(["rustc", "-vV"], check=True, capture_output=True, text=True).stdout
host = next(line.removeprefix("host: ") for line in version.splitlines() if line.startswith("host: "))
metadata = json.loads(subprocess.run(
    ["cargo", "metadata", "--manifest-path", str(root / "Cargo.toml"), "--format-version", "1", "--locked", "--filter-platform", host],
    check=True, capture_output=True, text=True,
).stdout)
active = {node["id"] for node in metadata["resolve"]["nodes"]}
credits = ["# Dependency notices", "", "Generated from Cargo.lock and the local Cargo registry sources.", "", "| Package | Version | License |", "| --- | --- | --- |"]
for package in sorted(metadata["packages"], key=lambda p: p["name"]):
    if package["id"] not in active or not package.get("source"):
        continue
    source = Path(package["manifest_path"]).parent
    target = destination / f'{package["name"]}-{package["version"]}'
    notices = [p for p in source.iterdir() if p.name.lower().startswith(("license", "copying", "notice", "copyright"))]
    if package.get("license_file"):
        license_file = source / package["license_file"]
        if license_file.exists() and license_file not in notices:
            notices.append(license_file)
    for notice in notices:
        target.mkdir(exist_ok=True)
        if notice.is_dir():
            shutil.copytree(notice, target / notice.name, dirs_exist_ok=True)
        else:
            shutil.copy2(notice, target / notice.name)
    credits.append(f'| {package["name"]} | {package["version"]} | {package.get("license") or "See bundled notice"} |')
(destination / "CREDITS.md").write_text("\n".join(credits) + "\n")
