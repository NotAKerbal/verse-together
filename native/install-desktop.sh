#!/usr/bin/env bash
# Optional, per-user installation. No sudo, services or autostart entries.
set -euo pipefail
package_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
data_root="${XDG_DATA_HOME:-$HOME/.local/share}"
app_dir="$data_root/verse-together-native-app"
icon_dir="$data_root/icons/hicolor/512x512/apps"
mkdir -p "$app_dir" "$icon_dir" "$data_root/applications"
install -m 755 "$package_dir/verse-together" "$app_dir/verse-together"
install -m 644 "$package_dir/icon.png" "$icon_dir/app.versetogether.native.png"
cat > "$data_root/applications/app.versetogether.native.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Verse Together
Comment=Read, search and study scripture offline
Exec="$app_dir/verse-together"
Icon=app.versetogether.native
Terminal=false
Categories=Education;
StartupWMClass=app.versetogether.native
DESKTOP
printf 'Installed for this user. Launch Verse Together from your application menu.\n'
