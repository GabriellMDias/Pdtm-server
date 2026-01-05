import crypto from "crypto";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import pgClient from "../database/db";

function sha256(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function stableStringify(body: any) {
  return JSON.stringify(body);
}

type IdemRow = {
  request_hash: string;
  status: "in_progress" | "completed" | "failed";
  response_code: number | null;
  response_body: any | null;
};

export function withIdempotency(options: {
  endpoint: string;
  headerName?: string;
  allowRetryOnFailed?: boolean;
}): (handler: RequestHandler) => RequestHandler {
  const headerName = options.headerName ?? "X-Idempotency-Key";
  const allowRetryOnFailed = options.allowRetryOnFailed ?? true;

  return (handler: RequestHandler) => {
    return async (req: Request, res: Response, next: NextFunction) => {
      const idemKey = String(req.header(headerName) || "").trim();
      if (!idemKey) {
        return res.status(400).json({ error: `Missing ${headerName}` });
      }

      const requestHash = sha256(stableStringify(req.body));
      const endpoint = options.endpoint;

      try {
        // 1) tenta criar o registro como in_progress
        const insert = await pgClient.query(
          `
          INSERT INTO pdtconnect.api_idempotency (endpoint, idem_key, request_hash, status, created_at, updated_at)
          VALUES ($1, $2, $3, 'in_progress', now(), now())
          ON CONFLICT (endpoint, idem_key) DO NOTHING
          `,
          [endpoint, idemKey, requestHash]
        );

        if (insert.rowCount === 0) {
          // já existe, checa estado
          const existing = await pgClient.query(
            `
            SELECT request_hash, status, response_code, response_body
            FROM pdtconnect.api_idempotency
            WHERE endpoint = $1 AND idem_key = $2
            `,
            [endpoint, idemKey]
          );

          const row: IdemRow | undefined = existing.rows?.[0];
          if (!row) {
            return res.status(500).json({ error: "Idempotency row missing" });
          }

          if (row.request_hash !== requestHash) {
            return res.status(409).json({
              error: "Idempotency key reused with different payload",
            });
          }

          if (row.status === "completed") {
            return res.status(row.response_code ?? 200).json(row.response_body);
          }

          if (row.status === "in_progress") {
            return res.status(202).json({ status: "processing", idemKey });
          }

          // failed
          if (!allowRetryOnFailed) {
            return res.status(500).json({ error: "Previous attempt failed" });
          }

          await pgClient.query(
            `
            UPDATE pdtconnect.api_idempotency
            SET status = 'in_progress', updated_at = now()
            WHERE endpoint = $1 AND idem_key = $2
            `,
            [endpoint, idemKey]
          );
        }

        // 2) executa o handler original, capturando a resposta
        const originalJson = res.json.bind(res);
        const originalSend = res.send.bind(res);
        const originalStatus = res.status.bind(res);

        let responseCode = 200;
        let responseBody: any = undefined;

        (res as any).status = (code: number) => {
          responseCode = code;
          return originalStatus(code);
        };

        (res as any).json = (body: any) => {
          responseBody = body;
          return originalJson(body);
        };

        (res as any).send = (body: any) => {
          responseBody = body;
          return originalSend(body);
        };

        await handler(req, res, next);

        if (responseBody === undefined) return;

        // 3) grava conclusão para replay
        await pgClient.query(
          `
          UPDATE pdtconnect.api_idempotency
          SET status = 'completed',
              response_code = $3,
              response_body = $4::jsonb,
              updated_at = now()
          WHERE endpoint = $1 AND idem_key = $2
          `,
          [endpoint, idemKey, responseCode, JSON.stringify(responseBody)]
        );
      } catch (e) {
        // best effort: marca failed
        try {
          await pgClient.query(
            `
            UPDATE pdtconnect.api_idempotency
            SET status = 'failed', response_code = 500, response_body = $3::jsonb, updated_at = now()
            WHERE endpoint = $1 AND idem_key = $2
            `,
            [
              options.endpoint,
              String(req.header(headerName) || "").trim(),
              JSON.stringify({ error: "internal_error" }),
            ]
          );
        } catch {}

        return res.status(500).json({ error: "internal_error" });
      }
    };
  };
}
