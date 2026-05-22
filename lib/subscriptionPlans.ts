import type { SubscriptionPlan as DbSubscriptionPlan } from "@/types/database";
import {
	createSubscriptionPlanCatalog,
	SUBSCRIPTION_PLAN_CATALOG,
	type SubscriptionPlanCatalog,
} from "@/types/subscription";
import { logger } from "./logger";
import { supabase } from "./supabase";

export async function fetchSubscriptionPlanCatalog(): Promise<SubscriptionPlanCatalog> {
	try {
		const { data, error } = await supabase
			.from("subscription_plans")
			.select("*")
			.eq("is_active", true)
			.order("sort_order", { ascending: true });

		if (error) {
			throw error;
		}

		return createSubscriptionPlanCatalog((data || []) as DbSubscriptionPlan[]);
	} catch (error) {
		logger.warn("Failed to fetch subscription plans, using defaults", error);
		return SUBSCRIPTION_PLAN_CATALOG;
	}
}
