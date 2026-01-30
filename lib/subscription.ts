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

const REVENUECAT_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || "";
const REVENUECAT_ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || "";
const REVENUECAT_API_KEY = Platform.OS === "ios" ? REVENUECAT_IOS_KEY : REVENUECAT_ANDROID_KEY;
const ENTITLEMENT_ID = "Recapd Pro";

export const SUBSCRIPTIONS_ENABLED = process.env.EXPO_PUBLIC_SUBSCRIPTIONS_ENABLED !== "false";

export const PRODUCT_IDS = {
	MONTHLY: "monthly",
	YEARLY: "yearly",
} as const;

export type ProductId = (typeof PRODUCT_IDS)[keyof typeof PRODUCT_IDS];

let isConfigured = false;
let currentUserId: string | null = null;

export async function configureRevenueCat(userId: string): Promise<boolean> {
	if (!SUBSCRIPTIONS_ENABLED) {
		console.warn("Subscriptions are disabled");
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

		if (hasProAccess) {
			return { success: true, customerInfo };
		} else {
			return {
				success: false,
				customerInfo,
				error: "No active subscriptions found",
			};
		}
	} catch (error: any) {
		console.error("Restore failed:", error);
		return { success: false, error: error.message || "Restore failed" };
	}
}

export function checkProEntitlement(customerInfo: CustomerInfo): boolean {
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

export async function syncSubscriptionToDatabase(
	userId: string,
	customerInfo: CustomerInfo
): Promise<void> {
	const status = getSubscriptionStatus(customerInfo);
	const platform = Platform.OS === "ios" ? "ios" : "android";

	try {
		await supabase
			.from("users")
			.update({
				subscription_tier: status.isActive ? "pro" : "free",
				subscription_expires_at: status.expiresAt?.toISOString() || null,
				subscription_platform: status.isActive ? platform : null,
				subscription_id: customerInfo.originalAppUserId,
			})
			.eq("id", userId);
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

export async function presentPaywall(): Promise<{
	presented: boolean;
	customerInfo?: CustomerInfo;
	error?: string;
}> {
	if (!isConfigured) {
		return { presented: false, error: "RevenueCat not configured" };
	}

	try {
		const result = await RevenueCatUI.presentPaywall();

		if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED) {
			const customerInfo = await getCustomerInfo();
			return {
				presented: true,
				customerInfo: customerInfo || undefined,
			};
		}

		return { presented: true };
	} catch (error: any) {
		console.error("Failed to present paywall:", error);
		return { presented: false, error: error.message };
	}
}

export async function presentPaywallIfNeeded(): Promise<{
	presented: boolean;
	customerInfo?: CustomerInfo;
	error?: string;
}> {
	if (!isConfigured) {
		return { presented: false, error: "RevenueCat not configured" };
	}

	try {
		const result = await RevenueCatUI.presentPaywallIfNeeded({
			requiredEntitlementIdentifier: ENTITLEMENT_ID,
		});

		if (result === PAYWALL_RESULT.NOT_PRESENTED) {
			return { presented: false };
		}

		if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED) {
			const customerInfo = await getCustomerInfo();
			return {
				presented: true,
				customerInfo: customerInfo || undefined,
			};
		}

		return { presented: true };
	} catch (error: any) {
		console.error("Failed to present paywall:", error);
		return { presented: false, error: error.message };
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
