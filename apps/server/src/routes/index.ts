import type { FastifyInstance } from "fastify";
import { healthRoutes } from "./health.js";
import { providerRoutes } from "./providers.js";
import { syncRoutes } from "./sync.js";
import { usageRoutes } from "./usage.js";

export async function registerApiRoutes(app: FastifyInstance): Promise<void> {
  await healthRoutes(app);
  await providerRoutes(app);
  await syncRoutes(app);
  await usageRoutes(app);
}
