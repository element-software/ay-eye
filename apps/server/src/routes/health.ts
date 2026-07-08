import type { FastifyInstance } from "fastify";
import { appVersion } from "../config/env.js";
import { db } from "../db/database.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/health", async () => {
    let database = "ok";
    try {
      db.prepare("SELECT 1").get();
    } catch {
      database = "error";
    }

    return {
      status: database === "ok" ? "ok" : "error",
      database,
      time: new Date().toISOString(),
      version: appVersion
    };
  });
}
