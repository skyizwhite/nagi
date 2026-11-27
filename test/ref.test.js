import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";

describe("n-ref", () => {
    const swapOnce = async (page) => {
        page.$("#b").click();
        await page.settle();
    };

    it("puts the element in its scope's $refs", async () => {
        const page = await mount(`
            <div id="d" n-scope="{}"><input n-ref="field" id="i"></div>
        `);
        expect(page.$("#d").nagiProxy.$refs.field).toBe(page.$("#i"));
    });

    it("forgets the $refs of the children it removes", async () => {
        const page = await mount(
            `<div id="target" n-scope="{}">
                <button id="b" n-on-click="$get('/x')"></button>
                <input n-ref="box">
            </div>`,
            { server: () => `<div id="target" n-swap="inner"><button id="b2"></button></div>` },
        );
        await swapOnce(page);
        expect(page.$("#target").nagiProxy.$refs.box).toBeUndefined();
    });

    it("keeps a ref the new children set under the same name", async () => {
        const page = await mount(
            `<div id="target" n-scope="{}">
                <button id="b" n-on-click="$get('/x')"></button>
                <input n-ref="box">
            </div>`,
            { server: () => `<div id="target" n-swap="inner"><input id="new" n-ref="box"></div>` },
        );
        await swapOnce(page);
        expect(page.$("#target").nagiProxy.$refs.box).toBe(page.$("#new"));
    });

    it("warns about an n-ref outside any scope", async () => {
        const page = await mount(`<input id="i" n-ref="field">`);
        expect(page.warnings).toHaveLength(1);
    });
});
