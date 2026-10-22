#!/usr/bin/env bash
set -e

EXT_UUID="yo@quackhack-mcblindy.com"
EXT_DIR="$HOME/.local/share/gnome-shell/extensions/$EXT_UUID"

mkdir -p "$HOME/.local/share/gnome-shell/extensions"
mv "$EXT_UUID" "$EXT_DIR"
echo "Done. You should restart Gnome Shell by logging out and back in, and enable the extension with `gnome-extensions enable yo@quackhack-mcblindy.com`"
