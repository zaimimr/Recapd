#!/usr/bin/env bash
# Pushes the secrets the release workflow needs into GitHub.
#
#   ./scripts/ci/setup-release-secrets.sh            # everything it can find
#   ./scripts/ci/setup-release-secrets.sh ios        # just the Apple side
#   ./scripts/ci/setup-release-secrets.sh android    # just the Google side
#   SENTRY_AUTH_TOKEN=... ./scripts/ci/setup-release-secrets.sh sentry
#
# Reads the app config from .env and the signing material from credentials.json,
# which is what `eas credentials -> Download credentials from EAS to
# credentials.json` writes. Nothing is printed back. See docs/RELEASE_CI.md.

set -euo pipefail

cd "$(dirname "$0")/../.."

WHAT="${1:-all}"

fail() {
	echo "error: $*" >&2
	exit 1
}

command -v gh >/dev/null || fail "gh is not installed"
gh auth status >/dev/null 2>&1 || fail "run: gh auth login"
[ -f credentials.json ] || fail "no credentials.json, see docs/RELEASE_CI.md"

cred() {
	node -e "
		const c = require('./credentials.json');
		const v = '$1'.split('.').reduce((o, k) => (o ?? {})[k], c);
		process.stdout.write(v == null ? '' : String(v));
	"
}

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

if [ "$WHAT" = "all" ] || [ "$WHAT" = "app" ]; then
	echo "App config from .env"
	[ -f .env ] || fail "no .env in the project root"
	# shellcheck disable=SC1091
	set -a && . ./.env && set +a
	for var in EXPO_PUBLIC_SUPABASE_URL EXPO_PUBLIC_SUPABASE_ANON_KEY \
		EXPO_PUBLIC_REVENUECAT_IOS_KEY EXPO_PUBLIC_REVENUECAT_ANDROID_KEY; do
		set_secret "$var" "${!var:-}"
	done
fi

if [ "$WHAT" = "all" ] || [ "$WHAT" = "sentry" ]; then
	echo "Sentry"
	if [ -n "${SENTRY_AUTH_TOKEN:-}" ]; then
		set_secret SENTRY_AUTH_TOKEN "$SENTRY_AUTH_TOKEN"
	else
		echo "  skipped: export SENTRY_AUTH_TOKEN first (create one at"
		echo "  https://zaim-imran.sentry.io/settings/auth-tokens/ with project:releases + org:read)"
	fi
fi

if [ "$WHAT" = "all" ] || [ "$WHAT" = "ios" ]; then
	echo "Apple"
	p12_path="$(cred ios.distributionCertificate.path)"
	p12_password="$(cred ios.distributionCertificate.password)"
	profile_path="$(cred ios.provisioningProfilePath)"
	[ -n "$p12_path" ] || fail "credentials.json has no ios.distributionCertificate.path"

	set_secret_file IOS_DIST_P12_BASE64 "$p12_path"
	set_secret IOS_DIST_P12_PASSWORD "$p12_password"
	set_secret_file IOS_PROVISIONING_PROFILE_BASE64 "$profile_path"

	asc_key_path="${ASC_KEY_PATH:-$HOME/Downloads/AuthKey_734B75F2PY.p8}"
	set_secret_file ASC_KEY_P8 "$asc_key_path"

	profile_name="$(security cms -D -i "$profile_path" | plutil -extract Name raw -)"
	gh variable set IOS_PROVISIONING_PROFILE_NAME --body "$profile_name"
	echo "  set IOS_PROVISIONING_PROFILE_NAME=$profile_name"
fi

if [ "$WHAT" = "all" ] || [ "$WHAT" = "android" ]; then
	echo "Google"
	set_secret_file PLAY_SERVICE_ACCOUNT_JSON credentials/android/serviceAccountKey.json

	keystore_path="$(cred android.keystore.keystorePath)"
	[ -n "$keystore_path" ] || fail \
		"credentials.json has no android section. Run: npx eas-cli@24 credentials --platform android, then 'Download credentials from EAS to credentials.json'"

	set_secret_file ANDROID_KEYSTORE_BASE64 "$keystore_path"
	set_secret ANDROID_KEYSTORE_PASSWORD "$(cred android.keystore.keystorePassword)"
	set_secret ANDROID_KEY_ALIAS "$(cred android.keystore.keyAlias)"
	set_secret ANDROID_KEY_PASSWORD "$(cred android.keystore.keyPassword)"
fi

echo
echo "Done. The jobs are still off. Try one by hand first:"
echo "  gh workflow run release.yml -f platform=android"
echo "Then, when you trust it:"
echo "  gh variable set ENABLE_ANDROID_RELEASE --body true"
echo "  gh variable set ENABLE_IOS_RELEASE --body true"
