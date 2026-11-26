import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";

describe("scope keys", () => {
    it("lets a bind read a key named like an Object.prototype member", async () => {
        const page = await mount(`
            <div nm-data="{ n: 1 }"><span id="s" nm-bind-text-content="String(hasOwnProperty('n'))"></span></div>
        `);
        expect(page.$("#s").textContent).toBe("true");
        expect(page.errors).toEqual([]);
    });

    it("lets a key named like an Object.prototype member be set and bound", async () => {
        const page = await mount(`
            <div nm-data="{ valueOf: 1 }"><span id="s" nm-bind-text-content="valueOf"></span></div>
        `);
        page.scope("#s").valueOf = 2;
        expect(page.$("#s").textContent).toBe("2");
        expect(page.errors).toEqual([]);
    });
});

describe("nm-form radios", () => {
    it("keeps the checked radio's value when an unchecked one comes after it", async () => {
        const page = await mount(`
            <form id="f" nm-data="{}" nm-form>
                <input type="radio" name="c" value="a" checked>
                <input type="radio" name="c" value="b">
            </form>
        `);
        expect(page.$("#f").nmProxy.c).toBe("a");
    });
});

describe("nm-form radio groups with nothing checked", () => {
    it("still defines the group's key", async () => {
        const page = await mount(`
            <form nm-data="{}" nm-form>
                <input type="radio" name="c" value="a">
                <input type="radio" name="c" value="b">
                <span id="s" nm-bind-text-content="c ?? 'none'"></span>
            </form>
        `);
        expect(page.$("#s").textContent).toBe("none");
        expect(page.errors).toEqual([]);
    });
});

describe("builds without blocks", () => {
    it("debounces in the core build, which has no fetch block", async () => {
        const page = await mount(
            `<div nm-data="{ got: [] }"><input id="i" nm-on-input="$debounce(() => got = [...got, this.value], 30)"></div>`,
            { without: ["template", "form", "fetch", "morph", "helpers", "events"] },
        );
        const input = page.$("#i");
        input.value = "a";
        input.dispatchEvent(new page.window.Event("input"));
        await page.settle();
        expect(page.scope("#i").got).toEqual(["a"]);
        expect(page.errors).toEqual([]);
    });
});

describe("request URLs", () => {
    it("adds no ? when there is nothing to send", async () => {
        const page = await mount(
            `<div nm-data="{}"><button id="b" nm-on-click="$get('/x')"></button></div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.requests[0].url).toBe("http://localhost/x");
    });

    it("adds no & to a URL with a query when there is nothing to send", async () => {
        const page = await mount(
            `<div nm-data="{}"><button id="b" nm-on-click="$get('/x?a=1')"></button></div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.requests[0].url).toBe("http://localhost/x?a=1");
    });
});

describe("what a swap cleans up", () => {
    it("stops the debounce of an element it removed", async () => {
        const page = await mount(
            `<div id="d" nm-data="{ got: [] }">
                <button id="b" nm-on-click="$get('/x')"></button>
                <div id="target"><input id="i" nm-on-input="$debounce(() => got = [...got, 'ran'], 30)"></div>
            </div>`,
            { server: () => `<div id="target"></div>` },
        );
        page.$("#i").dispatchEvent(new page.window.Event("input"));
        page.$("#b").click();
        await page.settle();
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(page.$("#d").nmProxy.got).toEqual([]);
    });

    it("removes the window listeners of an element it removed", async () => {
        const target = `<div id="target" nm-on-keydown.window="hits++"></div>`;
        const page = await mount(
            `<div id="d" nm-data="{ hits: 0 }">
                <button id="b" nm-on-click="$get('/x')"></button>
                ${target}
            </div>`,
            { server: () => target },
        );
        for (let i = 0; i < 3; i++) {
            page.$("#b").click();
            await page.settle();
        }
        page.window.dispatchEvent(new page.window.KeyboardEvent("keydown", { key: "a" }));
        expect(page.$("#d").nmProxy.hits).toBe(1);
    });
});

describe("helpers called with no current element", () => {
    it("sends fetcherr from the scope's element for a request made after an await", async () => {
        const page = await mount(
            `<div id="d" nm-data="{ _err: null }" nm-on-fetcherr="_err = e.detail.err">
                <button id="b" nm-on-click="await 0; $get('/x')"></button>
            </div>`,
            { server: () => ({ status: 500, body: "no" }) },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.$("#d").nmProxy._err).not.toBeNull();
    });

    it("sends the scope's data-* for a request made after an await", async () => {
        const page = await mount(
            `<div nm-data="{}" data-from="scope">
                <button id="b" nm-on-click="await 0; $get('/x')"></button>
            </div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(new URL(page.requests[0].url).searchParams.get("from")).toBe("scope");
    });

    it("dispatches from the scope's element after an await", async () => {
        const page = await mount(`
            <div id="d" nm-data="{ got: null }" nm-on-ping="got = e.detail">
                <button id="b" nm-on-click="await 0; $dispatch('ping', 1)"></button>
            </div>
        `);
        page.$("#b").click();
        await page.settle();
        expect(page.$("#d").nmProxy.got).toBe(1);
    });

    it("debounces after an await", async () => {
        const page = await mount(`
            <div id="d" nm-data="{ ran: 0 }">
                <button id="b" nm-on-click="await 0; $debounce(() => ran++, 10)"></button>
            </div>
        `);
        page.$("#b").click();
        await page.settle();
        expect(page.$("#d").nmProxy.ran).toBe(1);
        expect(page.errors).toEqual([]);
    });
});

describe("request URLs and methods", () => {
    it("puts the query before a #fragment", async () => {
        const page = await mount(
            `<div nm-data="{}"><button id="b" nm-on-click="$get('/x#top', { a: 1 })"></button></div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(new URL(page.requests[0].url).searchParams.get("a")).toBe("1");
    });

    it("adds no & to a URL that ends in ?", async () => {
        const page = await mount(
            `<div nm-data="{}"><button id="b" nm-on-click="$get('/x?', { a: 1 })"></button></div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.requests[0].url).toBe("http://localhost/x?a=1");
    });

    it("puts the data in the query for a lowercase get", async () => {
        const page = await mount(
            `<div nm-data="{}"><button id="b" nm-on-click="$fetch('/x', 'get', { a: 1 })"></button></div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        const [request] = page.requests;
        expect(request.method).toBe("GET");
        expect(request.body).toBeUndefined();
        expect(new URL(request.url).searchParams.get("a")).toBe("1");
    });
});

describe("debounces", () => {
    it("keeps a timer for each handler of an element", async () => {
        const page = await mount(`
            <div nm-data="{ got: [] }">
                <input id="i" nm-on-input.debounce20="got = [...got, 'input']" nm-on-ping.debounce20="got = [...got, 'ping']">
            </div>
        `);
        const input = page.$("#i");
        input.dispatchEvent(new page.window.Event("input"));
        input.dispatchEvent(new page.window.Event("ping"));
        await page.settle();
        expect([...page.scope("#i").got].sort()).toEqual(["input", "ping"]);
    });

    it("still runs when another request starts in the scope", async () => {
        const page = await mount(
            `<div nm-data="{ got: [] }">
                <input id="i" nm-on-input.debounce20="got = [...got, 'saved']">
                <button id="b" nm-on-click="$get('/poll')"></button>
            </div>`,
            { server: () => "" },
        );
        page.$("#i").dispatchEvent(new page.window.Event("input"));
        page.$("#b").click();
        await page.settle();
        expect(page.scope("#i").got).toEqual(["saved"]);
    });
});

describe("replacing a request", () => {
    it("keeps the request in flight when building the next one throws", async () => {
        let answer;
        const page = await mount(
            `<div nm-data="{ broken() { throw new Error('no') } }">
                <button id="first" nm-on-click="$get('/x')"></button>
                <div id="target">old</div>
            </div>`,
            { server: () => new Promise((resolve) => (answer = resolve)) },
        );
        const scope = page.scope("#first");
        const broken = scope.broken;
        scope.broken = () => "fine";
        page.$("#first").click();
        scope.broken = broken;
        expect(() => scope.$get("/y")).toThrow("no");
        answer(`<div id="target">new</div>`);
        await page.settle();
        expect(page.$("#target").textContent).toBe("new");
    });
});

describe("debounces and URLs, after review", () => {
    it("keeps a timer for each watcher of an element", async () => {
        const page = await mount(`
            <div nm-data="{ got: [] }">
                <span id="s" nm-on-init="$watch(() => $debounce(() => got.push('a'), 10));
                    $watch(() => $debounce(() => got.push('b'), 10));"></span>
            </div>
        `);
        await page.settle();
        expect([...page.scope("#s").got].sort()).toEqual(["a", "b"]);
    });

    it("debounces a request with no scope after an await", async () => {
        const page = await mount(
            `<button id="b" nm-on-click="await 0; $debounce(() => $get('/s'), 10)"></button>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.requests).toHaveLength(1);
        expect(page.errors).toEqual([]);
    });

    it("leaves the query a URL already has as it is", async () => {
        const page = await mount(
            `<div nm-data="{}"><button id="b" nm-on-click="$get('/items?expand&path=/a/b', { q: 1 })"></button></div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.requests[0].url).toBe("http://localhost/items?expand&path=/a/b&q=1");
    });

    it("takes a request with no method as a GET", async () => {
        const page = await mount(
            `<div nm-data="{}"><button id="b" nm-on-click="$fetch('/x', undefined, { a: 1 })"></button></div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.requests[0].method).toBe("GET");
        expect(page.requests[0].url).toBe("http://localhost/x?a=1");
    });
});

describe("request URLs as written", () => {
    it("leaves a relative URL for the document's base to resolve", async () => {
        const page = await mount(
            `<base href="/api/">
            <div nm-data="{}"><button id="b" nm-on-click="$get('items', { a: 1 })"></button></div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.requests[0].url).toBe("http://localhost/api/items?a=1");
    });

    it("sends fetcherr for a URL that cannot be fetched", async () => {
        const page = await mount(
            `<div nm-data="{ _err: null }" nm-on-fetcherr="_err = e.detail">
                <button id="b" nm-on-click="$get('http://[bad', { a: 1 })"></button>
            </div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.scope("#b")._err.url).toBe("http://[bad?a=1");
        expect(page.errors).toEqual([]);
    });
});

describe("abortable debounces, core-build keys and trailing &", () => {
    it("drops a debounce asked to be abortable when a request starts in its scope", async () => {
        const page = await mount(
            `<div nm-data="{ got: [] }">
                <input id="i" nm-on-input="$debounce(() => got = [...got, 'search'], 20, true)">
                <button id="b" nm-on-click="$get('/reset')"></button>
            </div>`,
            { server: () => "" },
        );
        page.$("#i").dispatchEvent(new page.window.Event("input"));
        page.$("#b").click();
        await page.settle();
        expect(page.scope("#i").got).toEqual([]);
    });

    it("keeps a timer for each handler of an element in the core build", async () => {
        const page = await mount(
            `<div nm-data="{ got: [] }">
                <input id="i" nm-on-input="$debounce(() => got.push('input'), 20)" nm-on-ping="$debounce(() => got.push('ping'), 20)">
            </div>`,
            { without: ["template", "form", "fetch", "morph", "helpers", "events"] },
        );
        const input = page.$("#i");
        input.dispatchEvent(new page.window.Event("input"));
        input.dispatchEvent(new page.window.Event("ping"));
        await page.settle();
        expect([...page.scope("#i").got].sort()).toEqual(["input", "ping"]);
    });

    it("adds no second & to a URL that ends in &", async () => {
        const page = await mount(
            `<div nm-data="{}"><button id="b" nm-on-click="$get('/x?a=1&', { b: 2 })"></button></div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.requests[0].url).toBe("http://localhost/x?a=1&b=2");
    });
});
