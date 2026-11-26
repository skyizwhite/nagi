import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";

describe("nm-data-* attributes", () => {
    it("reads a value as JSON, and as the string written when it is not JSON", async () => {
        const page = await mount(`
            <div id="d" nm-data-model="post" nm-data-count="3" nm-data-many="true" nm-data-ids="[1,2]" nm-data-none="null" nm-data-code='"123"'></div>
        `);
        const scope = page.$("#d").nmProxy;
        expect(scope.model).toBe("post");
        expect(scope.count).toBe(3);
        expect(scope.many).toBe(true);
        expect([...scope.ids]).toEqual([1, 2]);
        expect(scope.none).toBeNull();
        expect(scope.code).toBe("123");
    });

    it("never runs a value as code", async () => {
        const page = await mount(`<div id="d" nm-data-x="(() => { window.ran = true })()"></div>`);
        expect(page.window.ran).toBeUndefined();
        expect(page.$("#d").nmProxy.x).toBe("(() => { window.ran = true })()");
    });

    it("keeps a name with a dash as written", async () => {
        const page = await mount(`<div id="d" nm-data-is-open="true"></div>`);
        expect(page.$("#d").nmProxy["is-open"]).toBe(true);
    });

    it("makes a scope its elements bind to, with no nm-data", async () => {
        const page = await mount(`
            <div nm-data-name="Ann"><span id="s" nm-bind-textcontent="name"></span></div>
        `);
        expect(page.$("#s").textContent).toBe("Ann");
    });

    it("adds to and overrides the object of nm-data", async () => {
        const page = await mount(`
            <div id="d" nm-data="{ a: 1, b: 1 }" nm-data-b="2" nm-data-c="3"></div>
        `);
        const scope = page.$("#d").nmProxy;
        expect([scope.a, scope.b, scope.c]).toEqual([1, 2, 3]);
    });
});

describe("nm-fn-* attributes", () => {
    it("adds a function that reads and writes the scope by name", async () => {
        const page = await mount(`
            <div nm-data-count="1" nm-fn-add="(n) => count += n">
                <button id="b" nm-on-click="add(2)"></button>
                <span id="s" nm-bind-textcontent="count"></span>
            </div>
        `);
        page.$("#b").click();
        expect(page.$("#s").textContent).toBe("3");
    });

    it("runs with the scope's element as this", async () => {
        const page = await mount(`<div id="d" data-x="hi" nm-fn-x="this.dataset.x"></div>`);
        expect(page.$("#d").nmProxy.x).toBe("hi");
    });

    it("overrides nm-data-* and nm-data of the same name", async () => {
        const page = await mount(`<div id="d" nm-data="{ v: 1 }" nm-data-v="2" nm-fn-v="v + 1"></div>`);
        expect(page.$("#d").nmProxy.v).toBe(3);
    });

    it("logs a value that does not make an expression, and keeps the rest", async () => {
        const page = await mount(`<div id="d" nm-data-a="1" nm-fn-bad="(" nm-fn-ok="() => a"></div>`);
        const scope = page.$("#d").nmProxy;
        expect(scope.ok()).toBe(1);
        expect(page.errors).toHaveLength(1);
    });
});

describe("nm-data as an expression", () => {
    it("takes a factory that returns an object", async () => {
        const page = await mount(
            `<div id="d" nm-data="make(this)"></div>`,
            { beforeInit: (window) => (window.make = (el) => ({ id: el.id })) },
        );
        expect(page.$("#d").nmProxy.id).toBe("d");
    });

    it("makes an empty scope for an empty value", async () => {
        const page = await mount(`<div id="d" nm-data></div>`);
        expect(typeof page.$("#d").nmProxy.$get).toBe("function");
        expect(page.errors).toEqual([]);
    });

    it("finds the nearest scope from inside nested ones", async () => {
        const page = await mount(`
            <div nm-data-a="outer"><div nm-data-a="inner"><span id="s" nm-bind-textcontent="a"></span></div></div>
        `);
        expect(page.$("#s").textContent).toBe("inner");
    });

    it("stops $dataset at a scope made by nm-data-*", async () => {
        const page = await mount(`
            <div data-outside="x">
                <div nm-data-got="null" data-in="y"><button id="b" nm-on-click="got = $dataset()"></button></div>
            </div>
        `);
        page.$("#b").click();
        expect({ ...page.scope("#b").got }).toEqual({ in: "y" });
    });
});

describe("nm-data-* and nm-fn-*, after review", () => {
    it("keeps a number-like value as the string written when the number would read back differently", async () => {
        const page = await mount(`
            <div id="d" nm-data-version="1.10" nm-data-id="12345678901234567890" nm-data-exp="1e3" nm-data-n="42" nm-data-f="1.5"></div>
        `);
        const scope = page.$("#d").nmProxy;
        expect(scope.version).toBe("1.10");
        expect(scope.id).toBe("12345678901234567890");
        expect(scope.exp).toBe("1e3");
        expect(scope.n).toBe(42);
        expect(scope.f).toBe(1.5);
    });

    it("does not call the scope's functions to make a request's data", async () => {
        const page = await mount(
            `<div nm-data-count="1" nm-fn-add="(n) => count += n">
                <button id="b" nm-on-click="$post('/x')"></button>
            </div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.scope("#b").count).toBe(1);
        expect(page.requests[0].body).toBe("count=1");
    });

    it("keeps a value of the same name when an nm-fn-* does not evaluate", async () => {
        const page = await mount(`<div id="d" nm-data-v="2" nm-fn-v="("></div>`);
        expect(page.$("#d").nmProxy.v).toBe(2);
        expect(page.errors).toHaveLength(1);
    });
});
