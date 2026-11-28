import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";
import { later } from "./support.js";

describe("tracking", () => {
    it("sets a property and keeps it in step with the scope", async () => {
        const page = await mount(`
            <div n-scope="{ n: 1 }"><span id="s" n-bind-textcontent="n * 10"></span></div>
        `);
        await page.settle();
        expect(page.$("#s").textContent).toBe("10");

        page.scope("#s").n = 2;
        await page.settle();
        expect(page.$("#s").textContent).toBe("20");
    });

    it("has written a bind by the time the element's init runs", async () => {
        const page = await mount(`
            <div n-scope="{ n: 1, seen: null }">
                <span id="s" n-bind-textcontent="n" n-on-init="seen = $el.textContent"></span>
            </div>
        `);
        expect(page.scope("#s").seen).toBe("1");
    });

    it("writes a bind as the scope changes, without waiting", async () => {
        const page = await mount(`
            <div n-scope="{ n: 1 }"><span id="s" n-bind-textcontent="n"></span></div>
        `);
        page.scope("#s").n = 2;
        expect(page.$("#s").textContent).toBe("2");
    });

    it("tracks what a bind reads when it runs again", async () => {
        const page = await mount(`
            <div n-scope="{ flag: true, a: 'a', b: 'b' }">
                <span id="s" n-bind-textcontent="flag ? a : b"></span>
            </div>
        `);
        const scope = page.scope("#s");
        scope.flag = false;
        scope.b = "b2";
        expect(page.$("#s").textContent).toBe("b2");
    });

    it("runs a bind again with its element as the current one", async () => {
        const page = await mount(`
            <div n-scope="{ n: 1, got: [] }" n-on-changed="got = [...got, e.detail]">
                <span id="s" n-bind-textcontent="($dispatch('changed', n), n)"></span>
            </div>
        `);
        page.scope("#s").n = 2;
        expect(page.scope("#s").got).toEqual([1, 2]);
        expect(page.errors).toEqual([]);
    });

    it("keeps tracking a bind after it calls $watch", async () => {
        const page = await mount(`
            <div n-scope="{ x: 1, y: 'y' }">
                <span id="s" n-bind-textcontent="(() => { $watch(() => x); return y })()"></span>
            </div>
        `);
        page.scope("#s").y = "y2";
        expect(page.$("#s").textContent).toBe("y2");
    });

    it("runs a bind again when another bind it set off changes what it read", async () => {
        const page = await mount(`
            <div n-scope="{ a: 1, total: 0, label: '' }">
                <span id="first" n-bind-textcontent="(() => { const shown = label; total = a + 1; return shown })()"></span>
                <span id="second" n-bind-textcontent="(label = 'v' + total)"></span>
            </div>
        `);
        page.scope("#first").a = 5;
        expect(page.$("#first").textContent).toBe("v6");
        expect(page.errors).toEqual([]);
    });

    it("does not run binds again when a value is set to what it already is", async () => {
        const page = await mount(`
            <div n-scope="{ n: 1, runs: 0 }"><span id="s" n-bind-textcontent="(runs++, n)"></span></div>
        `);
        page.scope("#s").n = 1;
        expect(page.scope("#s").runs).toBe(1);
    });

    it("creates a key set to undefined", async () => {
        const page = await mount(`
            <div id="d" n-scope="{}" n-on-init="$watch(() => 0)"></div>
        `);
        const scope = page.$("#d").nagiProxy;
        scope.color = undefined;
        expect("color" in scope).toBe(true);
    });

    it("runs binds again when an object is set to itself after changing it", async () => {
        const page = await mount(`
            <div n-scope="{ items: [] }">
                <button id="b" n-on-click="items.push(1); items = items"></button>
                <span id="s" n-bind-textcontent="items.length"></span>
            </div>
        `);
        page.$("#b").click();
        expect(page.$("#s").textContent).toBe("1");
    });

    it("stops running a bind for what it no longer reads", async () => {
        const page = await mount(`
            <div n-scope="{ flag: true, a: 'a', b: 'b', runs: 0 }">
                <span id="s" n-bind-textcontent="(runs++, flag ? a : b)"></span>
            </div>
        `);
        const scope = page.scope("#s");
        scope.flag = false;
        scope.a = "a2";
        expect(scope.runs).toBe(2);
    });

    it("does not track what an event handler reads into the bind that sent the event", async () => {
        const page = await mount(`
            <div n-scope="{ n: 1, other: 0, runs: 0 }" n-on-changed="other">
                <span id="s" n-bind-textcontent="(runs++, $dispatch('changed'), n)"></span>
            </div>
        `);
        const scope = page.scope("#s");
        scope.other = 1;
        expect(scope.runs).toBe(1);
    });
});

describe("async binds", () => {
    it("writes the resolved value of a promise", async () => {
        const page = await mount(`
            <div n-scope="{}"><span id="s" n-bind-textcontent="(async () => 'later')()"></span></div>
        `);
        await page.settle();
        expect(page.$("#s").textContent).toBe("later");
    });

    it("logs an async bind that rejects", async () => {
        const page = await mount(`
            <div n-scope="{}"><span n-bind-textcontent="(async () => { throw new Error('no') })()"></span></div>
        `);
        await page.settle();
        expect(page.errors).toHaveLength(1);
    });

    it("keeps the value of the newest run when an older one resolves last", async () => {
        const page = await mount(
            `<div n-scope n-let-n="1"><span id="s" n-bind-textcontent="(async () => { const v = n; await wait(v === 1 ? 40 : 5); return v })()"></span></div>`,
            { beforeInit: (window) => (window.wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))) },
        );
        page.scope("#s").n = 2;
        await later(80);
        expect(page.$("#s").textContent).toBe("2");
    });

    it("does not write once the bind's element was taken out by a swap", async () => {
        const page = await mount(
            `<div n-scope>
                <button id="b" n-on-click="$get('/x')"></button>
                <div id="target"><span id="s" n-bind-textcontent="(async () => { await wait(30); return 'late' })()">old</span></div>
            </div>`,
            {
                server: () => `<div id="target"></div>`,
                beforeInit: (window) => (window.wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))),
            },
        );
        const span = page.$("#s");
        page.$("#b").click();
        await page.settle();
        await later(50);
        expect(span.textContent).toBe("old");
    });
});

describe("watchers", () => {
    it("logs a $watch whose promise rejects after an await, and leaves a returned thenable alone", async () => {
        const page = await mount(`<div id="d" n-scope n-on-init="$watch(async () => { await 0; null.x }); $watch(() => ({ then() { globalThis.thenCalled = true } }))"></div>`);
        await later(10);
        expect(page.errors.map(([message, , , err]) => [message, err?.name])).toEqual([["[Nagi] failed to run:", "TypeError"]]);
        expect(page.window.thenCalled).toBeUndefined();
    });

    it("$watch reruns a function when what it read changes", async () => {
        const page = await mount(`
            <div id="d" n-scope="{ n: 1, seen: [] }" n-on-init="$watch(() => seen.push(n))"></div>
        `);
        page.$("#d").nagiProxy.n = 2;
        expect(page.$("#d").nagiProxy.seen).toEqual([1, 2]);
    });

    it("replaces the watchers a bind made when it runs again", async () => {
        const page = await mount(`
            <div n-scope="{ x: 1, y: 1, log: [] }">
                <span id="s" n-bind-textcontent="(() => { $watch(() => log.push(x)); return y })()"></span>
            </div>
        `);
        const scope = page.scope("#s");
        scope.y = 2;
        scope.y = 3;
        scope.log.length = 0;
        scope.x = 2;
        expect(scope.log).toEqual([2]);
    });

    it("does not run a watcher again from inside itself", async () => {
        const page = await mount(`
            <div id="d" n-scope="{ count: 0 }" n-on-init="$watch(() => count = count + 1)"></div>
        `);
        const scope = page.$("#d").nagiProxy;
        expect(scope.count).toBe(1);
        scope.count = 10;
        expect(scope.count).toBe(11);
    });

    it("stops a bind that its own run made another bind drop", async () => {
        const page = await mount(`
            <div n-scope="{ x: 0, y: 0, done: false, log: [] }">
                <span n-bind-textcontent="(() => {
                    x;
                    $watch(() => {
                        if (y === 1 && !done) { done = true; x = x + 1 }
                        $watch(() => log.push(y));
                    });
                })()"></span>
            </div>
        `);
        const scope = page.scope("span");
        scope.y = 1;
        scope.log.length = 0;
        scope.y = 10;
        expect(scope.log).toEqual([10]);
        expect(page.errors).toEqual([]);
    });

    it("logs a bind that keeps setting itself off and stops it", async () => {
        const page = await mount(`
            <div n-scope="{ a: 0, b: 0 }">
                <span id="s" n-bind-textcontent="(a = b + 1)"></span>
                <span n-bind-textcontent="(b = a + 1)"></span>
            </div>
        `);
        expect(page.errors.some(([message]) => message.includes("stopped running after 100 times"))).toBe(true);
    });
});

describe("errors", () => {
    it("logs a bind that throws and goes on binding the rest", async () => {
        const page = await mount(`
            <div n-scope="{ n: 1 }">
                <span id="bad" n-bind-textcontent="n.missing.x"></span>
                <span id="s" n-bind-textcontent="n"></span>
            </div>
        `);
        expect(page.$("#s").textContent).toBe("1");
        expect(page.errors).toHaveLength(1);

        page.scope("#s").n = 2;
        expect(page.$("#s").textContent).toBe("2");
        expect(page.errors).toHaveLength(2);
    });
});

describe("elements a swap removes", () => {
    it("drops the binds of an element a swap removed", async () => {
        const page = await mount(
            `<div id="d" n-scope="{ n: 1, ran: [] }">
                <button id="b" n-on-click="$get('/x')"></button>
                <div id="target"><span n-bind-textcontent="(ran.push($el.isConnected), n)"></span></div>
            </div>`,
            { server: () => `<div id="target"></div>` },
        );
        page.$("#b").click();
        await page.settle();

        const scope = page.$("#d").nagiProxy;
        scope.ran.length = 0;
        scope.n = 2;
        expect(scope.ran).toEqual([]);
    });

    it("runs the binds of an element put back in the document", async () => {
        const page = await mount(`
            <div id="d" n-scope="{ n: 1 }"><span id="s" n-bind-textcontent="n"></span></div>
        `);
        const scope = page.$("#d").nagiProxy;
        const span = page.$("#s");
        span.remove();
        scope.n = 2;
        page.$("#d").append(span);
        expect(span.textContent).toBe("2");
        scope.n = 3;
        expect(span.textContent).toBe("3");
    });

    it("drops a $watch set up from an element a swap removed", async () => {
        const page = await mount(
            `<div id="d" n-scope="{ n: 1, seen: [] }">
                <button id="b" n-on-click="$get('/x')"></button>
                <div id="target"><span n-on-init="$watch(() => seen.push(n))"></span></div>
            </div>`,
            { server: () => `<div id="target"><span n-on-init="$watch(() => seen.push(n))"></span></div>` },
        );
        for (let i = 0; i < 3; i++) {
            page.$("#b").click();
            await page.settle();
        }
        const scope = page.$("#d").nagiProxy;
        scope.seen.length = 0;
        scope.n = 2;
        expect(scope.seen).toEqual([2]);
    });

    it("drops a $persist set up from an element a swap removed", async () => {
        const page = await mount(
            `<div id="d" n-scope="{ n: 1 }">
                <button id="b" n-on-click="$get('/x')"></button>
                <div id="target"><span n-on-init="$persist('n')"></span></div>
            </div>`,
            { server: () => `<div id="target"></div>` },
        );
        page.$("#b").click();
        await page.settle();
        page.$("#d").nagiProxy.n = 5;
        expect(page.window.localStorage["_nagiProp-n"]).toBe("1");
    });
});
