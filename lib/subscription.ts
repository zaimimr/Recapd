import Constants from "expo-constants";
import { Platform } from "react-native";
import Purchases, {
	type CustomerInfo,
	LOG_LEVEL,
	PURCHASES_ERROR_CODE,
	type PurchasesEntitlementInfo,
	type PurchasesOffering,
	type PurchasesPackage,
} from "react-native-purchases";
import RevenueCatUI, { PAYWALL_RESULT } from "react-native-purchases-ui";
import { supabase } from "./supabase";

const isExpoGo = Constants.appOwnership === "expo";

const REVENUECAT_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || "";
const REVENUECAT_ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || "";
const REVENUECAT_API_KEY = Platform.OS === "ios" ? REVENUECAT_IOS_KEY : REVENUECAT_ANDROID_KEY;
const ENTITLEMENT_ID = "Recapd Pro";

export const SUBSCRIPTIONS_ENABLED = process.env.EXPO_PUBLIC_SUBSCRIPTIONS_ENABLED !== "false";

export const PRODUCT_IDS = {
	MONTHLY: "monthly",
	YEARLY: "yearly",
	EVENT_PRO: "recapd_event_pro",
} as const;

export type ProductId = (typeof PRODUCT_IDS)[keyof typeof PRODUCT_IDS];

export function isEventProProduct(productIdentifier: string): boolean {
	return productIdentifier === PRODUCT_IDS.EVENT_PRO;
}

let isConfigured = false;
let currentUserId: string | null = null;

export async function configureRevenueCat(userId: string): Promise<boolean> {
	if (!SUBSCRIPTIONS_ENABLED) {
		console.warn("Subscriptions are disabled");
		return false;
	}
	if (isExpoGo) {
		console.warn("RevenueCat requires a development build — skipping in Expo Go");
		return false;
	}
	if (isConfigured && currentUserId === userId) return true;

	try {
		if (__DEV__) {
			Purchases.setLogLevel(LOG_LEVEL.DEBUG);
		}

		await Purchases.configure({
			apiKey: REVENUECAT_API_KEY,
			appUserID: userId,
		});

		isConfigured = true;
		currentUserId = userId;

		console.log("RevenueCat configured successfully for user:", userId);
		return true;
	} catch (error) {
		console.error("Failed to configure RevenueCat:", error);
		return false;
	}
}

export function isRevenueCatConfigured(): boolean {
	return isConfigured;
}

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
	if (!isConfigured) {
		console.warn("RevenueCat not configured");
		return null;
	}

	try {
		return await Purchases.getCustomerInfo();
	} catch (error) {
		console.error("Failed to get customer info:", error);
		return null;
	}
}

export async function getOfferings(): Promise<PurchasesOffering | null> {
	if (!isConfigured) {
		console.warn("RevenueCat not configured");
		return null;
	}

	try {
		const offerings = await Purchases.getOfferings();
		return offerings.current;
	} catch (error) {
		console.error("Failed to get offerings:", error);
		return null;
	}
}

export async function getAllOfferings(): Promise<{
	[key: string]: PurchasesOffering;
} | null> {
	if (!isConfigured) return null;

	try {
		const offerings = await Purchases.getOfferings();
		return offerings.all;
	} catch (error) {
		console.error("Failed to get all offerings:", error);
		return null;
	}
}

export interface PurchaseResult {
	success: boolean;
	customerInfo?: CustomerInfo;
	error?: string;
	errorCode?: PURCHASES_ERROR_CODE;
	userCancelled?: boolean;
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<PurchaseResult> {
	if (!isConfigured) {
		return { success: false, error: "RevenueCat not configured" };
	}

	try {
		const { customerInfo } = await Purchases.purchasePackage(pkg);
		return { success: true, customerInfo };
	} catch (error: any) {
		if (error.userCancelled) {
			return {
				success: false,
				error: "Purchase cancelled",
				userCancelled: true,
			};
		}

		const errorCode = error.code as PURCHASES_ERROR_CODE;
		let errorMessage = "Purchase failed";

		switch (errorCode) {
			case PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR:
				errorMessage = "Purchases are not allowed on this device";
				break;
			case PURCHASES_ERROR_CODE.PURCHASE_INVALID_ERROR:
				errorMessage = "Invalid purchase";
				break;
			case PURCHASES_ERROR_CODE.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR:
				errorMessage = "Product not available for purchase";
				break;
			case PURCHASES_ERROR_CODE.NETWORK_ERROR:
				errorMessage = "Network error. Please check your connection";
				break;
			case PURCHASES_ERROR_CODE.RECEIPT_ALREADY_IN_USE_ERROR:
				errorMessage = "This purchase is already associated with another account";
				break;
			default:
				errorMessage = error.message || "Purchase failed";
		}

		console.error("Purchase failed:", error);
		return { success: false, error: errorMessage, errorCode };
	}
}

export async function purchaseProduct(productId: ProductId): Promise<PurchaseResult> {
	const offering = await getOfferings();
	if (!offering) {
		return { success: false, error: "No offerings available" };
	}

	const pkg = offering.availablePackages.find((p) => p.product.identifier === productId);

	if (!pkg) {
		return { success: false, error: `Product ${productId} not found` };
	}

	return purchasePackage(pkg);
}

export async function restorePurchases(): Promise<PurchaseResult> {
	if (!isConfigured) {
		return { success: false, error: "RevenueCat not configured" };
	}

	try {
		const customerInfo = await Purchases.restorePurchases();
		const hasProAccess = checkProEntitlement(customerInfo);
		const hasActiveSubscriptions = customerInfo.activeSubscriptions.length > 0;

		if (hasProAccess || hasActiveSubscriptions) {
			return { success: true, customerInfo };
		} else {
			return {
				success: false,
				customerInfo,
				error: "No active subscriptions found",
			};
		}
	} catch (error: any) {
		if (error.userCancelled) {
			return {
				success: false,
				error: "Restore cancelled",
				userCancelled: true,
			};
		}
		console.warn("Restore failed:", error);
		return { success: false, error: error.message || "Restore failed" };
	}
}

export function checkProEntitlement(customerInfo: CustomerInfo): boolean {
	if (__DEV__) {
		console.log("Active entitlements:", Object.keys(customerInfo.entitlements.active));
		console.log("Active subscriptions:", customerInfo.activeSubscriptions);
	}
	const entitlement = customerInfo.entitlements.active[ENTITLEMENT_ID];
	return entitlement?.isActive === true;
}

export function getProEntitlement(customerInfo: CustomerInfo): PurchasesEntitlementInfo | null {
	return customerInfo.entitlements.active[ENTITLEMENT_ID] || null;
}

export function getSubscriptionExpirationDate(customerInfo: CustomerInfo): Date | null {
	const entitlement = getProEntitlement(customerInfo);
	if (!entitlement?.expirationDate) return null;
	return new Date(entitlement.expirationDate);
}

export function getSubscriptionStatus(customerInfo: CustomerInfo): {
	isActive: boolean;
	expiresAt: Date | null;
	productId: string | null;
	willRenew: boolean;
} {
	const entitlement = getProEntitlement(customerInfo);

	if (!entitlement) {
		return {
			isActive: false,
			expiresAt: null,
			productId: null,
			willRenew: false,
		};
	}

	return {
		isActive: entitlement.isActive,
		expiresAt: entitlement.expirationDate ? new Date(entitlement.expirationDate) : null,
		productId: entitlement.productIdentifier,
		willRenew: entitlement.willRenew,
	};
}

export async function unlockProForEvent(
	eventId: string,
	userId: string,
	transactionId?: string
): Promise<boolean> {
	const platform = Platform.OS === "ios" ? "ios" : "android";

	const { error } = await supabase.from("event_pro_unlocks").upsert(
		{
			event_id: eventId,
			user_id: userId,
			purchased_at: new Date().toISOString(),
			platform,
			transaction_id: transactionId ?? null,
		},
		{ onConflict: "event_id,user_id" }
	);

	if (error) {
		console.error("Failed to record event pro unlock:", error);
		return false;
	}
	return true;
}

export async function hasProForEvent(eventId: string, userId: string): Promise<boolean> {
	const { data: userData } = await supabase
		.from("users")
		.select("subscription_tier, subscription_expires_at")
		.eq("id", userId)
		.maybeSingle();

	if (userData?.subscription_tier === "pro") {
		if (!userData.subscription_expires_at) return true;
		if (new Date(userData.subscription_expires_at).getTime() > Date.now()) return true;
	}

	const { data: unlock } = await supabase
		.from("event_pro_unlocks")
		.select("id")
		.eq("event_id", eventId)
		.eq("user_id", userId)
		.maybeSingle();

	return !!unlock;
}

export async function purchaseEventProUnlock(
	eventId: string,
	userId: string,
	pkg: PurchasesPackage
): Promise<PurchaseResult> {
	if (!isEventProProduct(pkg.product.identifier)) {
		return {
			success: false,
			error: "Package is not an event pro unlock product",
		};
	}

	const result = await purchasePackage(pkg);

	if (result.success) {
		const transactionId =
			result.customerInfo?.nonSubscriptionTransactions?.find(
				(t) => t.productIdentifier === pkg.product.identifier
			)?.transactionIdentifier ?? undefined;

		const recorded = await unlockProForEvent(eventId, userId, transactionId);
		if (!recorded) {
			console.warn("Purchase succeeded but failed to record event pro unlock");
		}
	}

	return result;
}

export async function syncSubscriptionToDatabase(
	userId: string,
	customerInfo: CustomerInfo
): Promise<void> {
	const status = getSubscriptionStatus(customerInfo);
	const platform = Platform.OS === "ios" ? "ios" : "android";

	const isFromRecurringProduct =
		status.isActive &&
		status.productId !== null &&
		!isEventProProduct(status.productId) &&
		customerInfo.activeSubscriptions.length > 0;

	try {
		const { error } = await supabase
			.from("users")
			.update({
				subscription_tier: isFromRecurringProduct ? "pro" : "free",
				subscription_expires_at: isFromRecurringProduct
					? (status.expiresAt?.toISOString() ?? null)
					: null,
				subscription_platform: isFromRecurringProduct ? platform : null,
				subscription_id: customerInfo.originalAppUserId,
			})
			.eq("id", userId);
		if (error) {
			console.error("Failed to sync subscription to database:", error);
		}
	} catch (error) {
		console.error("Failed to sync subscription to database:", error);
	}
}

export function setupCustomerInfoListener(
	onUpdate: (customerInfo: CustomerInfo) => void
): () => void {
	if (!isConfigured) return () => {};

	Purchases.addCustomerInfoUpdateListener(onUpdate);

	return () => {
		Purchases.removeCustomerInfoUpdateListener(onUpdate);
	};
}

async function waitForProEntitlement(): Promise<CustomerInfo | null> {
	const info = await getCustomerInfo();
	if (info && checkProEntitlement(info)) return info;

	await new Promise((resolve) => setTimeout(resolve, 1500));
	const retryInfo = await getCustomerInfo();
	if (retryInfo && checkProEntitlement(retryInfo)) return retryInfo;

	return retryInfo;
}

export async function presentPaywall(): Promise<{
	presented: boolean;
	purchased: boolean;
	customerInfo?: CustomerInfo;
	error?: string;
}> {
	if (!isConfigured) {
		return { presented: false, purchased: false, error: "RevenueCat not configured" };
	}

	try {
		const result = await RevenueCatUI.presentPaywall({
			displayCloseButton: true,
		});

		if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED) {
			const customerInfo = await waitForProEntitlement();
			return {
				presented: true,
				purchased: true,
				customerInfo: customerInfo || undefined,
			};
		}

		return { presented: true, purchased: false };
	} catch (error: any) {
		console.error("Failed to present paywall:", error);
		return { presented: false, purchased: false, error: error.message };
	}
}

export async function presentPaywallIfNeeded(): Promise<{
	presented: boolean;
	purchased: boolean;
	customerInfo?: CustomerInfo;
	error?: string;
}> {
	if (!isConfigured) {
		return { presented: false, purchased: false, error: "RevenueCat not configured" };
	}

	try {
		const result = await RevenueCatUI.presentPaywallIfNeeded({
			requiredEntitlementIdentifier: ENTITLEMENT_ID,
			displayCloseButton: true,
		});

		if (result === PAYWALL_RESULT.NOT_PRESENTED) {
			return { presented: false, purchased: false };
		}

		if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED) {
			const customerInfo = await waitForProEntitlement();
			return {
				presented: true,
				purchased: true,
				customerInfo: customerInfo || undefined,
			};
		}

		return { presented: true, purchased: false };
	} catch (error: any) {
		console.error("Failed to present paywall:", error);
		return { presented: false, purchased: false, error: error.message };
	}
}

export async function presentCustomerCenter(): Promise<void> {
	if (!isConfigured) {
		console.warn("RevenueCat not configured");
		return;
	}

	try {
		await RevenueCatUI.presentCustomerCenter();
	} catch (error) {
		console.error("Failed to present customer center:", error);
	}
}

export async function logInUser(userId: string): Promise<CustomerInfo | null> {
	if (!isConfigured) {
		await configureRevenueCat(userId);
	}

	try {
		const { customerInfo } = await Purchases.logIn(userId);
		currentUserId = userId;
		return customerInfo;
	} catch (error) {
		console.error("Failed to log in user:", error);
		return null;
	}
}

export async function logOutUser(): Promise<CustomerInfo | null> {
	if (!isConfigured) return null;

	try {
		const customerInfo = await Purchases.logOut();
		currentUserId = null;
		return customerInfo;
	} catch (error) {
		console.error("Failed to log out user:", error);
		return null;
	}
}

export async function setUserEmail(email: string): Promise<void> {
	if (!isConfigured) return;

	try {
		await Purchases.setEmail(email);
	} catch (error) {
		console.error("Failed to set user email:", error);
	}
}

export async function setUserDisplayName(displayName: string): Promise<void> {
	if (!isConfigured) return;

	try {
		await Purchases.setDisplayName(displayName);
	} catch (error) {
		console.error("Failed to set display name:", error);
	}
}

export function getPackageByProductId(
	offering: PurchasesOffering,
	productId: ProductId
): PurchasesPackage | null {
	return offering.availablePackages.find((pkg) => pkg.product.identifier === productId) || null;
}

export function getMonthlyPackage(offering: PurchasesOffering): PurchasesPackage | null {
	return offering.monthly || getPackageByProductId(offering, PRODUCT_IDS.MONTHLY);
}

export function getYearlyPackage(offering: PurchasesOffering): PurchasesPackage | null {
	return offering.annual || getPackageByProductId(offering, PRODUCT_IDS.YEARLY);
}

export function formatPrice(pkg: PurchasesPackage): string {
	return pkg.product.priceString;
}

export function calculateYearlySavings(
	monthlyPkg: PurchasesPackage,
	yearlyPkg: PurchasesPackage
): number {
	const monthlyAnnual = monthlyPkg.product.price * 12;
	const yearlyPrice = yearlyPkg.product.price;
	const savings = ((monthlyAnnual - yearlyPrice) / monthlyAnnual) * 100;
	return Math.round(savings);
}
