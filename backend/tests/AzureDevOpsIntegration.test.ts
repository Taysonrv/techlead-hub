import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import axios, { AxiosError } from "axios";
import { azureDevOpsConfiguration } from "../src/services/AzureDevOpsClient";
import { azureFailure } from "../src/services/AzureDevOpsResponse";
import { AzureDevOpsService } from "../src/services/AzureDevOpsService";
import { AzureWorkItemService } from "../src/services/AzureWorkItemService";
import { checkAzureMonthlyAccess } from "../src/services/AzureDevOpsHistoricalCheckService";
import { systemConfigurationService } from "../src/services/SystemConfigurationService";
import { AZURE_WORK_ITEM_FIELDS } from "../src/services/AzureWorkItemMapper";
import { CorrectionMonthlyReportService } from "../src/services/CorrectionMonthlyReportService";
import { prisma } from "../src/database/prisma";

function environment(t: TestContext) {
  const names = ["AZURE_DEVOPS_ORGANIZATION", "AZURE_DEVOPS_PROJECT", "AZURE_DEVOPS_PAT", "AZURE_DEVOPS_WIKI"];
  const previous = names.map(name => process.env[name]);
  Object.assign(process.env, { AZURE_DEVOPS_ORGANIZATION: "integration-test", AZURE_DEVOPS_PROJECT: "SIMER", AZURE_DEVOPS_PAT: "test-only", AZURE_DEVOPS_WIKI: "" });
  t.after(() => names.forEach((name, index) => { if (previous[index] === undefined) delete process.env[name]; else process.env[name] = previous[index]; }));
}

function loginRedirect() {
  return new AxiosError("DO-NOT-PRINT", undefined, undefined, undefined, { status: 302, data: "DO-NOT-PRINT",
    headers: { location: "https://app.vssps.visualstudio.com/_signin?context=DO-NOT-PRINT" } } as any);
}

test("URLs Azure copiadas viram nomes canônicos e projetos de outra organização são recusados", t => {
  environment(t);
  const modern = azureDevOpsConfiguration({ organization: "https://dev.azure.com/example/", project: "https://dev.azure.com/example/Suporte%20SIMER/_workitems" });
  assert.equal(modern.organization, "example"); assert.equal(modern.project, "Suporte SIMER");
  const legacy = azureDevOpsConfiguration({ organization: "https://example.visualstudio.com", project: "https://example.visualstudio.com/DefaultCollection/SIMER" });
  assert.equal(legacy.organization, "example"); assert.equal(legacy.project, "SIMER");
  process.env.AZURE_DEVOPS_ORGANIZATION = "https://dev.azure.com/example";
  process.env.AZURE_DEVOPS_PROJECT = "https://dev.azure.com/example/Suporte%20SIMER";
  const web = new AzureWorkItemService() as any;
  assert.equal(web.buildAzureWebUrl(1), "https://dev.azure.com/example/Suporte%20SIMER/_workitems/edit/1/");
  assert.throws(() => azureDevOpsConfiguration({ organization: "example", project: "https://dev.azure.com/other/SIMER" }), /outra organização/);
  assert.throws(() => azureDevOpsConfiguration({ organization: "https://untrusted.invalid/example" }), /não identifica/);
});

test("redirecionamento ao login identifica autenticação sem revelar Location ou corpo", () => {
  const failure = azureFailure(loginRedirect());
  assert.equal(failure.code, "authentication"); assert.equal(failure.requiresConfiguration, true); assert.equal(failure.httpStatus, 302);
  assert.match(failure.message, /autenticação interativa/); assert.doesNotMatch(JSON.stringify(failure), /DO-NOT-PRINT|app\.vssps|context=/);
});

test("sincronização rejeita HTML em WIQL, batch e Task e não transforma login em carteira vazia", async t => {
  environment(t);
  t.mock.method(axios, "create", () => ({ get: async () => ({ data: "<html>Login</html>", status: 200 }), post: async () => ({ data: "<html>Login</html>", status: 200 }) }));
  const service = new AzureDevOpsService();
  await assert.rejects(service.discoverSupportedWorkItemIds(), /Resposta inválida.*WIQL/);
  await assert.rejects(service.getWorkItemsBatch([1]), /Resposta inválida.*lote/);
  await assert.rejects(service.getWorkItem(1), /Resposta inválida.*Work Item/);
  const status = await service.getStatus();
  assert.equal(status.configured, true, "Work Items não exige Wiki configurada");
  assert.equal(status.workItemsAvailable, false); assert.match(status.workItemsError!, /HTML/);
});

test("cliente de sincronização usa PAT atualizado e a mesma política de API do report", async t => {
  environment(t);
  const settings: any[] = [];
  t.mock.method(axios, "create", (configuration: any) => {
    settings.push(configuration); return { get: async () => ({ data: { id: 1, fields: {} } }) };
  });
  const service = new AzureDevOpsService();
  await service.getWorkItem(1);
  process.env.AZURE_DEVOPS_PAT = "replacement-test-only";
  await service.getWorkItem(1);
  assert.equal(settings.length, 2); assert.notEqual(settings[0].headers.Authorization, settings[1].headers.Authorization);
  for (const config of settings) { assert.equal(config.maxRedirects, 0); assert.equal(config.headers["X-TFS-FedAuthRedirect"], "Suppress"); }
});

test("teste de conexão atual funciona sem preencher novamente organização, projeto ou PAT", async t => {
  environment(t);
  t.mock.method(systemConfigurationService, "loadIntoEnvironment", async () => new Set(["pat"]));
  const post = t.mock.method(axios, "post", async (_url, _body, configuration: any) => {
    assert.equal(configuration.headers["X-TFS-FedAuthRedirect"], "Suppress"); return { data: { workItems: [] } };
  });
  const result = await systemConfigurationService.test({ integration: "azure" }) as { azure: { ok: boolean; credentialSource: string } };
  assert.equal(post.mock.callCount(), 1); assert.equal(result.azure.ok, true); assert.equal(result.azure.credentialSource, "central");
});

test("alterar organização/projeto sem trocar PAT exige validar antes de gravar", async t => {
  environment(t);
  t.mock.method(systemConfigurationService, "loadIntoEnvironment", async () => new Set());
  const validate = t.mock.method(systemConfigurationService, "validateAzureCandidate", async () => { throw new Error("Candidato rejeitado"); });
  await assert.rejects(systemConfigurationService.save({ project: "Outra carteira" }, 1), /Candidato rejeitado/);
  assert.equal(validate.mock.callCount(), 1); assert.equal(process.env.AZURE_DEVOPS_PROJECT, "SIMER");
});

const definitions = [AZURE_WORK_ITEM_FIELDS.client, AZURE_WORK_ITEM_FIELDS.criticality, AZURE_WORK_ITEM_FIELDS.prioritized].map(referenceName => ({ referenceName }));
const candidate = { organization: "example", project: "SIMER", pat: "test-only" };

test("teste histórico consulta amostras de Reporting, WIQL e dois snapshots com os cortes de São Paulo", async t => {
  const photographs: any[] = [];
  const queries: string[] = [];
  t.mock.method(axios, "create", () => ({
    get: async (url: string) => ({ data: url.endsWith("/fields") ? { value: definitions } : { values: [{ id: 10 }] } }),
    post: async (url: string, body: any, options: any) => {
      if (url.endsWith("/wiql")) { assert.equal(options.params.timePrecision, true); queries.push(body.query); return { data: { workItems: [{ id: 10 }] } }; }
      photographs.push(body); return { data: { value: [{ id: 10, fields: { "System.State": "Qualidade" } }] } };
    },
  }));
  const result = await checkAzureMonthlyAccess(candidate, "2026-09");
  assert.equal(result.ok, true); assert.equal(result.checks.length, 7);
  assert.deepEqual(photographs.map(body => body.asOf).sort(), ["2026-09-01T02:59:59.999Z", "2026-10-01T02:59:59.999Z"]);
  assert.ok(queries.every(query => query.includes("Correção Clientes")));
  assert.doesNotMatch(queries[0], /<> 'Registro'/); assert.doesNotMatch(queries[1], /System.State/);
  assert.match(result.note, /amostra.*homologação/);
});

test("falha de Reporting aparece no teste histórico e impede cascata de snapshots com credencial recusada", async t => {
  const post = t.mock.fn(async () => ({ data: { workItems: [{ id: 10 }] } }));
  t.mock.method(axios, "create", () => ({ post, get: async (url: string) => {
    if (url.endsWith("/fields")) return { data: { value: definitions } }; throw loginRedirect();
  } }));
  const result = await checkAzureMonthlyAccess(candidate, "2026-09");
  assert.equal(result.ok, false); assert.equal(post.mock.callCount(), 2);
  assert.equal(result.checks.find(check => check.key === "revisions")?.status, "failed");
  assert.equal(result.checks.find(check => check.key === "closingSnapshot")?.status, "skipped");
});

test("relatório para na primeira recusa de autenticação e conserva a prévia local", async t => {
  const originalFind = prisma.azureWorkItem.findMany;
  const originalQuery = prisma.$queryRaw;
  prisma.azureWorkItem.findMany = (async () => [{ id: 1, title: "Correção simulada", client: "COAP", createdByName: "Tayson Araujo", azureCreatedAt: new Date("2026-09-10T12:00:00Z"), state: "Qualidade", stateChangedAt: new Date("2026-09-11T12:00:00Z") }]) as typeof originalFind;
  prisma.$queryRaw = (async () => []) as typeof originalQuery;
  t.after(() => { prisma.azureWorkItem.findMany = originalFind; prisma.$queryRaw = originalQuery; });
  const service = new CorrectionMonthlyReportService();
  t.mock.method(service, "loadClosing", async () => null);
  t.mock.method(service, "workItemUrl", () => null);
  t.mock.method(service, "resolveFields", async () => { throw loginRedirect(); });
  const forbidden = ["workItemIdsAsOf", "revisions", "snapshots", "recoverHistoricalSnapshots"].map(method => t.mock.method(service, method, async () => { throw new Error("Consulta desnecessária"); }));
  const report = await (service as any).build("2026-09");
  for (const call of forbidden) assert.equal(call.mock.callCount(), 0);
  assert.equal(report.rows[0].id, 1); assert.equal(report.cards.registered, 1);
  assert.equal(report.quality.azureConnection.status, "blocked"); assert.equal(report.quality.azureConnection.code, "authentication");
  assert.equal(report.quality.historicalMetricsReliable, false);
});

test("conexão bloqueada pausa tentativas automáticas e Recarregar permite nova autenticação", async t => {
  const service = new CorrectionMonthlyReportService();
  const internals = CorrectionMonthlyReportService as any;
  const month = "2026-02";
  for (const key of ["reportCache", "retryAfter", "inFlight"]) internals[key].delete(month);
  t.after(() => { for (const key of ["reportCache", "retryAfter", "inFlight"]) internals[key].delete(month); });
  const blocked = { rows: [{ id: 1 }], quality: { historicalMetricsReliable: false, azureConnection: { status: "blocked" } } };
  internals.reportCache.set(month, { expiresAt: 0, data: blocked });
  t.mock.method(service, "saveClosing", async () => undefined);
  const build = t.mock.method(service, "build", async () => ({ rows: [{ id: 1 }, { id: 2 }], quality: { historicalMetricsReliable: true, azureConnection: { status: "ready" } } }));
  const initial = await service.getPreview(month) as any;
  assert.equal(build.mock.callCount(), 0); assert.equal(initial.quality.refreshing, false); assert.equal(initial.quality.nextHistoryRetryAt, undefined);
  await service.getPreview(month, true); await internals.inFlight.get(month);
  assert.equal(build.mock.callCount(), 1);
  assert.equal((await service.getPreview(month) as any).quality.historicalMetricsReliable, true);
});

test("Recarregar ignora campos em cache mesmo quando o ambiente usa uma URL Azure", async t => {
  environment(t);
  process.env.AZURE_DEVOPS_ORGANIZATION = "https://dev.azure.com/normalized-cache-test";
  let values = definitions;
  const get = t.mock.fn(async () => ({ data: { value: values } }));
  t.mock.method(axios, "create", () => ({ get }));
  const service = new CorrectionMonthlyReportService() as any;
  assert.equal((await service.resolveFields()).urgency, AZURE_WORK_ITEM_FIELDS.criticality);
  values = [...definitions.filter(field => field.referenceName !== AZURE_WORK_ITEM_FIELDS.criticality), { referenceName: "Custom.NovaCriticidade", name: "Criticidade" }];
  assert.equal((await service.resolveFields()).urgency, AZURE_WORK_ITEM_FIELDS.criticality);
  service.invalidateMonth("2026-09");
  assert.equal((await service.resolveFields()).urgency, "Custom.NovaCriticidade");
  assert.equal(get.mock.callCount(), 2);
});
