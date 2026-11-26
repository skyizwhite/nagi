import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";

describe("nm-scope", () => {
    it("makes a scope from an object literal", async () => {
        const page = await mount(`<div id="a" nm-scope="{ n: 1 }"></div>`);
        expect(page.$("#a").nmProxy.n).toBe(1);
    });

    it("runs the expression with the scope element as this", async () => {
        const page = await mount(`<div id="a" data-x="hi" nm-scope="{ x: this.dataset.x }"></div>`);
        expect(page.$("#a").nmProxy.x).toBe("hi");
    });

    it("logs and falls back to an empty scope when the expression is invalid", async () => {
        const page = await mount(`<div id="a" nm-scope="{ n: }"></div>`);
        expect(page.$("#a").nmProxy.n).toBeUndefined();
        expect(page.errors).toHaveLength(1);
    });

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
});

describe("nm-scope objects", () => {
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

    it("logs an nm-scope object made from a built-in class, and makes an empty scope", async () => {
        const page = await mount(
            `<div id="a" nm-scope="new Store()"></div><div id="b" nm-scope="new Map()"></div>`,
            { beforeInit: (window) => (window.Store = class extends window.Map {}) },
        );
        expect(page.$("#a").nmProxy.get).toBeUndefined();
        expect(page.errors).toHaveLength(2);
    });

    it("takes an object made with Object.create of a plain object", async () => {
        const page = await mount(`
            <div id="d" nm-scope="Object.create({ inc() { this.n++ } }, { n: { value: 0, enumerable: true, writable: true } })"></div>
        `);
        const scope = page.$("#d").nmProxy;
        scope.inc();
        expect(scope.n).toBe(1);
        expect(page.errors).toEqual([]);
    });
});

describe("data-* of the scope's element", () => {
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

describe("nm-let-*", () => {
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

    it("tells the watchers started before an nm-let-* what it sets", async () => {
        const page = await mount(
            `<div id="d" nm-let-start="$persist('n')" nm-let-n="1"></div>`,
            { beforeInit: (window) => (window.localStorage["_nmProp-n"] = "5") },
        );
        expect(page.$("#d").nmProxy.n).toBe(1);
        expect(page.window.localStorage["_nmProp-n"]).toBe("1");
    });

    it("defines a name for an nm-let-* with no value", async () => {
        const page = await mount(`<div id="d" nm-let-selected><button id="b" nm-on-click="selected = 1"></button></div>`);
        page.$("#b").click();
        expect(page.$("#d").nmProxy.selected).toBe(1);
        expect(page.window.selected).toBeUndefined();
        expect(page.errors).toEqual([]);
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

    it("lets a bind read a key named like an Object.prototype member", async () => {
        const page = await mount(`
            <div nm-scope="{ n: 1 }"><span id="s" nm-bind-textcontent="String(hasOwnProperty('n'))"></span></div>
        `);
        expect(page.$("#s").textContent).toBe("true");
        expect(page.errors).toEqual([]);
    });

    it("lets a key named like an Object.prototype member be set and bound", async () => {
        const page = await mount(`
            <div nm-scope="{ valueOf: 1 }"><span id="s" nm-bind-textcontent="valueOf"></span></div>
        `);
        page.scope("#s").valueOf = 2;
        expect(page.$("#s").textContent).toBe("2");
        expect(page.errors).toEqual([]);
    });
});

describe("outer scopes", () => {
    const html = `
        <div id="outer" nm-scope="{ count: 1, name: 'outer', items: [1, 2, 3], remove(id) { this.items = this.items.filter((i) => i !== id) } }">
            <section id="inner" nm-let-name="'inner'" nm-let-id="2">
                <span id="name" nm-bind-textcontent="name"></span>
                <span id="count" nm-bind-textcontent="count"></span>
                <span id="items" nm-bind-textcontent="items.join(',')"></span>
                <button id="inc" nm-on-click="count++"></button>
                <button id="rename" nm-on-click="name = 'x'"></button>
                <button id="remove" nm-on-click="remove(id)"></button>
            </section>
        </div>
    `;

    it("reads the nearest scope first, and outer scopes for what it lacks", async () => {
        const page = await mount(`
            <div nm-scope="{ outer: 'o', both: 'outer' }">
                <div nm-scope="{ inner: 'i', both: 'inner' }">
                    <span id="s" nm-bind-textcontent="outer + ':' + inner + ':' + both"></span>
                </div>
            </div>
        `);
        expect(page.$("#s").textContent).toBe("o:i:inner");
    });

    it("reads a name the inner scope lacks from the outer one, the inner one first", async () => {
        const page = await mount(html);
        expect(page.$("#name").textContent).toBe("inner");
        expect(page.$("#count").textContent).toBe("1");
    });

    it("runs an inner bind again when the outer value changes", async () => {
        const page = await mount(html);
        page.$("#outer").nmProxy.count = 5;
        expect(page.$("#count").textContent).toBe("5");
    });

    it("writes to the scope that has the name", async () => {
        const page = await mount(html);
        page.$("#inc").click();
        page.$("#rename").click();
        expect(page.$("#outer").nmProxy.count).toBe(2);
        expect(page.$("#outer").nmProxy.name).toBe("outer");
        expect(page.$("#inner").nmProxy.name).toBe("x");
        expect(Object.hasOwn(page.$("#inner").nmProxy, "count")).toBe(false);
    });

    it("calls an outer method with what it reads and writes reaching the outer scope", async () => {
        const page = await mount(html);
        page.$("#remove").click();
        expect(page.$("#items").textContent).toBe("1,3");
    });

    it("goes out more than one scope", async () => {
        const page = await mount(`
            <div nm-let-a="1"><div nm-let-b="2"><div nm-let-c="3"><span id="s" nm-bind-textcontent="a + b + c"></span></div></div></div>
        `);
        expect(page.$("#s").textContent).toBe("6");
    });

    it("evaluates an inner nm-let-* with the outer names", async () => {
        const page = await mount(`<div nm-let-base="10"><div id="d" nm-let-twice="base * 2"></div></div>`);
        expect(page.$("#d").nmProxy.twice).toBe(20);
    });

    it("uses the innermost scope's helpers", async () => {
        let answer;
        const page = await mount(
            `<div id="outer" nm-scope><div id="inner" nm-scope><button id="b" nm-on-click="$get('/x')"></button></div></div>`,
            { server: () => new Promise((resolve) => (answer = resolve)) },
        );
        page.$("#b").click();
        expect(page.$("#inner").nmProxy.$fetching).toBe(true);
        expect(page.$("#outer").nmProxy.$fetching).toBe(false);
        answer("");
        await page.settle();
    });

    it("runs an outer method with the outer scope as this", async () => {
        let answer;
        const page = await mount(
            `<div id="outer" nm-scope="{ open() { this.isOpen = true }, save() { this.$get('/s') } }">
                <span id="s" nm-bind-hidden="!isOpen"></span>
                <section nm-let-x="1"><button id="b" nm-on-click="open(); save()"></button></section>
            </div>`,
            { server: () => new Promise((resolve) => (answer = resolve)) },
        );
        page.$("#b").click();
        const outer = page.$("#outer").nmProxy;
        expect(outer.isOpen).toBe(true);
        expect(page.$("#s").hidden).toBe(false);
        expect(outer.$fetching).toBe(true);
        answer("");
        await page.settle();
    });

    it("gives the same function each time an outer method is read", async () => {
        const page = await mount(`<div nm-scope="{ f() {} }"><div id="i" nm-let-x="1"></div></div>`);
        const inner = page.$("#i").nmProxy;
        expect(inner.f).toBe(inner.f);
    });
});

describe("finding scopes", () => {
    it("skips everything under nm-ignore", async () => {
        const page = await mount(`
            <div nm-scope="{ n: 1 }">
                <div nm-ignore><span id="s" nm-bind-textcontent="n">x</span></div>
            </div>
        `);
        await page.settle();
        expect(page.$("#s").textContent).toBe("x");
    });

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

    it("goes on after a scope takes its element's parent out of the page", async () => {
        const page = await mount(
            `<section id="w"><div nm-scope="(document.getElementById('w').replaceWith(document.createElement('section')), {})"></div></section>
            <div nm-let-x="1"><span id="s" nm-bind-textcontent="x"></span></div>`,
        );
        expect(page.$("#s").textContent).toBe("1");
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

    it("makes the scopes inside an element a factory moves earlier", async () => {
        const page = await mount(`
            <div id="x"></div>
            <section>
                <div nm-scope="(document.getElementById('x').append(this), {})">
                    <div nm-let-a="1"><span id="s" nm-bind-textcontent="a"></span></div>
                </div>
            </section>
        `);
        expect(page.$("#s").textContent).toBe("1");
    });
});
