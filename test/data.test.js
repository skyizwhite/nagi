import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";

describe("nm-scope", () => {
    it("makes a scope from an object an expression gives", async () => {
        const page = await mount(
            `<div id="a" nm-scope="{ n: 1 }"></div><div id="b" nm-scope="make(this)"></div>`,
            { beforeInit: (window) => (window.make = (el) => ({ id: el.id })) },
        );
        expect(page.$("#a").nmProxy.n).toBe(1);
        expect(page.$("#b").nmProxy.id).toBe("b");
    });

    it("makes an empty scope with no value", async () => {
        const page = await mount(`<div id="d" nm-scope></div>`);
        expect(typeof page.$("#d").nmProxy.$get).toBe("function");
        expect(page.errors).toEqual([]);
    });

    it("logs an element still using nm-data", async () => {
        const page = await mount(`<div nm-data="{ n: 1 }"></div>`);
        expect(page.errors).toHaveLength(1);
    });

    it("logs a value that gives a promise or a primitive, and makes an empty scope", async () => {
        const page = await mount(`
            <div id="a" nm-scope="Promise.resolve({ n: 1 })"></div>
            <div id="b" nm-scope="'ab'"></div>
        `);
        expect(page.$("#a").nmProxy.n).toBeUndefined();
        expect(page.$("#b").nmProxy[0]).toBeUndefined();
        expect(page.errors).toHaveLength(2);
    });

    it("logs an object that throws when read, and goes on with the page", async () => {
        const page = await mount(
            `<div id="a" nm-scope="bad()"></div><div id="b" nm-let-x="1"></div>`,
            { beforeInit: (window) => (window.bad = () => ({ get then() { throw new Error("no"); } })) },
        );
        expect(page.$("#b").nmProxy?.x).toBe(1);
        expect(page.errors.length).toBeGreaterThan(0);
    });

    it("keeps the methods and getters of a factory's object, with what they read tracked", async () => {
        const page = await mount(
            `<div nm-scope="new Counter()">
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

    it("runs a factory object's setter with the scope as this, even for the value it has", async () => {
        const page = await mount(
            `<div nm-scope="new Box()">
                <button id="b" nm-on-click="value = undefined"></button>
                <span id="s" nm-bind-textcontent="n"></span>
            </div>`,
            { beforeInit: (window) => (window.Box = class { n = 1; set value(v) { this.n++; } }) },
        );
        page.$("#b").click();
        expect(page.$("#s").textContent).toBe("2");
    });

    it("does not change the object the factory returned", async () => {
        const page = await mount(
            `<div id="a" nm-scope="shared"></div><div id="b" nm-scope="shared"></div>`,
            { beforeInit: (window) => (window.shared = { n: 1 }) },
        );
        page.$("#a").nmProxy.n = 2;
        expect(page.$("#b").nmProxy.n).toBe(1);
        expect(page.window.shared.n).toBe(1);
        expect(page.window.shared.$get).toBeUndefined();
    });

    it("makes a frozen object's values writable in the scope", async () => {
        const page = await mount(`
            <div nm-scope="Object.freeze({ n: 1 })" data-m="5"><button id="b" nm-on-click="n++"></button></div>
        `);
        page.$("#b").click();
        await page.settle();
        expect(page.scope("#b").n).toBe(2);
        expect(page.scope("#b").m).toBe("5");
        expect(page.errors).toEqual([]);
    });

    it("keeps going when a factory's object has a getter named like a helper", async () => {
        const page = await mount(
            `<div id="a" nm-scope="new S()"></div><div id="b" nm-let-x="1"></div>`,
            { beforeInit: (window) => (window.S = class { get $refs() { return {}; } }) },
        );
        expect(page.$("#b").nmProxy?.x).toBe(1);
    });
});

describe("data-* of a scope's element", () => {
    it("adds them as the strings written, named as dataset names them", async () => {
        const page = await mount(`
            <div id="d" nm-scope data-model="post" data-count="3" data-user-id="42" data-none="null"></div>
        `);
        const scope = page.$("#d").nmProxy;
        expect(scope.model).toBe("post");
        expect(scope.count).toBe("3");
        expect(scope.userId).toBe("42");
        expect(scope.none).toBe("null");
    });

    it("never runs a value as code", async () => {
        const page = await mount(`<div id="d" nm-scope data-x="(() => { window.ran = true })()"></div>`);
        expect(page.window.ran).toBeUndefined();
        expect(page.$("#d").nmProxy.x).toBe("(() => { window.ran = true })()");
    });

    it("does not make a scope by itself", async () => {
        const page = await mount(`
            <div nm-scope="{ a: 'outer' }"><div id="inner" data-a="inner"><span id="s" nm-bind-textcontent="a"></span></div></div>
        `);
        expect(page.$("#inner").nmProxy).toBeUndefined();
        expect(page.$("#s").textContent).toBe("outer");
    });

    it("takes only the scope element's own, not its descendants'", async () => {
        const page = await mount(`<div id="d" nm-scope><span data-x="1"></span></div>`);
        expect(page.$("#d").nmProxy.x).toBeUndefined();
    });

    it("adds to and overrides the object of nm-scope", async () => {
        const page = await mount(`<div id="d" nm-scope="{ a: 1, b: 1 }" data-b="2" data-c="3"></div>`);
        const scope = page.$("#d").nmProxy;
        expect([scope.a, scope.b, scope.c]).toEqual([1, "2", "3"]);
    });

    it("sets a value over a getter of the factory's object", async () => {
        const page = await mount(
            `<div id="d" nm-scope="new C()" data-mode="b"></div>`,
            { beforeInit: (window) => (window.C = class { get mode() { return "a"; } }) },
        );
        expect(page.$("#d").nmProxy.mode).toBe("b");
    });

    it("stops $dataset at the scope", async () => {
        const page = await mount(`
            <div data-outside="x">
                <div nm-let-got="null" data-in="y"><button id="b" nm-on-click="got = $dataset()"></button></div>
            </div>
        `);
        page.$("#b").click();
        expect({ ...page.scope("#b").got }).toEqual({ in: "y" });
    });
});

describe("nm-let-* attributes", () => {
    it("adds values of any kind from expressions", async () => {
        const page = await mount(`
            <div id="d" nm-let-count="3" nm-let-open="false" nm-let-ids="[1, 2]" nm-let-name="'Ann'"></div>
        `);
        const scope = page.$("#d").nmProxy;
        expect(scope.count).toBe(3);
        expect(scope.open).toBe(false);
        expect([...scope.ids]).toEqual([1, 2]);
        expect(scope.name).toBe("Ann");
    });

    it("adds a function that reads and writes the scope by name", async () => {
        const page = await mount(`
            <div nm-let-count="1" nm-let-add="(n) => count += n">
                <button id="b" nm-on-click="add(2)"></button>
                <span id="s" nm-bind-textcontent="count"></span>
            </div>
        `);
        page.$("#b").click();
        expect(page.$("#s").textContent).toBe("3");
    });

    it("runs with the scope's element as this", async () => {
        const page = await mount(`<div id="d" nm-let-x="this.id"></div>`);
        expect(page.$("#d").nmProxy.x).toBe("d");
    });

    it("overrides data-* and nm-scope of the same name", async () => {
        const page = await mount(`<div id="d" nm-scope="{ v: 1 }" data-v="2" nm-let-v="v + 1"></div>`);
        expect(page.$("#d").nmProxy.v).toBe("21");
    });

    it("keeps a name with a dash as written", async () => {
        const page = await mount(`<div id="d" nm-let-is-open="true"></div>`);
        expect(page.$("#d").nmProxy["is-open"]).toBe(true);
    });

    it("logs a value that does not make an expression, and keeps the value of the same name", async () => {
        const page = await mount(`<div id="d" data-v="2" nm-let-v="(" nm-let-ok="() => v"></div>`);
        const scope = page.$("#d").nmProxy;
        expect(scope.v).toBe("2");
        expect(scope.ok()).toBe("2");
        expect(page.errors).toHaveLength(1);
    });

    it("owns a $persist it starts by the scope's element", async () => {
        const page = await mount(
            `<div nm-scope="{}">
                <button id="b" nm-on-click="$get('/x')"></button>
                <div id="target" nm-let-n="1" nm-let-start="$persist('n')"></div>
            </div>`,
            { server: () => `<div id="target"></div>` },
        );
        const old = page.$("#target").nmProxy;
        page.$("#b").click();
        await page.settle();
        old.n = 9;
        expect(page.window.localStorage["_nmProp-n"]).toBe("1");
    });

    it("is not called to make a request's data", async () => {
        const page = await mount(
            `<div nm-let-count="1" nm-let-add="(n) => count += n">
                <button id="b" nm-on-click="$post('/x')"></button>
            </div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.scope("#b").count).toBe(1);
        expect(page.requests[0].body).toBe("count=1");
    });
});

describe("names kept for nomini", () => {
    it("logs a data-* or nm-let-* named like a helper, and keeps the helper", async () => {
        const page = await mount(`<div id="d" nm-scope data-$refs="x" nm-let-$get="() => 1" nm-let-_nmfetching="true" nm-let-__proto__="{}"></div>`);
        const scope = page.$("#d").nmProxy;
        expect(typeof scope.$get).toBe("function");
        expect(typeof scope.$refs).toBe("object");
        expect(page.errors).toHaveLength(4);
    });
});

describe("finding scopes in the page as it is", () => {
    it("finds the nearest scope from inside nested ones", async () => {
        const page = await mount(`
            <div nm-let-a="'outer'"><div nm-let-a="'inner'"><span id="s" nm-bind-textcontent="a"></span></div></div>
        `);
        expect(page.$("#s").textContent).toBe("inner");
    });

    it("makes the scopes in what a factory adds, and none for what it takes away", async () => {
        const page = await mount(
            `<div nm-scope="build(this)"><div id="gone" nm-let-x="window.ran = true"></div></div>`,
            {
                beforeInit: (window) =>
                    (window.build = (el) => {
                        el.innerHTML = `<div nm-let-a="'inner'"><span id="s" nm-bind-textcontent="a"></span></div>`;
                        return { a: "outer" };
                    }),
            },
        );
        expect(page.$("#s").textContent).toBe("inner");
        expect(page.window.ran).toBeUndefined();
    });

    it("binds what a factory adds", async () => {
        const page = await mount(
            `<div nm-scope="build(this)"></div>`,
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

    it("goes on after a scope replaces its own element", async () => {
        const page = await mount(
            `<div id="a" nm-scope="swapOut(this)"></div><div id="b" nm-let-x="1"></div>`,
            {
                beforeInit: (window) =>
                    (window.swapOut = (el) => {
                        el.replaceWith(el.ownerDocument.createElement("div"));
                        return {};
                    }),
            },
        );
        expect(page.$("#b").nmProxy?.x).toBe(1);
    });

    it("makes the scopes between an element a factory moves later and where it lands", async () => {
        const page = await mount(
            `<div id="a" nm-scope="moveAfter(this)"></div>
            <div id="b" nm-let-x="1"><span id="s" nm-bind-textcontent="x"></span></div>`,
            {
                beforeInit: (window) =>
                    (window.moveAfter = (el) => {
                        el.ownerDocument.getElementById("b").after(el);
                        return {};
                    }),
            },
        );
        expect(page.$("#s").textContent).toBe("1");
    });
});

describe("scopes, after the review of nm-scope", () => {
    it("sends the scope's value over the data-* it started from", async () => {
        const page = await mount(
            `<div nm-scope data-page="1"><button id="b" nm-on-click="page = '2'; $get('/list')"></button></div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(new URL(page.requests[0].url).searchParams.get("page")).toBe("2");
    });

    it("tells the watchers started before an nm-let-* what it sets", async () => {
        const page = await mount(
            `<div id="d" nm-let-start="$persist('n')" nm-let-n="1"></div>`,
            { beforeInit: (window) => (window.localStorage["_nmProp-n"] = "5") },
        );
        expect(page.$("#d").nmProxy.n).toBe(1);
        expect(page.window.localStorage["_nmProp-n"]).toBe("1");
    });

    it("logs an nm-scope object made from a built-in class, and makes an empty scope", async () => {
        const page = await mount(
            `<div id="a" nm-scope="new Store()"></div><div id="b" nm-scope="new Map()"></div>`,
            { beforeInit: (window) => (window.Store = class extends window.Map {}) },
        );
        expect(page.$("#a").nmProxy.get).toBeUndefined();
        expect(page.errors).toHaveLength(2);
    });

    it("goes on after a scope takes its element's parent out of the page", async () => {
        const page = await mount(
            `<section id="w"><div nm-scope="(document.getElementById('w').replaceWith(document.createElement('section')), {})"></div></section>
            <div nm-let-x="1"><span id="s" nm-bind-textcontent="x"></span></div>`,
        );
        expect(page.$("#s").textContent).toBe("1");
    });

    it("defines a name for an nm-let-* with no value", async () => {
        const page = await mount(`<div id="d" nm-let-selected><button id="b" nm-on-click="selected = 1"></button></div>`);
        page.$("#b").click();
        expect(page.$("#d").nmProxy.selected).toBe(1);
        expect(page.window.selected).toBeUndefined();
        expect(page.errors).toEqual([]);
    });

    it("leaves the scope and binds of an element a factory moves in", async () => {
        const page = await mount(
            `<div id="cart" nm-let-items="1"><button id="b" nm-on-click="items++"></button><span id="s" nm-bind-textcontent="items"></span></div>
            <div nm-scope><button id="load" nm-on-click="$get('/x')"></button></div>
            <div id="target"></div>`,
            {
                server: () => `<div id="target" nm-scope="take(this)"></div>`,
                beforeInit: (window) =>
                    (window.take = (el) => {
                        el.append(el.ownerDocument.getElementById("cart"));
                        return {};
                    }),
            },
        );
        const scope = page.$("#cart").nmProxy;
        page.$("#load").click();
        await page.settle();
        expect(page.$("#cart").nmProxy).toBe(scope);
        page.$("#b").click();
        expect(scope.items).toBe(2);
        expect(page.$("#s").textContent).toBe("2");
    });
});
