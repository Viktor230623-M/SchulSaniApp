import type { NextFunction, Request, RequestHandler, Response } from "express";
import { z } from "@workspace/api-zod";

export interface ValidationSchemas {
  body?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  params?: z.ZodTypeAny;
}

/**
 * Validiert req.body/query/params gegen Zod-Schemas und schreibt die
 * bereinigten Werte zurueck. Fehler werden als strukturierte 400-Antwort
 * zurueckgegeben statt als Exception geworfen. safeParse-Semantik: nur die
 * Zod-Probleme landen hier, alles andere geht unveraendert an den Error-Handler.
 */
export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) (req as { query: unknown }).query = schemas.query.parse(req.query);
      if (schemas.params) (req as { params: unknown }).params = schemas.params.parse(req.params);
      next();
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({
          error: "Validation failed",
          details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        });
        return;
      }
      next(err);
    }
  };
}
