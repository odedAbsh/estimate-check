import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp, clientFromEnv } from "./app";

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8787);
const client = clientFromEnv();
const app = createApp(client);

if (process.env.NODE_ENV === "production") {
  const dist = path.resolve(here, "../dist");
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(port, () => {
  console.log(`Estimate Check API on http://localhost:${port} (AI ${client ? "on" : "off: set ANTHROPIC_API_KEY to enable"})`);
});
