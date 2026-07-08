import { existsSync } from "node:fs";
import { join } from "node:path";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { adapters } from "./adapters/index.js";
import { appConfig, isAuthConfigured, serverRoot } from "./config/env.js";
import { ensureProviderConnection, migrate } from "./db/database.js";
import { registerApiRoutes } from "./routes/index.js";
import { startScheduler } from "./scheduler/scheduler.js";
import { requireBasicAuth } from "./security/basic-auth.js";

const app = Fastify({ logger: true });

migrate();
for (const adapter of adapters) {
  ensureProviderConnection(adapter.id, adapter.label, adapter.isConfigured());
}

if (!isAuthConfigured()) {
  app.log.warn("APP_USERNAME and APP_PASSWORD are unset; local access is allowed without authentication");
}

app.addHook("preHandler", async (request, reply) => {
  if (request.url === "/api/health") {
    return;
  }
  await requireBasicAuth(request, reply);
});

await registerApiRoutes(app);

const webDist = join(serverRoot, "../web/dist");
if (existsSync(webDist)) {
  await app.register(fastifyStatic, {
    root: webDist,
    wildcard: false
  });

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/")) {
      return reply.code(404).send({ error: "Not found" });
    }
    return reply.sendFile("index.html");
  });
}

startScheduler(adapters);

await app.listen({ host: appConfig.HOST, port: appConfig.PORT });
