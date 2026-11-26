import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";

describe("settle()", () => {
    const asking = `<div nm-scope="{}"><button id="b" nm-on-click="$get('/y')"></button></div>`;

    const swap = async (answer, html = `<div id="target" class="t"><span>old</span></div>`) => {
        const page = await mount(button(`$get('/x')`) .replace(`<div id="target">old</div>`, html), {
            server: () => answer,
        });
        page.$("#b").click();
        await page.settle();
        return page;
    };

    const button = (call, scope = "{}") => `
        <div id="d" nm-scope="${scope}"><button id="b" nm-on-click="${call}"></button></div>
        <div id="target">old</div>
    `;

    it("fails with the requests still pending once it times out", async () => {
        const page = await mount(asking, { server: () => new Promise(() => {}) });
        page.$("#b").click();
        await expect(page.settle(100)).rejects.toThrow("settle() timed out waiting for: GET http://localhost/y");
    });

    it("fails when the page fetched with no server", async () => {
        const page = await mount(asking);
        page.$("#b").click();
        await expect(page.settle()).rejects.toThrow("fetched with no server: GET http://localhost/y");
    });

    it("is waited for by settle() however slowly the answer comes", async () => {
        const later = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));
        const encoder = new TextEncoder();
        const body = new ReadableStream({
            async pull(controller) {
                controller.enqueue(encoder.encode(await later(50, `<div id="target">new</div>`)));
                controller.close();
            },
        });
        const page = await swap(later(50, new Response(body)));
        expect(page.$("#target").textContent).toBe("new");
    });
});
