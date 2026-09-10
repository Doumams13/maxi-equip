import { Router } from "./core/router.js";
import { healthRoute as publicHealthRoute } from "./routes/v1/public/health.js";
import { healthRoute as appHealthRoute } from "./routes/v1/app/health.js";

export function createRouter(): Router {
  const router = new Router();
  router.register(publicHealthRoute);
  router.register(appHealthRoute);
  return router;
}

export { Router } from "./core/router.js";
export * from "./core/types.js";
export * from "./core/errors.js";
export * from "./core/jwt.js";
export * from "./core/config.js";
