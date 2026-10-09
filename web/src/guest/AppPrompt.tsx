import { useState } from "react";
import "./download/download.css";

const APP_STORE_URL = "https://apps.apple.com/no/app/recapd/id6758083751";
const ANDROID_PACKAGE = "com.zaimimran.recapd";
const DISMISS_KEY = "recapd-app-prompt-dismissed";

type Platform = "ios" | "android";

function detectPlatform(): Platform | null {
	const ua = navigator.userAgent;
	if (/android/i.test(ua)) return "android";
	if (/iphone|ipad|ipod/i.test(ua)) return "ios";
	if (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) return "ios";
	return null;
}

function wasDismissed(): boolean {
	try {
		return sessionStorage.getItem(DISMISS_KEY) === "1";
	} catch {
		return false;
	}
}

function rememberDismissed() {
	try {
		sessionStorage.setItem(DISMISS_KEY, "1");
	} catch {}
}

function appUrl(platform: Platform, code: string): string {
	if (platform === "ios") return APP_STORE_URL;
	const fallback = encodeURIComponent(
		`https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`
	);
	return `intent://join/${code}#Intent;scheme=recapd;package=${ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`;
}

export default function AppPrompt({ code }: { code: string }) {
	const [platform] = useState(detectPlatform);
	const [open, setOpen] = useState(() => platform !== null && !wasDismissed());

	if (!open || !platform || platform === "android") return null;

	function continueInBrowser() {
		rememberDismissed();
		setOpen(false);
	}

	return (
		<div className="download-backdrop">
			<div
				className="download-sheet"
				role="dialog"
				aria-modal="true"
				aria-labelledby="app-prompt-title"
			>
				<h2 id="app-prompt-title" className="download-title">
					Get the Recapd app
				</h2>
				<p className="download-body">
					The app finds your photos from the event and shares them in one tap.
				</p>
				<a className="guest-button" href={appUrl(platform, code)} onClick={rememberDismissed}>
					Get the app
				</a>
				<button
					type="button"
					className="guest-button guest-button-quiet"
					onClick={continueInBrowser}
				>
					Continue in browser
				</button>
				{platform === "ios" && (
					<p className="guest-app-link">
						Have the app?{" "}
						<a href={`recapd://join/${code}`} onClick={rememberDismissed}>
							Open in Recapd
						</a>
					</p>
				)}
			</div>
		</div>
	);
}
