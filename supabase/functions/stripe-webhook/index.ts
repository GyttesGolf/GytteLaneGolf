// Receives Stripe's webhook the moment a Checkout Session actually
// completes, and marks the matching event_payments row as paid. This is
// what makes a card payment "automatic" instead of needing an admin to
// tick a box, the same way the manual bank-transfer flow still works.
//
// Deployed with verify_jwt turned OFF — Stripe calls this directly with
// no Supabase auth at all, so the normal JWT check would reject every
// request before our own signature verification even runs. The real
// authentication here is the Stripe signature check below.

import Stripe from "npm:stripe@14";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

Deno.serve(async (req) => {
  const signature = req.headers.get("stripe-signature");
  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature!, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const { event_id, player_id, society_id } = session.metadata ?? {};

    if (!event_id || !player_id || !society_id) {
      console.error("Checkout session completed with missing metadata:", session.id);
      return new Response("Missing metadata", { status: 400 });
    }

    const amount = (session.amount_total ?? 0) / 100;
    const paidDate = new Date().toISOString().slice(0, 10);

    const { error } = await supabase
      .from("event_payments")
      .upsert(
        {
          event_id,
          player_id: Number(player_id),
          society_id,
          amount,
          paid: true,
          paid_date: paidDate,
          payment_method: "stripe",
          stripe_session_id: session.id,
        },
        { onConflict: "event_id,player_id" },
      );

    if (error) {
      console.error("Could not record Stripe payment:", error);
      return new Response("Database error", { status: 500 });
    }
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
