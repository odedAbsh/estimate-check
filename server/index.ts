import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Stripe from "stripe";
import { createApp, clientFromEnv } from "./app";
import { openDb } from "./db";

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8787);
const client = clientFromEnv();
const prod = process.env.NODE_ENV === "production";
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
// Without Stripe keys, local development gets a free "demo checkout". Production never does unless explicitly allowed.
const demoCheckout = !stripe && (!prod || process.env.ALLOW_DEMO_CHECKOUT === "1");
const app = createApp(client, {
  db: openDb(process.env.DATABASE_PATH ?? path.resolve(here, "../data/estimate.db")),
  stripe,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  publicUrl: process.env.PUBLIC_URL ?? null,
  demoCheckout,
  secureCookies: prod && process.env.INSECURE_COOKIES !== "1",
});

if (process.env.NODE_ENV === "production") {
  const dist = path.resolve(here, "../dist");
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(port, () => {
  console.log(`Estimate Check API on http://localhost:${port} (AI ${client ? "on" : "off: set ANTHROPIC_API_KEY to enable"}, payments: ${stripe ? "Stripe" : demoCheckout ? "demo" : "off"})`);
});
