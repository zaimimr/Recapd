import PostHog from "posthog-react-native";

const POSTHOG_KEY =
	process.env.EXPO_PUBLIC_POSTHOG_KEY ?? "phc_D8c5745dsWj3iDsNj8M56fho7B2RiYERTRLBEGv4UyL9";
const POSTHOG_HOST = "https://eu.i.posthog.com";

type Props = Record<string, string | number | boolean | null>;

let client: PostHog | null = null;

function getClient(): PostHog | null {
	if (client || process.env.NODE_ENV === "test") return client;
	try {
		client = new PostHog(POSTHOG_KEY, {
			host: POSTHOG_HOST,
			captureAppLifecycleEvents: true,
		});
	} catch {
		client = null;
	}
	return client;
}

export function track(event: string, properties?: Props): void {
	getClient()?.capture(event, properties);
}

export function trackScreen(route: string): void {
	getClient()?.screen(route);
}

export function identifyUser(userId: string | null): void {
	const posthog = getClient();
	if (!posthog) return;
	if (userId) {
		posthog.identify(userId);
	} else {
		posthog.reset();
	}
}
