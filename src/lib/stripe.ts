import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-03-25.dahlia",
      typescript: true,
    });
  }
  return _stripe;
}

// Convenience export — only call at request time, not module load time
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripe() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

export const TIERS = {
  free: {
    name: "Free",
    aiAccess: false,
    priceId: null,
  },
  pro: {
    name: "Pro",
    aiAccess: true, // Unlimited AI usage (rate-limited by server if needed)
    priceId: process.env.STRIPE_PRO_PRICE_ID ?? null,
  },
} as const;

export type TierKey = keyof typeof TIERS;
