import "dotenv/config";
import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { testDatabaseUrls } from "@/config/env";

const accounts: { userId: string; organizationId: string }[] = [];
test.afterAll(async () => {
    const url = testDatabaseUrls().admin;
    if (new URL(url).pathname !== "/hawkdot_test") throw new Error("Limpeza E2E restrita a hawkdot_test");
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    try {
        for (const account of accounts) {
            await client.query("DELETE FROM hawkdot.organizations WHERE id = $1", [account.organizationId]);
            await client.query("DELETE FROM hawkdot.users WHERE id = $1", [account.userId]);
        }
    } finally { await client.end(); }
});

async function signup(page: Page) {
    const id = randomUUID().slice(0, 8);
    const email = `qa-${id}@example.test`;
    const password = "Qa-Teste-2026!";
    await page.goto("/signup");
    await page.getByLabel("Seu nome").fill("Pessoa QA");
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByLabel("Nome da organização").fill(`QA ${id}`);
    const responsePromise = page.waitForResponse((res) => res.url().endsWith("/api/auth/signup"));
    await page.getByRole("button", { name: "Criar organização", exact: true }).click();
    const response = await responsePromise;
    expect(response.status()).toBe(201);
    const created = await response.json();
    accounts.push({ userId: created.user.id, organizationId: created.organization.id });
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel("E-mail").fill(email);
    await page.getByLabel("Senha", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
    return { email, password };
}

test("HTTPS: cadastro, recurso, check real, polling preserva edição, pausa, exclusão e logout", async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await signup(page);
    await expect(page.getByText("Nenhum monitor ativo", { exact: true })).toBeVisible();
    await expect(page.getByText("Uptime geral")).toHaveCount(0);
    await page.goto("/resources");
    await page.getByRole("button", { name: "Novo recurso" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Endpoint", exact: true }).click();
    await dialog.getByLabel("Nome de exibição").fill("Endpoint QA HTTPS");
    await dialog.getByLabel("URL", { exact: true }).fill("https://127.0.0.1:3443/slow");
    await dialog.getByRole("button", { name: "Criar recurso" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Endpoint QA HTTPS", { exact: true })).toBeVisible();
    await page.goto("/monitors/new");
    await page.getByLabel("Recurso monitorado").selectOption({ label: "Endpoint QA HTTPS" });
    await page.getByLabel("Nome do monitor").fill("HTTPS QA lento");
    await page.getByLabel("URL", { exact: true }).fill("https://127.0.0.1:3443/slow");
    await page.getByRole("button", { name: "Criar monitor" }).click();
    await expect(page).toHaveURL(/\/monitors\/[0-9a-f-]+$/);
    const monitorUrl = page.url();
    const id = monitorUrl.split("/").at(-1)!;
    await page.getByLabel("Nome do monitor").fill("Edição preservada");
    await expect(page.getByRole("region", { name: "Última checagem" }).getByText("HTTP 200", { exact: true })).toBeVisible({ timeout: 45_000 });
    await expect(page.getByLabel("Nome do monitor")).toHaveValue("Edição preservada");
    await page.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByRole("status")).toHaveText("Alterações salvas.");
    await page.getByRole("button", { name: "Pausar", exact: true }).click();
    await expect(page.getByText("Pausado", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Reativar", exact: true }).click();
    await expect(page.getByRole("button", { name: "Pausar", exact: true })).toBeVisible();
    const details = await (await page.request.get(`/api/monitors/${id}`)).json();
    expect(details.last_execution.response_time_ms).toBeGreaterThan(5000);
    expect(details.last_check_at).toBeTruthy();
    expect(details.last_execution).not.toHaveProperty("details");
    await page.screenshot({ path: testInfo.outputPath("monitor-real.png"), fullPage: true });
    if (testInfo.project.name === "mobile") {
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    }
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Excluir", exact: true }).click();
    await expect(page).toHaveURL(/\/monitors$/);
    await page.goto("/resources");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Excluir" }).click();
    await expect(page.getByText("Nenhum recurso encontrado.")).toBeVisible();
    if (testInfo.project.name === "mobile") await page.getByRole("button", { name: "Abrir menu" }).click();
    await page.getByRole("button", { name: "Sair", exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
    expect(errors).toEqual([]);
});

test("erros visíveis, validação SSL, modal por teclado e sessão expirada", async ({ page }) => {
    await signup(page);
    const resourceResponse = await page.request.post("/api/resources/domains", { data: { display_name: "Domínio QA", fqdn: "example.test" } });
    expect(resourceResponse.status()).toBe(201);
    await page.goto("/resources");
    await page.getByRole("button", { name: "Novo recurso" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Novo recurso" })).toBeFocused();
    await page.goto("/monitors/new");
    await page.getByRole("button", { name: "SSL", exact: true }).click();
    await page.getByLabel("Recurso monitorado").selectOption({ label: "Domínio QA" });
    await page.getByLabel("Nome do monitor").fill("SSL QA");
    await page.getByLabel("Hostname", { exact: true }).fill("example.test");
    const warnings = page.getByLabel("Avisar", { exact: false });
    await warnings.fill("");
    await warnings.pressSequentially("30, 14, 7");
    await expect(warnings).toHaveValue("30, 14, 7");
    await page.getByRole("button", { name: "Criar monitor" }).click();
    await expect(page).toHaveURL(/\/monitors\/[0-9a-f-]+$/);
    const endpoint = `/api/monitors/${page.url().split("/").at(-1)}`;
    await page.route(`**${endpoint}`, async (route) => {
        if (route.request().method() === "PATCH") await route.fulfill({ status: 403, json: { error: { code: "FORBIDDEN", message: "Sem permissão para pausar." } } });
        else await route.continue();
    });
    await page.getByRole("button", { name: "Pausar", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Sem permissão para pausar." })).toBeVisible();
    await page.unroute(`**${endpoint}`);
    await page.context().clearCookies();
    await page.getByRole("button", { name: "Pausar", exact: true }).click();
    await expect(page).toHaveURL(/\/login/);
});

test("busca em todas as páginas, filtros e recuperação de erro de carregamento", async ({ page }, testInfo) => {
    await signup(page);
    const resource = await (await page.request.post("/api/resources/domains", { data: { display_name: "Recurso da busca", fqdn: "search.example.test" } })).json();
    for (let i = 0; i < 21; i++) {
        const response = await page.request.post("/api/monitors", { data: {
            resource_id: resource.id, monitor_type: "http", name: `Monitor pagina ${String(i).padStart(2, "0")}`,
            config: { url: "https://127.0.0.1:3443/" },
        } });
        expect(response.status()).toBe(201);
    }
    await page.goto("/monitors");
    await expect(page.getByText("Página 1 de 2")).toBeVisible();
    await page.getByRole("button", { name: "Próxima", exact: true }).click();
    await expect(page.getByText("Página 2 de 2")).toBeVisible();
    await page.getByLabel("Buscar monitores").fill("PAGINA 20");
    await expect(page.getByRole("link", { name: /Monitor pagina 20/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Monitor pagina 00/ })).toHaveCount(0);
    await page.getByLabel("Buscar monitores").fill("");
    await page.getByRole("combobox").first().selectOption("ssl");
    await expect(page.getByText("Nenhum monitor encontrado.")).toBeVisible();
    await page.getByRole("combobox").first().selectOption("http");
    await expect(page.getByText("Página 1 de 2")).toBeVisible();
    if (testInfo.project.name === "mobile") {
        expect((await page.getByLabel("Buscar monitores").boundingBox())!.width).toBeGreaterThan(250);
    }
    await page.screenshot({ path: testInfo.outputPath("monitor-list.png"), fullPage: true });
    let fail = true;
    await page.route("**/api/resources?**", async (route) => {
        if (fail) await route.fulfill({ status: 503, json: { error: { code: "SERVICE_UNAVAILABLE", message: "Serviço temporariamente indisponível." } } });
        else await route.continue();
    });
    await page.goto("/resources");
    await expect(page.getByText("Serviço temporariamente indisponível.")).toBeVisible();
    fail = false;
    await page.getByRole("button", { name: "Tentar novamente" }).click();
    await expect(page.getByText("Recurso da busca", { exact: true })).toBeVisible();
    await page.getByLabel("Buscar recursos").fill("DA BUSCA");
    await expect(page.getByText("Recurso da busca", { exact: true })).toBeVisible();
});
