import { authorize } from "./operation-service.js";
import { Router, type Request } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { z } from "zod";
import { auth } from "./auth.js";
import { tenant, assert, rate, type Context, type Actor } from "./service.js";
import { materialQuerySchema } from "../shared/materials.js";
import {
  searchMaterials,
  saveSearch,
  favorite,
  createList,
  saveListItem,
  saveOffer,
  readMaterials,
  deleteMaterial,
} from "./material-service.js";
import { validateCatalogQuery } from "./catalog.js";
import { configuredSearchProvider } from "./search-providers.js";
import { locationById } from "./locations.js";
export const materialRouter = Router({ mergeParams: true });
async function user(req: Request) {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });
  assert(session, "Entre na sua conta para continuar", 401);
  return session.user as Actor;
}
async function access(
  req: Request,
  permission: string,
  fn: (c: Context) => Promise<any>,
  write = false,
) {
  return tenant(
    await user(req),
    String(req.params.company),
    permission,
    (c) => {
      authorize(c, "purchases", write);
      return fn(c);
    },
    write,
  );
}
const endpoint =
  (fn: (req: Request) => Promise<any>) =>
  (req: Request, res: any, next: any) => {
    void fn(req)
      .then((v) => res.json(v))
      .catch(next);
  };
materialRouter.get(
  "/",
  endpoint((req) => access(req, "read", readMaterials)),
);
materialRouter.get(
  "/status",
  endpoint((req) =>
    access(req, "read", async () => ({
      configured: !!configuredSearchProvider(),
      provider: configuredSearchProvider()?.id ?? null,
      storageAllowed: process.env.BRAVE_STORAGE_RIGHTS === "true",
      radiusSupported: false,
      marketplaces: { mercadoLivre: "search-link", amazon: "search-link" },
    })),
  ),
);
materialRouter.post(
  "/search",
  endpoint(async (req) => {
    const b = z
      .object({
        query: materialQuerySchema,
        refresh: z.boolean().default(false),
      })
      .parse(req.body);
    locationById(b.query.cityId, b.query.state);
    await validateCatalogQuery(b.query);
    await access(
      req,
      "write",
      async (c) => {
        await rate(
          c.tx,
          `materials-search:${c.companyId}`,
          Number(process.env.SEARCH_COMPANY_HOURLY_LIMIT ?? 30),
          3600,
        );
        await rate(c.tx, `materials-search-user:${c.userId}`, 20, 3600);
      },
      true,
    );
    const result = await searchMaterials(
      b.query,
      String(req.params.company),
      b.refresh,
    );
    await access(req, "read", async () => true);
    return result;
  }),
);
materialRouter.post(
  "/searches",
  endpoint((req) =>
    access(
      req,
      "write",
      async (c) => {
        await rate(c.tx, `materials-save:${c.userId}`, 100, 3600);
        return saveSearch(c, req.body);
      },
      true,
    ),
  ),
);
materialRouter.post(
  "/favorites",
  endpoint((req) => access(req, "write", (c) => favorite(c, req.body), true)),
);
materialRouter.post(
  "/lists",
  endpoint((req) => access(req, "write", (c) => createList(c, req.body), true)),
);
materialRouter.post(
  "/lists/:list/items",
  endpoint((req) =>
    access(
      req,
      "write",
      (c) => saveListItem(c, String(req.params.list), req.body),
      true,
    ),
  ),
);
materialRouter.put(
  "/lists/:list/items/:id",
  endpoint((req) =>
    access(
      req,
      "write",
      (c) =>
        saveListItem(
          c,
          String(req.params.list),
          req.body,
          String(req.params.id),
          z.number().int().positive().parse(req.body.version),
        ),
      true,
    ),
  ),
);
materialRouter.post(
  "/offers",
  endpoint((req) => access(req, "write", (c) => saveOffer(c, req.body), true)),
);
materialRouter.delete(
  "/:kind/:id",
  endpoint((req) =>
    access(
      req,
      "write",
      (c) =>
        deleteMaterial(
          c,
          z
            .enum(["searches", "favorites", "lists", "items", "offers"])
            .parse(req.params.kind),
          String(req.params.id),
        ),
      true,
    ),
  ),
);
