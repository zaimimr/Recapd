import type {
	CustomerInfo,
	PURCHASES_ERROR_CODE,
	PurchasesEntitlementInfo,
	PurchasesOffering,
	PurchasesPackage,
} from "react-native-purchases";
import { revenueCatProvider } from "./revenuecatProvider";

export interface PurchaseResult {
	success: boolean;
	customerInfo?: CustomerInfo;
	error?: string;
	errorCode?: PURCHASES_ERROR_CODE;
	userCancelled?: boolean;
}

export interface PaywallResult {
	presented: boolean;
	purchased: boolean;
	customerInfo?: CustomerInfo;
	error?: string;
}

export interface CustomerCenterResult {
	presented: boolean;
	error?: string;
}

export interface BillingProvider {
	readonly name: string;
	configure(userId: string): Promise<boolean>;
	isConfigured(): boolean;
	getLastError(): string | null;
	getCustomerInfo(): Promise<CustomerInfo | null>;
	getOfferings(): Promise<PurchasesOffering | null>;
	getAllOfferings(): Promise<Record<string, PurchasesOffering> | null>;
	purchasePackage(pkg: PurchasesPackage): Promise<PurchaseResult>;
	restorePurchases(entitlementId?: string | null): Promise<PurchaseResult>;
	setupCustomerInfoListener(onUpdate: (customerInfo: CustomerInfo) => void): () => void;
	presentPaywall(
		offering?: PurchasesOffering | null,
		entitlementId?: string | null
	): Promise<PaywallResult>;
	presentPaywallIfNeeded(
		offering?: PurchasesOffering | null,
		entitlementId?: string | null
	): Promise<PaywallResult>;
	presentCustomerCenter(): Promise<CustomerCenterResult>;
	logInUser(userId: string): Promise<CustomerInfo | null>;
	logOutUser(): Promise<CustomerInfo | null>;
	setUserEmail(email: string): Promise<void>;
	setUserDisplayName(displayName: string): Promise<void>;
	getEntitlement(
		customerInfo: CustomerInfo,
		entitlementId?: string | null
	): PurchasesEntitlementInfo | null;
}

let activeBillingProvider: BillingProvider = revenueCatProvider;

export function getBillingProvider(): BillingProvider {
	return activeBillingProvider;
}

export function setBillingProvider(provider: BillingProvider): void {
	activeBillingProvider = provider;
}

export function resetBillingProvider(): void {
	activeBillingProvider = revenueCatProvider;
}
