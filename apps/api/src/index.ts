import { Hono } from "hono";
import { drizzle } from "drizzle-orm/d1";

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

app.get("/", (c) => {
  return c.json({ name: "Okresní Mašina API", version: "0.0.1" });
});

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

export default app;