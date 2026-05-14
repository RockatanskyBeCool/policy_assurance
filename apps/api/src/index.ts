import cors from "@fastify/cors";
import Fastify from "fastify";
import { crawlSchoolRequestSchema } from "@school-policy/shared";
import { registerHealthRoutes } from "./routes/health.js";
import { registerSchoolRoutes } from "./routes/schools.js";

const app = Fastify({
  logger: true
});

await app.register(cors, { origin: true });
await registerHealthRoutes(app);
await registerSchoolRoutes(app);

app.post("/crawl/school", async (request, reply) => {
  const payload = crawlSchoolRequestSchema.parse(request.body);
  return reply.code(202).send({
    status: "queued",
    message: "Crawl queue integration is scaffolded; worker implementation will consume this contract.",
    payload
  });
});

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
await app.listen({ port, host: "0.0.0.0" });
