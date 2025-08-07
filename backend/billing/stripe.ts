import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { secret } from "encore.dev/config";
import { user } from "~encore/clients";

const stripeSecretKey = secret("StripeSecretKey");

export interface CreateCheckoutSessionRequest {
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CreateCheckoutSessionResponse {
  sessionId: string;
  url: string;
}

export interface CreatePortalSessionRequest {
  returnUrl: string;
}

export interface CreatePortalSessionResponse {
  url: string;
}

export interface WebhookEvent {
  type: string;
  data: {
    object: any;
  };
}

// Create Stripe checkout session
export const createCheckoutSession = api<CreateCheckoutSessionRequest, CreateCheckoutSessionResponse>(
  { expose: true, method: "POST", path: "/billing/checkout", auth: true },
  async (req) => {
    const auth = getAuthData()!;

    try {
      const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${stripeSecretKey()}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          "mode": "subscription",
          "line_items[0][price]": req.priceId,
          "line_items[0][quantity]": "1",
          "success_url": req.successUrl,
          "cancel_url": req.cancelUrl,
          "client_reference_id": auth.userID,
          "customer_email": auth.email || "",
        }),
      });

      if (!response.ok) {
        throw new Error(`Stripe API error: ${response.status}`);
      }

      const session = await response.json();

      return {
        sessionId: session.id,
        url: session.url,
      };
    } catch (error) {
      throw APIError.internal("failed to create checkout session", error);
    }
  }
);

// Create Stripe customer portal session
export const createPortalSession = api<CreatePortalSessionRequest, CreatePortalSessionResponse>(
  { expose: true, method: "POST", path: "/billing/portal", auth: true },
  async (req) => {
    const auth = getAuthData()!;

    try {
      // Get customer ID from user profile
      const profile = await user.getProfile();
      if (!profile) {
        throw APIError.notFound("user profile not found");
      }

      // In a real implementation, you'd store the Stripe customer ID in the profile
      // For now, we'll create a new customer if needed
      let customerId = ""; // This should come from the profile

      if (!customerId) {
        const customerResponse = await fetch("https://api.stripe.com/v1/customers", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${stripeSecretKey()}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            "email": profile.email,
            "metadata[user_id]": auth.userID,
          }),
        });

        if (!customerResponse.ok) {
          throw new Error(`Stripe API error: ${customerResponse.status}`);
        }

        const customer = await customerResponse.json();
        customerId = customer.id;
      }

      const response = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${stripeSecretKey()}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          "customer": customerId,
          "return_url": req.returnUrl,
        }),
      });

      if (!response.ok) {
        throw new Error(`Stripe API error: ${response.status}`);
      }

      const session = await response.json();

      return {
        url: session.url,
      };
    } catch (error) {
      throw APIError.internal("failed to create portal session", error);
    }
  }
);

// Handle Stripe webhooks
export const handleWebhook = api<WebhookEvent, void>(
  { expose: true, method: "POST", path: "/billing/webhook" },
  async (event) => {
    try {
      switch (event.type) {
        case "checkout.session.completed":
          await handleCheckoutCompleted(event.data.object);
          break;
        case "customer.subscription.updated":
          await handleSubscriptionUpdated(event.data.object);
          break;
        case "customer.subscription.deleted":
          await handleSubscriptionDeleted(event.data.object);
          break;
        default:
          console.log(`Unhandled event type: ${event.type}`);
      }
    } catch (error) {
      throw APIError.internal("failed to handle webhook", error);
    }
  }
);

async function handleCheckoutCompleted(session: any) {
  const userId = session.client_reference_id;
  if (!userId) return;

  // Get subscription details
  const subscriptionResponse = await fetch(`https://api.stripe.com/v1/subscriptions/${session.subscription}`, {
    headers: {
      "Authorization": `Bearer ${stripeSecretKey()}`,
    },
  });

  if (!subscriptionResponse.ok) return;

  const subscription = await subscriptionResponse.json();
  const priceId = subscription.items.data[0].price.id;

  // Map price ID to tier
  let tier = "free";
  if (priceId === "price_student_pro") {
    tier = "student_pro";
  } else if (priceId === "price_premium") {
    tier = "premium";
  }

  // Update user tier
  await user.updateProfile({ tier: tier as any });
}

async function handleSubscriptionUpdated(subscription: any) {
  const customerId = subscription.customer;
  
  // Get user by customer ID (you'd need to store this mapping)
  // For now, we'll skip this implementation
}

async function handleSubscriptionDeleted(subscription: any) {
  const customerId = subscription.customer;
  
  // Get user by customer ID and downgrade to free tier
  // For now, we'll skip this implementation
}
