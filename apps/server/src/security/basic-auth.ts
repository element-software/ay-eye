import type { FastifyReply, FastifyRequest } from "fastify";
import { appConfig, isAuthConfigured } from "../config/env.js";

export async function requireBasicAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!isAuthConfigured()) {
    return;
  }

  const header = request.headers.authorization;
  if (!header?.startsWith("Basic ")) {
    return unauthorized(reply);
  }

  const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  const username = separator >= 0 ? decoded.slice(0, separator) : decoded;
  const password = separator >= 0 ? decoded.slice(separator + 1) : "";

  if (username !== appConfig.APP_USERNAME || password !== appConfig.APP_PASSWORD) {
    return unauthorized(reply);
  }
}

function unauthorized(reply: FastifyReply): void {
  reply.header("WWW-Authenticate", 'Basic realm="AI Usage Meter"').code(401).send({ error: "Authentication required" });
}
