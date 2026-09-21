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
import { logger } from "@/lib/logger";
import { SUBSCRIPTIONS_ENABLED } from "./config";
import type {
	BillingProvider,
	CustomerCenterResult,
	PaywallResult,
	PurchaseResult,
} from "./provider";

const REVENUECAT_IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || "";
const REVENUECAT_ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || "";
const DEFAULT_ENTITLEMENT_ID = "Recapd Pro";

let isConfigured = false;
let currentUserId: string | null = null;
let lastRevenueCatError: string | null = null;

function isExpoGo(): boolean {
	return Constants.executionEnvironment === "storeClient" || Constants.appOwnership === "expo";
}

function getRuntimeEnvironment(): string {
	return Constants.executionEnvironment ?? Constants.appOwnership ?? "unknown";
}

function getApiKey(): string {
	return Platform.OS === "ios" ? REVENUECAT_IOS_KEY : REVENUECAT_ANDROID_KEY;
}

function resolveEntitlementId(entitlementId?: string | null): string {
	const normalized = entitlementId?.trim();
	return normalized ? normalized : DEFAULT_ENTITLEMENT_ID;
}

function formatErrorMessage(error: unknown, fallback: string): string {
	if (error instanceof Error) return error.message || fallback;
	if (typeof error === "string" && error.trim()) return error;
	if (error && typeof error === "object") {
		const maybeError = error as {
			message?: unknown;
			code?: unknown;
			domain?: unknown;
		};
		const parts = [maybeError.message, maybeError.code, maybeError.domain]
			.filter((part) => typeof part === "string" && part.trim().length > 0)
			.map(String);
		if (parts.length > 0) return parts.join(" | ");
	}
	return fallback;
}

function extractErrorCode(error: unknown): string | undefined {
	if (!error || typeof error !== "object") return undefined;
	const candidate = error as {
		code?: unknown;
		userInfo?: { readableErrorCode?: unknown };
		readableErrorCode?: unknown;
	};
	const readable = candidate.userInfo?.readableErrorCode ?? candidate.readableErrorCode;
	if (typeof readable === "string" && readable.trim()) return readable;
	if (typeof candidate.code === "string" && candidate.code.trim()) return candidate.code;
	if (typeof candidate.code === "number") return String(candidate.code);
	return undefined;
}

function describeOffering(offering?: PurchasesOffering | null): {
	packageCount: number;
	offeringIdentifier: string | null;
} {
	return {
		packageCount: offering?.availablePackages?.length ?? 0,
		offeringIdentifier: offering?.identifier ?? null,
	};
}

function getEntitlement(
	customerInfo: CustomerInfo,
	entitlementId?: string | null
): PurchasesEntitlementInfo | null {
	return customerInfo.entitlements.active[resolveEntitlementId(entitlementId)] || null;
}

function hasActiveEntitlement(customerInfo: CustomerInfo, entitlementId?: string | null): boolean {
	return getEntitlement(customerInfo, entitlementId)?.isActive === true;
}

async function waitForActiveEntitlement(
	entitlementId?: string | null
): Promise<CustomerInfo | null> {
	const info = await revenueCatProvider.getCustomerInfo();
	if (info && hasActiveEntitlement(info, entitlementId)) return info;

	await new Promise((resolve) => setTimeout(resolve, 1500));
	const retryInfo = await revenueCatProvider.getCustomerInfo();
	if (retryInfo && hasActiveEntitlement(retryInfo, entitlementId)) return retryInfo;

	return retryInfo;
}

export const revenueCatProvider: BillingProvider = {
	name: "revenuecat",

	async configure(userId: string): Promise<boolean> {
		if (!SUBSCRIPTIONS_ENABLED) {
			lastRevenueCatError = "Subscriptions are disabled";
			logger.warn(lastRevenueCatError);
			return false;
		}

		const apiKey = getApiKey();
		if (!apiKey) {
			lastRevenueCatError = `Missing RevenueCat API key for ${Platform.OS}`;
			logger.error(lastRevenueCatError, {
				platform: Platform.OS,
				runtime: getRuntimeEnvironment(),
			});
			return false;
		}

		if (isExpoGo()) {
			logger.warn("RevenueCat is running in Expo Go preview mode", {
				runtime: getRuntimeEnvironment(),
			});
		}

		if (isConfigured && currentUserId === userId) {
			lastRevenueCatError = null;
			return true;
		}

		try {
			if (__DEV__) {
				Purchases.setLogLevel(LOG_LEVEL.DEBUG);
			}

			if (isConfigured && currentUserId && currentUserId !== userId) {
				await Purchases.logIn(userId);
			} else {
				await Purchases.configure({
					apiKey,
					appUserID: userId,
				});
			}

			isConfigured = true;
			currentUserId = userId;
			lastRevenueCatError = null;

			logger.debug("RevenueCat configured", { userId });
			return true;
		} catch (error) {
			lastRevenueCatError = formatErrorMessage(error, "Failed to configure RevenueCat");
			logger.error(lastRevenueCatError, error, {
				userId,
				runtime: getRuntimeEnvironment(),
			});
			return false;
		}
	},

	isConfigured(): boolean {
		return isConfigured;
	},

	getLastError(): string | null {
		return lastRevenueCatError;
	},

	async getCustomerInfo(): Promise<CustomerInfo | null> {
		if (!isConfigured) {
			lastRevenueCatError = "RevenueCat not configured";
			logger.warn(lastRevenueCatError);
			return null;
		}

		try {
			const customerInfo = await Purchases.getCustomerInfo();
			lastRevenueCatError = null;
			return customerInfo;
		} catch (error) {
			lastRevenueCatError = formatErrorMessage(error, "Failed to get customer info");
			logger.error(lastRevenueCatError, error);
			return null;
		}
	},

	async getOfferings(): Promise<PurchasesOffering | null> {
		if (!isConfigured) {
			lastRevenueCatError = "RevenueCat not configured";
			logger.warn(lastRevenueCatError);
			return null;
		}

		try {
			const offerings = await Purchases.getOfferings();
			lastRevenueCatError = null;
			return offerings?.current ?? null;
		} catch (error) {
			lastRevenueCatError = formatErrorMessage(error, "Failed to get offerings");
			logger.error(lastRevenueCatError, error);
			return null;
		}
	},

	async getAllOfferings(): Promise<Record<string, PurchasesOffering> | null> {
		if (!isConfigured) return null;

		try {
			const offerings = await Purchases.getOfferings();
			lastRevenueCatError = null;
			return offerings?.all ?? null;
		} catch (error) {
			lastRevenueCatError = formatErrorMessage(error, "Failed to get all offerings");
			logger.error(lastRevenueCatError, error);
			return null;
		}
	},

	async purchasePackage(pkg: PurchasesPackage): Promise<PurchaseResult> {
		if (!isConfigured) {
			return { success: false, error: "RevenueCat not configured" };
		}

		try {
			const { customerInfo } = await Purchases.purchasePackage(pkg);
			lastRevenueCatError = null;
			return { success: true, customerInfo };
		} catch (error: any) {
			if (error.userCancelled) {
				lastRevenueCatError = null;
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
					errorMessage = formatErrorMessage(error, "Purchase failed");
			}

			lastRevenueCatError = errorMessage;
			logger.error("Purchase failed", error);
			return { success: false, error: errorMessage, errorCode };
		}
	},

	async restorePurchases(entitlementId?: string | null): Promise<PurchaseResult> {
		if (!isConfigured) {
			return { success: false, error: "RevenueCat not configured" };
		}

		try {
			const customerInfo = await Purchases.restorePurchases();
			lastRevenueCatError = null;
			const hasEntitlement = hasActiveEntitlement(customerInfo, entitlementId);
			const hasActiveSubscriptions = customerInfo.activeSubscriptions.length > 0;

			if (hasEntitlement || hasActiveSubscriptions) {
				return { success: true, customerInfo };
			}

			return {
				success: false,
				customerInfo,
				error: "No active subscriptions found",
			};
		} catch (error: any) {
			if (error.userCancelled) {
				lastRevenueCatError = null;
				return {
					success: false,
					error: "Restore cancelled",
					userCancelled: true,
				};
			}

			const errorMessage = formatErrorMessage(error, "Restore failed");
			lastRevenueCatError = errorMessage;
			logger.warn("Restore failed", error);
			return { success: false, error: errorMessage };
		}
	},

	setupCustomerInfoListener(onUpdate: (customerInfo: CustomerInfo) => void): () => void {
		if (!isConfigured) return () => {};

		Purchases.addCustomerInfoUpdateListener(onUpdate);

		return () => {
			Purchases.removeCustomerInfoUpdateListener(onUpdate);
		};
	},

	async presentPaywall(
		offering?: PurchasesOffering | null,
		entitlementId?: string | null
	): Promise<PaywallResult> {
		const context = describeOffering(offering);

		if (!isConfigured) {
			return {
				presented: false,
				purchased: false,
				error: "RevenueCat not configured",
				errorCode: "NOT_CONFIGURED",
				...context,
			};
		}

		try {
			const result = await RevenueCatUI.presentPaywall(
				offering
					? {
							displayCloseButton: true,
							offering,
						}
					: {
							displayCloseButton: true,
						}
			);

			if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED) {
				const customerInfo = await waitForActiveEntitlement(entitlementId);
				lastRevenueCatError = null;
				return {
					presented: true,
					purchased: true,
					customerInfo: customerInfo || undefined,
					...context,
				};
			}

			lastRevenueCatError = null;
			return { presented: true, purchased: false, ...context };
		} catch (error: any) {
			const errorMessage = formatErrorMessage(error, "Failed to present paywall");
			const errorCode = extractErrorCode(error);
			lastRevenueCatError = errorMessage;
			logger.error("Failed to present paywall", error, {
				errorCode: errorCode ?? null,
				platform: Platform.OS,
				...context,
			});
			return { presented: false, purchased: false, error: errorMessage, errorCode, ...context };
		}
	},

	async presentPaywallIfNeeded(
		offering?: PurchasesOffering | null,
		entitlementId?: string | null
	): Promise<PaywallResult> {
		const context = describeOffering(offering);

		if (!isConfigured) {
			return {
				presented: false,
				purchased: false,
				error: "RevenueCat not configured",
				errorCode: "NOT_CONFIGURED",
				...context,
			};
		}

		try {
			const result = await RevenueCatUI.presentPaywallIfNeeded(
				offering
					? {
							requiredEntitlementIdentifier: resolveEntitlementId(entitlementId),
							displayCloseButton: true,
							offering,
						}
					: {
							requiredEntitlementIdentifier: resolveEntitlementId(entitlementId),
							displayCloseButton: true,
						}
			);

			if (result === PAYWALL_RESULT.NOT_PRESENTED) {
				return { presented: false, purchased: false, ...context };
			}

			if (result === PAYWALL_RESULT.PURCHASED || result === PAYWALL_RESULT.RESTORED) {
				const customerInfo = await waitForActiveEntitlement(entitlementId);
				lastRevenueCatError = null;
				return {
					presented: true,
					purchased: true,
					customerInfo: customerInfo || undefined,
					...context,
				};
			}

			lastRevenueCatError = null;
			return { presented: true, purchased: false, ...context };
		} catch (error: any) {
			const errorMessage = formatErrorMessage(error, "Failed to present paywall");
			const errorCode = extractErrorCode(error);
			lastRevenueCatError = errorMessage;
			logger.error("Failed to present paywall if needed", error, {
				errorCode: errorCode ?? null,
				platform: Platform.OS,
				...context,
			});
			return { presented: false, purchased: false, error: errorMessage, errorCode, ...context };
		}
	},

	async presentCustomerCenter(): Promise<CustomerCenterResult> {
		if (!isConfigured) {
			const errorMessage = "RevenueCat not configured";
			lastRevenueCatError = errorMessage;
			logger.warn(errorMessage);
			return { presented: false, error: errorMessage };
		}

		try {
			await RevenueCatUI.presentCustomerCenter();
			lastRevenueCatError = null;
			return { presented: true };
		} catch (error) {
			const errorMessage = formatErrorMessage(error, "Failed to present customer center");
			lastRevenueCatError = errorMessage;
			logger.error("Failed to present customer center", error);
			return { presented: false, error: errorMessage };
		}
	},

	async logInUser(userId: string): Promise<CustomerInfo | null> {
		if (!isConfigured) {
			await revenueCatProvider.configure(userId);
		}

		try {
			const { customerInfo } = await Purchases.logIn(userId);
			currentUserId = userId;
			lastRevenueCatError = null;
			return customerInfo;
		} catch (error) {
			lastRevenueCatError = formatErrorMessage(error, "Failed to log in user");
			logger.error("Failed to log in user", error);
			return null;
		}
	},

	async logOutUser(): Promise<CustomerInfo | null> {
		if (!isConfigured) return null;

		try {
			const customerInfo = await Purchases.logOut();
			currentUserId = null;
			lastRevenueCatError = null;
			return customerInfo;
		} catch (error) {
			lastRevenueCatError = formatErrorMessage(error, "Failed to log out user");
			logger.error("Failed to log out user", error);
			return null;
		}
	},

	async setUserEmail(email: string): Promise<void> {
		if (!isConfigured) return;

		try {
			await Purchases.setEmail(email);
		} catch (error) {
			lastRevenueCatError = formatErrorMessage(error, "Failed to set user email");
			logger.error("Failed to set user email", error);
		}
	},

	async setUserDisplayName(displayName: string): Promise<void> {
		if (!isConfigured) return;

		try {
			await Purchases.setDisplayName(displayName);
		} catch (error) {
			lastRevenueCatError = formatErrorMessage(error, "Failed to set display name");
			logger.error("Failed to set display name", error);
		}
	},

	getEntitlement,
};
