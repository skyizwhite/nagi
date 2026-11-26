import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";

describe("nm-ref", () => {
    const swapOnce = async (page) => {
        page.$("#b").click();
        await page.settle();
    };

    it("puts the element in its scope's $refs", async () => {
        const page = await mount(`
            <div id="d" nm-scope="{}"><input nm-ref="field" id="i"></div>
        `);
        expect(page.$("#d").nmProxy.$refs.field).toBe(page.$("#i"));
    });

    it("forgets the $refs of the children it removes", async () => {
        const page = await mount(
            `<div id="target" nm-scope="{}">
                <button id="b" nm-on-click="$get('/x')"></button>
                <input nm-ref="box">
            </div>`,
            { server: () => `<div id="target" nm-swap="inner"><button id="b2"></button></div>` },
        );
        await swapOnce(page);
        expect(page.$("#target").nmProxy.$refs.box).toBeUndefined();
    });

    it("keeps a ref the new children set under the same name", async () => {
        const page = await mount(
            `<div id="target" nm-scope="{}">
                <button id="b" nm-on-click="$get('/x')"></button>
                <input nm-ref="box">
            </div>`,
            { server: () => `<div id="target" nm-swap="inner"><input id="new" nm-ref="box"></div>` },
        );
        await swapOnce(page);
        expect(page.$("#target").nmProxy.$refs.box).toBe(page.$("#new"));
    });
});
