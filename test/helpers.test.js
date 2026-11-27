import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";

describe("$dispatch", () => {
    it("$dispatch sends a bubbling event from the element", async () => {
        const page = await mount(`
            <div n-scope="{ got: null }" n-on-hello="got = e.detail">
                <button id="b" n-on-click="$dispatch('hello', 'world')"></button>
            </div>
        `);
        page.$("#b").click();
        expect(page.scope("#b").got).toBe("world");
    });

    it("dispatches from the scope's element after an await", async () => {
        const page = await mount(`
            <div id="d" n-scope="{ got: null }" n-on-ping="got = e.detail">
                <button id="b" n-on-click="await 0; $dispatch('ping', 1)"></button>
            </div>
        `);
        page.$("#b").click();
        await page.settle();
        expect(page.$("#d").nagiProxy.got).toBe(1);
    });
});

describe("$dataset", () => {
    it("$dataset merges data-* from the element up to the page, the nearest winning", async () => {
        const page = await mount(`
            <div data-a="outside">
                <div n-scope="{ got: null }" data-a="scope" data-b="scope">
                    <p data-b="p">
                        <button id="b" data-c="button" n-on-click="got = $dataset()"></button>
                    </p>
                </div>
            </div>
        `);
        page.$("#b").click();
        expect({ ...page.scope("#b").got }).toEqual({ a: "scope", b: "p", c: "button" });
    });

    it("gives the scope's data-* from $dataset() after an await", async () => {
        const page = await mount(
            `<div n-scope="{}" data-from="scope">
                <button id="b" n-on-click="await 0; $get('/x', $dataset())"></button>
            </div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(new URL(page.requests[0].url).searchParams.get("from")).toBe("scope");
    });
});

describe("$persist", () => {
    it("$persist saves a member to localStorage as it changes", async () => {
        const page = await mount(`
            <div id="d" n-scope="{ n: 1 }" n-on-init="$persist('n')"></div>
        `);
        expect(page.window.localStorage["_nagiProp-n"]).toBe("1");

        page.$("#d").nagiProxy.n = 5;
        expect(page.window.localStorage["_nagiProp-n"]).toBe("5");
    });

    it("$persist restores what was saved before the page loaded", async () => {
        const page = await mount(
            `<div id="d" n-scope="{ n: 1 }" n-on-init="$persist('n')"></div>`,
            { beforeInit: (window) => (window.localStorage["_nagiProp-n"] = "7") },
        );
        expect(page.$("#d").nagiProxy.n).toBe(7);
    });

    it("$persist takes the storage key as its second argument", async () => {
        const page = await mount(
            `<div id="d" n-scope="{ n: 1 }" n-on-init="$persist('n', 'count')"></div>`,
            { beforeInit: (window) => (window.localStorage.count = "3") },
        );
        expect(page.$("#d").nagiProxy.n).toBe(3);
    });
});
