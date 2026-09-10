import { Router } from "./core/router.js";
import { healthRoute as publicHealthRoute } from "./routes/v1/public/health.js";
import { healthRoute as appHealthRoute } from "./routes/v1/app/health.js";
import { pushRoute } from "./routes/v1/app/sync/push.js";
import { pullRoute } from "./routes/v1/app/sync/pull.js";

export function createRouter(): Router {
  const router = new Router();
  router.register(publicHealthRoute);
  router.register(appHealthRoute);
  router.register(pushRoute);
  router.register(pullRoute);
  return router;
}

export { Router } from "./core/router.js";
export * from "./core/types.js";
export * from "./core/errors.js";
export * from "./core/jwt.js";
export * from "./core/config.js";
export * from "./core/emissionJetonApplication.js";
export * from "./core/storeServeur.js";
