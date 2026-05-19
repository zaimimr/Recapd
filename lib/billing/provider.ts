import Constants from "expo-constants";
import { Platform } from "react-native";
import Purchases, {
	type CustomerInfo,
	LOG_LEVEL,
	type PurchasesOffering,
	type PurchasesPackage,
} from "react-native-purchases";
import { REVENUECAT_ANDROID_KEY, REVENUECAT_IOS_KEY, SUBSCRIPTIONS_ENABLED } from "./config";

export type PurchaseResult = {
	success: boolean;
	customerInfo?: CustomerInfo;
	error?: string;
	cancelled?: boolean;
};

function isExpoGo(): boolean {
	return Constants.executionEnvironment === "storeClient" || Constants.appOwnership === "expo";
}

let configured = false;

export function isConfigured(): boolean {
	return configured;
}

export async function configure(userId: string): Promise<boolean> {
	if (isExpoGo() || !SUBSCRIPTIONS_ENABLED) {
		return false;
	}
	const apiKey = Platform.OS === "ios" ? REVENUECAT_IOS_KEY : REVENUECAT_ANDROID_KEY;
	if (!apiKey) return false;

	if (!configured) {
		Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.WARN : LOG_LEVEL.ERROR);
		await Purchases.configure({ apiKey, appUserID: userId });
		configured = true;
		return true;
	}
	await Purchases.logIn(userId);
	return true;
}

export async function logOut(): Promise<void> {
	if (!configured) return;
	await Purchases.logOut();
}

export async function getOfferings(): Promise<PurchasesOffering | null> {
	if (!configured) return null;
	const offerings = await Purchases.getOfferings();
	return offerings.current;
}

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
	if (!configured) return null;
	return Purchases.getCustomerInfo();
}

export async function purchasePackage(
	pkg: PurchasesPackage,
	eventId?: string
): Promise<PurchaseResult> {
	if (!configured) {
		return { success: false, error: "Billing not configured" };
	}
	try {
		if (eventId) {
			await Purchases.setAttributes({ event_id: eventId });
		}
		const { customerInfo } = await Purchases.purchasePackage(pkg);
		return { success: true, customerInfo };
	} catch (err) {
		const e = err as { userCancelled?: boolean; message?: string };
		if (e.userCancelled) {
			return { success: false, cancelled: true };
		}
		return { success: false, error: e.message ?? "Purchase failed" };
	}
}

export async function restorePurchases(): Promise<PurchaseResult> {
	if (!configured) {
		return { success: false, error: "Billing not configured" };
	}
	try {
		const customerInfo = await Purchases.restorePurchases();
		return { success: true, customerInfo };
	} catch (err) {
		const e = err as { message?: string };
		return { success: false, error: e.message ?? "Restore failed" };
	}
}

export function addCustomerInfoListener(cb: (info: CustomerInfo) => void): () => void {
	if (!configured) return () => {};
	Purchases.addCustomerInfoUpdateListener(cb);
	return () => {
		Purchases.removeCustomerInfoUpdateListener(cb);
	};
}

export function getIsExpoGo(): boolean {
	return isExpoGo();
}
