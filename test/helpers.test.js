import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";

const button = `<div nm-scope="{}"><button id="b" nm-on-click="$get('/y')"></button></div>`;

describe("settle()", () => {
    it("fails with the requests still pending once it times out", async () => {
        const page = await mount(button, { server: () => new Promise(() => {}) });
        page.$("#b").click();
        await expect(page.settle(100)).rejects.toThrow("settle() timed out waiting for: GET http://localhost/y");
    });

    it("fails when the page fetched with no server", async () => {
        const page = await mount(button);
        page.$("#b").click();
        await expect(page.settle()).rejects.toThrow("fetched with no server: GET http://localhost/y");
    });
});
