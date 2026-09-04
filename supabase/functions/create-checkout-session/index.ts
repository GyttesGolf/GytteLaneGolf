// Creates a Stripe Checkout Session for a single event fee.
//
// Deliberately never trusts a client-supplied amount: the price always
// comes from the event's own `cost` field (or an existing event_payments
// row's amount, if an admin already set a custom one for this player),
// looked up server-side with the service role key. The client only ever
// supplies event_id + player_id.
//
// Deployed with verify_jwt left on (the default) — the browser calls this
// with the normal Supabase anon key, same as every other client request.

import Stripe from "npm:stripe@14";
import { createClient } from "npm:@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function parseFee(cost: string | null): number {
  if (!cost) return 0;
  const n = parseFloat(cost.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { event_id, player_id, origin } = await req.json();
    if (!event_id || !player_id || !origin) {
      return new Response(JSON.stringify({ error: "event_id, player_id and origin are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: event, error: eventErr } = await supabase
      .from("events")
      .select("id, name, cost, society_id")
      .eq("id", event_id)
      .single();
    if (eventErr || !event) {
      return new Response(JSON.stringify({ error: "Event not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: player, error: playerErr } = await supabase
      .from("players")
      .select("id, first_name, last_name")
      .eq("id", player_id)
      .single();
    if (playerErr || !player) {
      return new Response(JSON.stringify({ error: "Player not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // A custom per-player amount (set by an admin) takes priority over the
    // event's default cost, same rule the existing manual payment UI uses.
    const { data: existingPayment } = await supabase
      .from("event_payments")
      .select("amount, paid")
      .eq("event_id", event_id)
      .eq("player_id", player_id)
      .maybeSingle();

    if (existingPayment?.paid) {
      return new Response(JSON.stringify({ error: "This is already marked as paid." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fee = existingPayment ? Number(existingPayment.amount) : parseFee(event.cost);
    if (!(fee > 0)) {
      return new Response(JSON.stringify({ error: "This event has no payable amount set." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: { name: event.name },
            unit_amount: Math.round(fee * 100),
          },
          quantity: 1,
        },
      ],
      metadata: {
        event_id: String(event.id),
        player_id: String(player.id),
        society_id: event.society_id,
      },
      success_url: `${origin}/?stripe=success#events`,
      cancel_url: `${origin}/?stripe=cancelled#events`,
    });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("create-checkout-session error:", err);
    return new Response(JSON.stringify({ error: "Could not start checkout." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
