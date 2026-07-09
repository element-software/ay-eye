import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getLatestLimitSnapshots, insertLimitSnapshots } from "../db/database.js";

const limitWindowSchema = z.object({
  window: z.string().min(1).max(32),
  usedPercent: z.number().min(0).max(100).optional().nullable(),
  remainingPercent: z.number().min(0).max(100).optional().nullable(),
  resetAt: z.string().datetime().optional().nullable(),
  raw: z.unknown().optional()
});

const limitSnapshotSchema = z.object({
  provider: z.string().min(1).max(64),
  source: z.string().min(1).max(128).default("local"),
  capturedAt: z.string().datetime().default(() => new Date().toISOString()),
  windows: z.array(limitWindowSchema).min(1).max(16)
});

export async function limitRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/limits/latest", async () => getLatestLimitSnapshots());

  app.post("/api/limits/snapshot", async (request, reply) => {
    const parsed = limitSnapshotSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: "Invalid limit snapshot payload",
        details: parsed.error.flatten()
      });
    }

    const recordsInserted = insertLimitSnapshots(
      parsed.data.windows.map((window) => ({
        provider: parsed.data.provider,
        source: parsed.data.source,
        capturedAt: parsed.data.capturedAt,
        window: window.window,
        usedPercent: window.usedPercent,
        remainingPercent: window.remainingPercent,
        resetAt: window.resetAt,
        rawJson: window.raw
      }))
    );

    return {
      ok: true,
      recordsInserted
    };
  });
}
