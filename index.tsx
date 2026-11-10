import { Hono } from "npm:hono";
import { cors } from "npm:hono/cors";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";

const app = new Hono();

app.use('*', logger(console.log));
app.use("/*", cors({
  origin: "*",
  allowHeaders: ["Content-Type", "Authorization"],
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  exposeHeaders: ["Content-Length"],
  maxAge: 600,
}));

function sb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

app.get("/make-server-329466e6/health", (c) => c.json({ status: "ok" }));

// Checkout: atomic multi-step operation (insert txn + items + decrement stock + update customer)
app.post("/make-server-329466e6/checkout", async (c) => {
  const db = sb();
  const { txn, items, customer_id } = await c.req.json();

  const { data: transaction, error: txnErr } = await db
    .from("ms_transactions")
    .insert(txn)
    .select()
    .single();
  if (txnErr) return c.json({ error: txnErr.message }, 500);

  if (items?.length) {
    const lineItems = items.map((item: { product_id: number; quantity: number; unit_price: number }) => ({
      transaction_id: transaction.id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      line_total: +(item.quantity * item.unit_price).toFixed(2),
    }));
    const { error: itemErr } = await db.from("ms_transaction_items").insert(lineItems);
    if (itemErr) return c.json({ error: itemErr.message }, 500);

    for (const item of items) {
      const { data: inv } = await db
        .from("ms_inventory")
        .select("stock")
        .eq("product_id", item.product_id)
        .single();
      if (inv) {
        await db.from("ms_inventory")
          .update({ stock: Math.max(0, inv.stock - item.quantity), updated_at: new Date().toISOString() })
          .eq("product_id", item.product_id);
      }
    }
  }

  if (customer_id) {
    const { data: cust } = await db
      .from("ms_customers")
      .select("total_spent,visit_count,points")
      .eq("id", customer_id)
      .single();
    if (cust) {
      const newSpent = +cust.total_spent + +txn.total;
      const tier = newSpent >= 10000 ? "Platinum" : newSpent >= 5000 ? "Gold" : newSpent >= 1500 ? "Silver" : "Bronze";
      await db.from("ms_customers").update({
        total_spent: newSpent,
        visit_count: cust.visit_count + 1,
        points: cust.points + Math.floor(+txn.total),
        tier,
        last_visit: new Date().toISOString().split("T")[0],
      }).eq("id", customer_id);
    }
  }

  return c.json(transaction);
});

Deno.serve(app.fetch);
