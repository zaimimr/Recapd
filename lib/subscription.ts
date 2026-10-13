import Constants from "expo-constants";
import { Platform } from "react-native";
import type {
	CustomerInfo,
	PurchasesEntitlementInfo,
	PurchasesOffering,
	PurchasesPackage,
} from "react-native-purchases";
import { SUBSCRIPTIONS_ENABLED } from "@/lib/billing/config";

export { SUBSCRIPTIONS_ENABLED } from "@/lib/billing/config";

import {
	type BillingProvider,
	type CustomerCenterResult,
	getBillingProvider,
	type PurchaseResult,
	resetBillingProvider,
	setBillingProvider,
} from "@/lib/billing/provider";
import { logger } from "./logger";
import { supabase } from "./supabase";

function isExpoGo(): boolean {
	return Constants.executionEnvironment === "storeClient" || Constants.appOwnership === "expo";
}

function getRuntimeEnvironment(): string {
	return Constants.executionEnvironment ?? Constants.appOwnership ?? "unknown";
}

const DEFAULT_ENTITLEMENT_ID = "Recapd Pro";

export const PRODUCT_IDS = {
	MONTHLY: "monthly",
	YEARLY: "yearly",
} as const;

export type ProductId = (typeof PRODUCT_IDS)[keyof typeof PRODUCT_IDS];

export function getLastRevenueCatError(): string | null {
	return getBillingProvider().getLastError();
}

function resolveEntitlementId(entitlementId?: string | null): string {
	const normalized = entitlementId?.trim();
	return normalized ? normalized : DEFAULT_ENTITLEMENT_ID;
}

export async function configureRevenueCat(userId: string): Promise<boolean> {
	if (isExpoGo() && SUBSCRIPTIONS_ENABLED) {
		logger.warn("RevenueCat is running in Expo Go preview mode", {
			runtime: getRuntimeEnvironment(),
		});
	}
	return getBillingProvider().configure(userId);
}

export function isRevenueCatConfigured(): boolean {
	return getBillingProvider().isConfigured();
}

export async function getCustomerInfo(): Promise<CustomerInfo | null> {
	return getBillingProvider().getCustomerInfo();
}

export async function getOfferings(): Promise<PurchasesOffering | null> {
	return getBillingProvider().getOfferings();
}

export async function getAllOfferings(): Promise<{
	[key: string]: PurchasesOffering;
} | null> {
	return getBillingProvider().getAllOfferings();
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<PurchaseResult> {
	return getBillingProvider().purchasePackage(pkg);
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

export async function restorePurchases(entitlementId?: string | null): Promise<PurchaseResult> {
	return getBillingProvider().restorePurchases(resolveEntitlementId(entitlementId));
}

export function checkProEntitlement(
	customerInfo: CustomerInfo,
	entitlementId?: string | null
): boolean {
	const resolvedEntitlementId = resolveEntitlementId(entitlementId);
	if (__DEV__) {
		logger.debug("Active entitlements", {
			activeEntitlements: Object.keys(customerInfo.entitlements.active),
			resolvedEntitlementId,
		});
	}
	const entitlement = customerInfo.entitlements.active[resolvedEntitlementId];
	return entitlement?.isActive === true;
}

export function getProEntitlement(
	customerInfo: CustomerInfo,
	entitlementId?: string | null
): PurchasesEntitlementInfo | null {
	return getBillingProvider().getEntitlement(customerInfo, resolveEntitlementId(entitlementId));
}

export function getSubscriptionExpirationDate(
	customerInfo: CustomerInfo,
	entitlementId?: string | null
): Date | null {
	const entitlement = getProEntitlement(customerInfo, entitlementId);
	if (!entitlement?.expirationDate) return null;
	return new Date(entitlement.expirationDate);
}

export function getSubscriptionStatus(
	customerInfo: CustomerInfo,
	entitlementId?: string | null
): {
	isActive: boolean;
	expiresAt: Date | null;
	productId: string | null;
	willRenew: boolean;
} {
	const entitlement = getProEntitlement(customerInfo, entitlementId);

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
	customerInfo: CustomerInfo,
	entitlementId?: string | null
): Promise<void> {
	const status = getSubscriptionStatus(customerInfo, entitlementId);
	const platform = Platform.OS === "ios" ? "ios" : "android";

	try {
		const privateUpdate = await supabase.from("user_private_data").upsert(
			{
				user_id: userId,
				subscription_expires_at: status.expiresAt?.toISOString() || null,
				subscription_platform: status.isActive ? platform : null,
				subscription_id: customerInfo.originalAppUserId,
			},
			{ onConflict: "user_id" }
		);

		if (privateUpdate.error) {
			throw privateUpdate.error;
		}
	} catch (error) {
		logger.error("Failed to sync subscription to database", error, { userId });
	}
}

export function setupCustomerInfoListener(
	onUpdate: (customerInfo: CustomerInfo) => void
): () => void {
	return getBillingProvider().setupCustomerInfoListener(onUpdate);
}

export async function presentPaywall(
	offering?: PurchasesOffering | null,
	entitlementId?: string | null
) {
	return getBillingProvider().presentPaywall(offering, resolveEntitlementId(entitlementId));
}

export async function presentPaywallIfNeeded(
	offering?: PurchasesOffering | null,
	entitlementId?: string | null
) {
	return getBillingProvider().presentPaywallIfNeeded(offering, resolveEntitlementId(entitlementId));
}

export async function presentCustomerCenter(): Promise<CustomerCenterResult> {
	return getBillingProvider().presentCustomerCenter();
}

export async function logInUser(userId: string): Promise<CustomerInfo | null> {
	return getBillingProvider().logInUser(userId);
}

export async function logOutUser(): Promise<CustomerInfo | null> {
	return getBillingProvider().logOutUser();
}

export async function setUserEmail(email: string): Promise<void> {
	return getBillingProvider().setUserEmail(email);
}

export async function setUserDisplayName(displayName: string): Promise<void> {
	return getBillingProvider().setUserDisplayName(displayName);
}

export { resetBillingProvider, setBillingProvider };
export type { BillingProvider, CustomerCenterResult, PurchaseResult };

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
