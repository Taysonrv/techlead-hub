import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import {
  TeamsWebhookHttpError,
  TeamsWorkflowWebhookService,
} from "../src/services/TeamsWorkflowWebhookService";

const ticket = {
  movideskId: 12345,
  subject: "AGRIQ - teste de alerta",
  client: "Cliente de teste",
  createdDate: new Date("2026-10-22T12:00:00.000Z"),
  urgency: "Alta",
  status: "Novo",
  owner: "Equipe de suporte",
};

function configureEnabled() {
  process.env.TEAMS_ALERTS_ENABLED = "true";
  process.env.TEAMS_WORKFLOW_WEBHOOK_URL = "https://example.invalid/workflow";
  process.env.TEAMS_TICKET_BASE_URL = "https://movidesk.example.invalid";
}

function restoreEnv(t: TestContext) {
  const keys = [
    "TEAMS_ALERTS_ENABLED",
    "TEAMS_WORKFLOW_WEBHOOK_URL",
    "TEAMS_TICKET_BASE_URL",
    "TEAMS_WEBHOOK_TIMEOUT_MS",
  ] as const;
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  t.after(() => {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

test("não envia nada quando os alertas estão desativados", async (t) => {
  restoreEnv(t);
  process.env.TEAMS_ALERTS_ENABLED = "false";
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 200 }));
  await assert.rejects(
    new TeamsWorkflowWebhookService().sendNewTicket(ticket),
    /Alertas Teams desativados/,
  );
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("envia Adaptive Card e retorna status e duração quando o Workflow aceita", async (t) => {
  restoreEnv(t);
  configureEnabled();
  let requestBody: any;
  let redirectMode: RequestRedirect | undefined;
  const fetchMock = t.mock.method(globalThis, "fetch", async (_input: any, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body));
    redirectMode = init?.redirect;
    return new Response(null, { status: 202 });
  });

  const result = await new TeamsWorkflowWebhookService().sendNewTicket(ticket);

  assert.equal(result.status, 202);
  assert.ok(result.durationMs >= 0);
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(redirectMode, "error");
  assert.equal(requestBody.type, "AdaptiveCard");
  assert.equal(requestBody.version, "1.4");
  assert.ok(JSON.stringify(requestBody).includes("https://movidesk.example.invalid/Ticket/Edit/12345"));
});

test("converte HTTP 429 e Retry-After em erro tipado sem expor corpo ou URL", async (t) => {
  restoreEnv(t);
  configureEnabled();
  t.mock.method(globalThis, "fetch", async () =>
    new Response("segredo da resposta", {
      status: 429,
      headers: { "Retry-After": "7" },
    }),
  );

  await assert.rejects(
    new TeamsWorkflowWebhookService().sendNewTicket(ticket),
    (error: unknown) => {
      assert.ok(error instanceof TeamsWebhookHttpError);
      assert.equal(error.status, 429);
      assert.equal(error.retryAfterMs, 7_000);
      assert.equal(error.message, "Teams Workflow respondeu HTTP 429.");
      assert.equal(error.message.includes("segredo"), false);
      assert.equal(error.message.includes("example.invalid"), false);
      return true;
    },
  );
});

test("interpreta Retry-After em formato HTTP-date", async (t) => {
  restoreEnv(t);
  configureEnabled();
  const retryDate = new Date(Date.now() + 30_000);
  t.mock.method(globalThis, "fetch", async () =>
    new Response(null, {
      status: 503,
      headers: { "Retry-After": retryDate.toUTCString() },
    }),
  );

  await assert.rejects(
    new TeamsWorkflowWebhookService().sendNewTicket(ticket),
    (error: unknown) => {
      assert.ok(error instanceof TeamsWebhookHttpError);
      assert.equal(error.status, 503);
      assert.ok(error.retryAfterMs !== null);
      assert.ok(error.retryAfterMs! >= 0 && error.retryAfterMs! <= 30_000);
      return true;
    },
  );
});

test("limita Retry-After a 24 horas e ignora cabeçalho inválido", async (t) => {
  restoreEnv(t);
  configureEnabled();
  t.mock.method(globalThis, "fetch", async () =>
    new Response(null, {
      status: 429,
      headers: { "Retry-After": "9999999" },
    }),
  );
  await assert.rejects(
    new TeamsWorkflowWebhookService().sendNewTicket(ticket),
    (error: unknown) => {
      assert.ok(error instanceof TeamsWebhookHttpError);
      assert.equal(error.retryAfterMs, 24 * 60 * 60_000);
      return true;
    },
  );

});

test("ignora um cabeçalho Retry-After inválido", async (t) => {
  restoreEnv(t);
  configureEnabled();
  t.mock.method(globalThis, "fetch", async () =>
    new Response(null, {
      status: 502,
      headers: { "Retry-After": "amanhã" },
    }),
  );
  await assert.rejects(
    new TeamsWorkflowWebhookService().sendNewTicket(ticket),
    (error: unknown) => {
      assert.ok(error instanceof TeamsWebhookHttpError);
      assert.equal(error.status, 502);
      assert.equal(error.retryAfterMs, null);
      return true;
    },
  );
});

test("recusa endpoints sem HTTPS antes de fazer requisição", async (t) => {
  restoreEnv(t);
  configureEnabled();
  process.env.TEAMS_WORKFLOW_WEBHOOK_URL = "http://example.invalid/workflow";
  const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 200 }));

  await assert.rejects(
    new TeamsWorkflowWebhookService().sendNewTicket(ticket),
    /deve ser HTTPS/,
  );
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("normaliza falhas de rede sem vazar detalhes internos", async (t) => {
  restoreEnv(t);
  configureEnabled();
  t.mock.method(globalThis, "fetch", async () => {
    throw new Error("detalhe interno de transporte");
  });

  await assert.rejects(
    new TeamsWorkflowWebhookService().sendNewTicket(ticket),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, "Falha de rede ao enviar alerta ao Teams.");
      assert.equal(error.message.includes("detalhe interno"), false);
      return true;
    },
  );
});
