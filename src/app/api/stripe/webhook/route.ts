import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { createClient } from "@supabase/supabase-js";

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature = request.headers.get("stripe-signature");

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Invalid signature";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const supabase = getAdminClient();

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (session.mode === "subscription" && session.subscription) {
        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string,
        );
        await syncSubscription(supabase, subscription);
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object;
      await syncSubscription(supabase, subscription);
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object;
      if (invoice.customer) {
        await supabase
          .from("users")
          .update({ subscription_status: "past_due" } as Record<string, unknown>)
          .eq("stripe_customer_id", invoice.customer as string);
      }
      break;
    }
  }

  return NextResponse.json({ received: true });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function syncSubscription(supabase: any, subscription: any) {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  const status = subscription.status as string;
  const tier = status === "active" || status === "trialing" ? "pro" : "free";
  const periodEnd = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000).toISOString()
    : null;

  await supabase
    .from("users")
    .update({
      stripe_subscription_id: subscription.id,
      subscription_status: mapStripeStatus(status),
      subscription_tier: tier,
      subscription_current_period_end: periodEnd,
    })
    .eq("stripe_customer_id", customerId);
}

function mapStripeStatus(status: string): string {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
    case "unpaid":
      return "canceled";
    default:
      return "none";
  }
}
