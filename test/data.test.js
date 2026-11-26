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

describe("nm-data, after the second review", () => {
    it("keeps the methods and getters of a factory's object", async () => {
        const page = await mount(
            `<div nm-data="new Counter()">
                <button id="b" nm-on-click="inc()"></button>
                <span id="s" nm-bind-textcontent="double"></span>
            </div>`,
            {
                beforeInit: (window) =>
                    (window.Counter = class {
                        n = 1;
                        inc() { this.n++; }
                        get double() { return this.n * 2; }
                    }),
            },
        );
        expect(page.$("#s").textContent).toBe("2");
        page.$("#b").click();
        expect(page.$("#s").textContent).toBe("4");
    });

    it("does not change the object the factory returned", async () => {
        const page = await mount(
            `<div id="a" nm-data="shared"></div><div id="b" nm-data="shared"></div>`,
            { beforeInit: (window) => (window.shared = { n: 1 }) },
        );
        page.$("#a").nmProxy.n = 2;
        expect(page.$("#b").nmProxy.n).toBe(1);
        expect(page.window.shared.n).toBe(1);
        expect(page.window.shared.$get).toBeUndefined();
    });

    it("logs an nm-data that gives a promise or a primitive, and makes an empty scope", async () => {
        const page = await mount(`
            <div id="a" nm-data="Promise.resolve({ n: 1 })"></div>
            <div id="b" nm-data="'ab'"></div>
        `);
        expect(page.$("#a").nmProxy.n).toBeUndefined();
        expect(page.$("#b").nmProxy[0]).toBeUndefined();
        expect(page.errors).toHaveLength(2);
    });

    it("logs an nm-data-* or nm-fn-* named like a helper, and keeps the helper", async () => {
        const page = await mount(`<div id="d" nm-data-$refs="{}" nm-fn-$get="() => 1" nm-data-_nmfetching="true"></div>`);
        const scope = page.$("#d").nmProxy;
        expect(typeof scope.$get).toBe("function");
        expect(scope._nmFetching).toBe(false);
        expect(page.errors).toHaveLength(3);
    });

    it("keeps numbers inside JSON as the text written when they would read back differently", async () => {
        const page = await mount(`<div id="d" nm-data-ids="[12345678901234567890, 1.10, 3]"></div>`);
        expect([...page.$("#d").nmProxy.ids]).toEqual(["12345678901234567890", "1.10", 3]);
    });
});

describe("nm-data, after the third review", () => {
    it("makes a frozen object's values writable in the scope", async () => {
        const page = await mount(`
            <div nm-data="Object.freeze({ n: 1 })" nm-data-m="5"><button id="b" nm-on-click="n++"></button></div>
        `);
        page.$("#b").click();
        await page.settle();
        expect(page.scope("#b").n).toBe(2);
        expect(page.scope("#b").m).toBe(5);
        expect(page.errors).toEqual([]);
    });

    it("runs a factory object's setter with the scope as this", async () => {
        const page = await mount(
            `<div nm-data="new Box()">
                <button id="b" nm-on-click="value = 5"></button>
                <span id="s" nm-bind-textcontent="n"></span>
            </div>`,
            { beforeInit: (window) => (window.Box = class { n = 1; set value(v) { this.n = v; } }) },
        );
        page.$("#b").click();
        expect(page.$("#s").textContent).toBe("5");
    });

    it("binds what a factory adds to the scope's element", async () => {
        const page = await mount(
            `<div nm-data="build(this)"></div>`,
            {
                beforeInit: (window) =>
                    (window.build = (el) => {
                        el.innerHTML = `<span id="s" nm-bind-textcontent="name"></span>`;
                        return { name: "Ann" };
                    }),
            },
        );
        expect(page.$("#s").textContent).toBe("Ann");
    });

    it("logs nm-data-__proto__ and keeps the prototype", async () => {
        const page = await mount(
            `<div id="d" nm-data="new C()" nm-data-__proto__="{}"></div>`,
            { beforeInit: (window) => (window.C = class { hi() { return "hi"; } }) },
        );
        expect(page.$("#d").nmProxy.hi()).toBe("hi");
        expect(page.errors).toHaveLength(1);
    });
});

describe("nm-data, after the fourth review", () => {
    it("owns a $persist started from nm-fn-* by the scope's element", async () => {
        const page = await mount(
            `<div id="d" nm-data="{ n: 1 }">
                <button id="b" nm-on-click="$get('/x')"></button>
                <div id="target" nm-data-n="1" nm-fn-start="$persist('n')"></div>
            </div>`,
            { server: () => `<div id="target"></div>` },
        );
        const old = page.$("#target").nmProxy;
        page.$("#b").click();
        await page.settle();
        old.n = 9;
        expect(page.window.localStorage["_nmProp-n"]).toBe("1");
    });

    it("makes the scopes in what a factory adds, and none for what it takes away", async () => {
        const page = await mount(
            `<div nm-data="build(this)"><div id="gone" nm-fn-x="window.ran = true"></div></div>`,
            {
                beforeInit: (window) =>
                    (window.build = (el) => {
                        el.innerHTML = `<div nm-data-a="inner"><span id="s" nm-bind-textcontent="a"></span></div>`;
                        return { a: "outer" };
                    }),
            },
        );
        expect(page.$("#s").textContent).toBe("inner");
        expect(page.window.ran).toBeUndefined();
    });

    it("sets an nm-data-* over a getter of the factory's object", async () => {
        const page = await mount(
            `<div id="d" nm-data="new C()" nm-data-mode="b"></div>`,
            { beforeInit: (window) => (window.C = class { get mode() { return "a"; } }) },
        );
        expect(page.$("#d").nmProxy.mode).toBe("b");
    });
});

describe("nm-data, after the fifth review", () => {
    it("keeps a top-level number-like value as written even without the reviver's source", async () => {
        const page = await mount(`<div id="d" nm-data-version="1.10"></div>`, {
            beforeInit: (window) => {
                const parse = window.JSON.parse;
                window.JSON.parse = (text, reviver) => parse(text, reviver && ((k, v) => reviver(k, v)));
            },
        });
        expect(page.$("#d").nmProxy.version).toBe("1.10");
    });

    it("goes on making scopes after one replaces its own element", async () => {
        const page = await mount(
            `<div id="a" nm-data="swapOut(this)"></div><div id="b" nm-data-x="1"></div>`,
            {
                beforeInit: (window) =>
                    (window.swapOut = (el) => {
                        const next = el.ownerDocument.createElement("div");
                        next.id = "a2";
                        el.replaceWith(next);
                        return {};
                    }),
            },
        );
        expect(page.$("#b").nmProxy?.x).toBe(1);
    });

    it("runs a setter even when its getter already gives the value", async () => {
        const page = await mount(
            `<div nm-data="new Box()"><button id="b" nm-on-click="value = undefined"></button></div>`,
            { beforeInit: (window) => (window.Box = class { calls = 0; set value(v) { this.calls++; } }) },
        );
        page.$("#b").click();
        expect(page.scope("#b").calls).toBe(1);
    });

    it("keeps going when a factory's object has a getter named like a helper", async () => {
        const page = await mount(
            `<div id="a" nm-data="new S()"></div><div id="b" nm-data-x="1"></div>`,
            { beforeInit: (window) => (window.S = class { get $refs() { return {}; } }) },
        );
        expect(page.$("#b").nmProxy?.x).toBe(1);
    });
});
