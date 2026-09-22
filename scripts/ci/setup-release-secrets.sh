#!/usr/bin/env bash
# Pushes every secret the release workflow needs into GitHub.
#
#   ./scripts/ci/setup-release-secrets.sh
#
# Reads what it can from the local .env and credentials/, and prompts for the
# rest. Nothing is echoed back. Run it after exporting the signing material,
# see docs/RELEASE_CI.md.

set -euo pipefail

cd "$(dirname "$0")/../.."

fail() {
	echo "error: $*" >&2
	exit 1
}

command -v gh >/dev/null || fail "gh is not installed"
gh auth status >/dev/null 2>&1 || fail "run: gh auth login"

set_secret() {
	local name="$1" value="$2"
	[ -n "$value" ] || fail "$name is empty"
	printf '%s' "$value" | gh secret set "$name"
	echo "  set $name"
}

set_secret_file() {
	local name="$1" path="$2"
	[ -f "$path" ] || fail "$name: no file at $path"
	base64 -i "$path" | tr -d '\n' | gh secret set "$name"
	echo "  set $name (from $path)"
}

echo "App config from .env"
[ -f .env ] || fail "no .env in the project root"
# shellcheck disable=SC1091
set -a && . ./.env && set +a
for var in EXPO_PUBLIC_SUPABASE_URL EXPO_PUBLIC_SUPABASE_ANON_KEY \
	EXPO_PUBLIC_REVENUECAT_IOS_KEY EXPO_PUBLIC_REVENUECAT_ANDROID_KEY; do
	set_secret "$var" "${!var:-}"
done

echo "Google Play"
set_secret_file PLAY_SERVICE_ACCOUNT_JSON credentials/android/serviceAccountKey.json

echo "Android signing"
KEYSTORE_PATH="${KEYSTORE_PATH:-credentials/android/upload.jks}"
set_secret_file ANDROID_KEYSTORE_BASE64 "$KEYSTORE_PATH"
read -rsp "  keystore password: " keystore_password && echo
read -rp "  key alias: " key_alias
read -rsp "  key password: " key_password && echo
set_secret ANDROID_KEYSTORE_PASSWORD "$keystore_password"
set_secret ANDROID_KEY_ALIAS "$key_alias"
set_secret ANDROID_KEY_PASSWORD "$key_password"

echo "Apple"
ASC_KEY_PATH="${ASC_KEY_PATH:-$HOME/Downloads/AuthKey_734B75F2PY.p8}"
set_secret_file ASC_KEY_P8 "$ASC_KEY_PATH"

P12_PATH="${P12_PATH:-credentials/ios/distribution.p12}"
PROFILE_PATH="${PROFILE_PATH:-credentials/ios/recapd-appstore.mobileprovision}"
set_secret_file IOS_DIST_P12_BASE64 "$P12_PATH"
set_secret_file IOS_PROVISIONING_PROFILE_BASE64 "$PROFILE_PATH"
read -rsp "  .p12 password: " p12_password && echo
set_secret IOS_DIST_P12_PASSWORD "$p12_password"

profile_name="$(security cms -D -i "$PROFILE_PATH" | plutil -extract Name raw -)"
gh variable set IOS_PROVISIONING_PROFILE_NAME --body "$profile_name"
echo "  set IOS_PROVISIONING_PROFILE_NAME=$profile_name"

echo
echo "Done. The jobs are still off. Turn them on when you are ready:"
echo "  gh variable set ENABLE_ANDROID_RELEASE --body true"
echo "  gh variable set ENABLE_IOS_RELEASE --body true"
echo "Or run one by hand: gh workflow run release.yml -f platform=android"
