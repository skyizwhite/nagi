import { describe, expect, it, vi } from "vitest";
import { mount } from "./helpers.js";

const mountAsking = (answer, extra = "") =>
    mount(
        `<div nm-scope="{ _err: null, _redirect: null }" nm-on-fetcherr="_err = e.detail" nm-on-fetchredirect="_redirect = e.detail.url">
            <button id="b" nm-on-click="$post('/x')"></button>
            ${extra}
        </div>
        <div id="target">old</div>`,
        { server: () => answer },
    );

describe("#7 error answers", () => {
    it("swaps an error answer that has elements with ids, and sends no fetcherr", async () => {
        const page = await mountAsking({ status: 422, body: `<div id="target">fix the title</div>` });
        page.$("#b").click();
        await page.settle();
        expect(page.$("#target").textContent).toBe("fix the title");
        expect(page.scope("#b")._err).toBeNull();
    });

    it("sends fetcherr with the error when the request cannot be made", async () => {
        const page = await mountAsking(Promise.reject(new TypeError("offline")));
        page.$("#b").click();
        await page.settle();
        const err = page.scope("#b")._err;
        expect(err.err.message).toBe("offline");
        expect(err.status).toBeUndefined();
    });
});

describe("#8 response headers", () => {
    it("goes to the URL of nm-redirect without swapping, after a fetchredirect event", async () => {
        const page = await mountAsking({ body: `<div id="target">new</div>`, headers: { "nm-redirect": "/done" } });
        const assign = vi.spyOn(page.window.location, "assign").mockImplementation(() => {});
        page.$("#b").click();
        await page.settle();
        expect(page.scope("#b")._redirect).toBe("/done");
        expect(assign).toHaveBeenCalledWith("/done");
        expect(page.$("#target").textContent).toBe("old");
    });

    it("does not go when fetchredirect is cancelled", async () => {
        const page = await mount(
            `<div nm-scope nm-on-fetchredirect="e.preventDefault()"><button id="b" nm-on-click="$post('/x')"></button></div>`,
            { server: () => ({ headers: { "nm-redirect": "/done" } }) },
        );
        const assign = vi.spyOn(page.window.location, "assign").mockImplementation(() => {});
        page.$("#b").click();
        await page.settle();
        expect(assign).not.toHaveBeenCalled();
    });

    it("replaces the page's URL with nm-replace-url after swapping", async () => {
        const page = await mountAsking({ body: `<div id="target">new</div>`, headers: { "nm-replace-url": "/list?page=2" } });
        page.$("#b").click();
        await page.settle();
        expect(page.$("#target").textContent).toBe("new");
        expect(page.window.location.href).toBe("http://localhost/list?page=2");
    });
});
