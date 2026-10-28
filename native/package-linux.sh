#!/usr/bin/env bash
set -euo pipefail
native_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
if [[ "$(uname -s)" != Linux ]]; then
  echo 'This script packages Linux builds. Use cargo build --release on other platforms.' >&2
  exit 1
fi
cargo build --manifest-path "$native_root/Cargo.toml" --release --locked
package_name="verse-together-native-linux-$(uname -m)"
stage="$native_root/dist/$package_name"
mkdir -p "$stage/licenses"
install -m 755 "$native_root/target/release/verse-together-native" "$stage/verse-together"
install -m 755 "$native_root/install-desktop.sh" "$stage/install-desktop.sh"
cp "$native_root/../public/brand/icons/light/icon-512.png" "$stage/icon.png"
cp "$native_root/README.md" "$stage/README.md"
cp "$native_root/assets/licenses/"* "$stage/licenses/"
python3 "$native_root/collect-licenses.py" "$stage/licenses/dependencies"
if [[ -f "$native_root/VERIFICATION.md" ]]; then cp "$native_root/VERIFICATION.md" "$stage/VERIFICATION.md"; fi
if [[ -f "$native_root/PARITY.md" ]]; then cp "$native_root/PARITY.md" "$stage/PARITY.md"; fi
tar -C "$native_root/dist" -czf "$native_root/dist/$package_name.tar.gz" "$package_name"
(
  cd "$native_root/dist"
  sha256sum "$package_name.tar.gz" > "$package_name.tar.gz.sha256"
)
printf 'Package: %s\n' "$native_root/dist/$package_name.tar.gz"
