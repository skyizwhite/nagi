import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";

describe("n-scope", () => {
    it("makes a scope from an object literal", async () => {
        const page = await mount(`<div id="a" n-scope="{ n: 1 }"></div>`);
        expect(page.$("#a").nagiProxy.n).toBe(1);
    });

    it("runs the expression with the scope element as $el", async () => {
        const page = await mount(`<div id="a" data-x="hi" n-scope="{ x: $el.dataset.x }"></div>`);
        expect(page.$("#a").nagiProxy.x).toBe("hi");
    });

    it("logs and falls back to an empty scope when the expression is invalid", async () => {
        const page = await mount(`<div id="a" n-scope="{ n: }"></div>`);
        expect(page.$("#a").nagiProxy.n).toBeUndefined();
        expect(page.errors).toHaveLength(1);
    });

    it("makes a scope from an object an expression gives", async () => {
        const page = await mount(
            `<div id="a" n-scope="{ n: 1 }"></div><div id="b" n-scope="make($el)"></div>`,
            { beforeInit: (window) => (window.make = (el) => ({ id: el.id })) },
        );
        expect(page.$("#a").nagiProxy.n).toBe(1);
        expect(page.$("#b").nagiProxy.id).toBe("b");
    });

    it("makes an empty scope with no value", async () => {
        const page = await mount(`<div id="d" n-scope></div>`);
        expect(typeof page.$("#d").nagiProxy.$get).toBe("function");
        expect(page.errors).toEqual([]);
    });

    it("logs a value that gives a promise or a primitive, and makes an empty scope", async () => {
        const page = await mount(`
            <div id="a" n-scope="Promise.resolve({ n: 1 })"></div>
            <div id="b" n-scope="'ab'"></div>
        `);
        expect(page.$("#a").nagiProxy.n).toBeUndefined();
        expect(page.$("#b").nagiProxy[0]).toBeUndefined();
        expect(page.errors).toHaveLength(2);
    });

    it("logs an object that throws when read, and goes on with the page", async () => {
        const page = await mount(
            `<div id="a" n-scope="bad()"></div><div id="b" n-let-x="1"></div>`,
            { beforeInit: (window) => (window.bad = () => ({ get then() { throw new Error("no"); } })) },
        );
        expect(page.$("#b").nagiProxy?.x).toBe(1);
        expect(page.errors.length).toBeGreaterThan(0);
    });
});

describe("this and $el", () => {
    it("takes this as the scope and $el as the element in n-bind-* and n-on-*", async () => {
        const page = await mount(`
            <div n-scope="{ n: 1, got: null }">
                <span id="s" n-bind-textcontent="this.n"></span>
                <button id="b" n-on-click="this.n++; this.got = $el.id"></button>
            </div>
        `);
        page.$("#b").click();
        expect(page.$("#s").textContent).toBe("2");
        expect(page.scope("#b").got).toBe("b");
    });

    it("takes this as the scope in n-let-*", async () => {
        const page = await mount(`<div id="d" n-let-a="1" n-let-b="this.a + 1"></div>`);
        expect(page.$("#d").nagiProxy.b).toBe(2);
    });

    it("keeps $el as the handler's element after an await", async () => {
        const page = await mount(`<div n-scope="{ got: null }"><button id="b" n-on-click="await 0; got = $el.id"></button></div>`);
        page.$("#b").click();
        await page.settle();
        expect(page.scope("#b").got).toBe("b");
    });

    it("updates an inner bind when an outer scope adds the name it reads", async () => {
        const page = await mount(`
            <div n-scope><button id="b" n-on-click="this.msg = 'hi'"></button>
                <div n-let-a="1"><span id="s" n-bind-textcontent="this.msg ?? ''"></span></div>
            </div>
        `);
        page.$("#b").click();
        expect(page.$("#s").textContent).toBe("hi");
    });

    it("keeps $el the element though the scope has a key named $el", async () => {
        const page = await mount(`<div n-scope="{ $el: 'x', got: null }"><button id="b" n-on-click="got = $el.id"></button></div>`);
        page.$("#b").click();
        expect(page.scope("#b").got).toBe("b");
    });

    it("adds a name to the scope written through this", async () => {
        const page = await mount(`
            <div n-scope><button id="b" n-on-click="this.x = 5"></button><span id="s" n-bind-textcontent="this.x ?? ''"></span></div>
        `);
        page.$("#b").click();
        expect(page.$("#s").textContent).toBe("5");
        expect(page.window.x).toBeUndefined();
    });
});

describe("n-scope objects", () => {
    it("keeps the methods and getters of a factory's object, with what they read tracked", async () => {
        const page = await mount(
            `<div n-scope="new Counter()">
                <button id="b" n-on-click="inc()"></button>
                <span id="s" n-bind-textcontent="double"></span>
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
            `<div n-scope="new Box()">
                <button id="b" n-on-click="value = undefined"></button>
                <span id="s" n-bind-textcontent="n"></span>
            </div>`,
            { beforeInit: (window) => (window.Box = class { n = 1; set value(v) { this.n++; } }) },
        );
        page.$("#b").click();
        expect(page.$("#s").textContent).toBe("2");
    });

    it("does not change the object the factory returned", async () => {
        const page = await mount(
            `<div id="a" n-scope="shared"></div><div id="b" n-scope="shared"></div>`,
            { beforeInit: (window) => (window.shared = { n: 1 }) },
        );
        page.$("#a").nagiProxy.n = 2;
        expect(page.$("#b").nagiProxy.n).toBe(1);
        expect(page.window.shared.n).toBe(1);
        expect(page.window.shared.$get).toBeUndefined();
    });

    it("makes a frozen object's values writable in the scope", async () => {
        const page = await mount(`
            <div n-scope="Object.freeze({ n: 1 })"><button id="b" n-on-click="n++"></button></div>
        `);
        page.$("#b").click();
        await page.settle();
        expect(page.scope("#b").n).toBe(2);
        expect(page.errors).toEqual([]);
    });

    it("keeps going when a factory's object has a getter named like a helper", async () => {
        const page = await mount(
            `<div id="a" n-scope="new S()"></div><div id="b" n-let-x="1"></div>`,
            { beforeInit: (window) => (window.S = class { get $refs() { return {}; } }) },
        );
        expect(page.$("#b").nagiProxy?.x).toBe(1);
    });

    it("logs an n-scope object made from a built-in class, and makes an empty scope", async () => {
        const page = await mount(
            `<div id="a" n-scope="new Store()"></div><div id="b" n-scope="new Map()"></div>`,
            { beforeInit: (window) => (window.Store = class extends window.Map {}) },
        );
        expect(page.$("#a").nagiProxy.get).toBeUndefined();
        expect(page.errors).toHaveLength(2);
    });

    it("takes an object made with Object.create of a plain object", async () => {
        const page = await mount(`
            <div id="d" n-scope="Object.create({ inc() { this.n++ } }, { n: { value: 0, enumerable: true, writable: true } })"></div>
        `);
        const scope = page.$("#d").nagiProxy;
        scope.inc();
        expect(scope.n).toBe(1);
        expect(page.errors).toEqual([]);
    });
});

describe("data-* of the scope's element", () => {
    it("are not names of the scope, so they hide no global", async () => {
        const page = await mount(`
            <div n-scope="{ got: null }" data-model="post" data-location="here">
                <button id="b" n-on-click="got = [typeof model, typeof location]"></button>
            </div>
        `);
        page.$("#b").click();
        expect([...page.scope("#b").got]).toEqual(["undefined", "object"]);
    });

    it("are read with $el.dataset", async () => {
        const page = await mount(`<div id="d" data-user-id="42" n-let-user="$el.dataset.userId"></div>`);
        expect(page.$("#d").nagiProxy.user).toBe("42");
    });

    it("gathers $dataset from every ancestor, past the scope", async () => {
        const page = await mount(`
            <div data-outside="x">
                <div n-let-got="null" data-in="y"><button id="b" n-on-click="got = $dataset()"></button></div>
            </div>
        `);
        page.$("#b").click();
        expect({ ...page.scope("#b").got }).toEqual({ in: "y", outside: "x" });
    });
});

describe("n-let-*", () => {
    it("adds values of any kind from expressions", async () => {
        const page = await mount(`
            <div id="d" n-let-count="3" n-let-open="false" n-let-ids="[1, 2]" n-let-name="'Ann'"></div>
        `);
        const scope = page.$("#d").nagiProxy;
        expect(scope.count).toBe(3);
        expect(scope.open).toBe(false);
        expect([...scope.ids]).toEqual([1, 2]);
        expect(scope.name).toBe("Ann");
    });

    it("adds a function that reads and writes the scope by name", async () => {
        const page = await mount(`
            <div n-let-count="1" n-let-add="(n) => count += n">
                <button id="b" n-on-click="add(2)"></button>
                <span id="s" n-bind-textcontent="count"></span>
            </div>
        `);
        page.$("#b").click();
        expect(page.$("#s").textContent).toBe("3");
    });

    it("runs with the scope's element as $el", async () => {
        const page = await mount(`<div id="d" n-let-x="$el.id"></div>`);
        expect(page.$("#d").nagiProxy.x).toBe("d");
    });

    it("overrides n-scope of the same name", async () => {
        const page = await mount(`<div id="d" n-scope="{ v: 1 }" n-let-v="v + 1"></div>`);
        expect(page.$("#d").nagiProxy.v).toBe(2);
    });

    it("keeps a name with a dash as written", async () => {
        const page = await mount(`<div id="d" n-let-is-open="true"></div>`);
        expect(page.$("#d").nagiProxy["is-open"]).toBe(true);
    });

    it("logs a value that does not make an expression, and keeps the value of the same name", async () => {
        const page = await mount(`<div id="d" n-scope="{ v: 2 }" n-let-v="(" n-let-ok="() => v"></div>`);
        const scope = page.$("#d").nagiProxy;
        expect(scope.v).toBe(2);
        expect(scope.ok()).toBe(2);
        expect(page.errors).toHaveLength(1);
    });

    it("owns a $persist it starts by the scope's element", async () => {
        const page = await mount(
            `<div n-scope="{}">
                <button id="b" n-on-click="$get('/x')"></button>
                <div id="target" n-let-n="1" n-let-start="$persist('n')"></div>
            </div>`,
            { server: () => `<div id="target"></div>` },
        );
        const old = page.$("#target").nagiProxy;
        page.$("#b").click();
        await page.settle();
        old.n = 9;
        expect(page.window.localStorage["_nagiProp-n"]).toBe("1");
    });

    it("tells the watchers started before an n-let-* what it sets", async () => {
        const page = await mount(
            `<div id="d" n-let-start="$persist('n')" n-let-n="1"></div>`,
            { beforeInit: (window) => (window.localStorage["_nagiProp-n"] = "5") },
        );
        expect(page.$("#d").nagiProxy.n).toBe(1);
        expect(page.window.localStorage["_nagiProp-n"]).toBe("1");
    });

    it("defines a name for an n-let-* with no value", async () => {
        const page = await mount(`<div id="d" n-let-selected><button id="b" n-on-click="selected = 1"></button></div>`);
        page.$("#b").click();
        expect(page.$("#d").nagiProxy.selected).toBe(1);
        expect(page.window.selected).toBeUndefined();
        expect(page.errors).toEqual([]);
    });
});

describe("names kept for Nagi", () => {
    it("logs an n-let-* named like a helper, and keeps the helper", async () => {
        const page = await mount(`<div id="d" n-scope n-let-$get="() => 1" n-let-_nagifetching="true" n-let-__proto__="{}"></div>`);
        const scope = page.$("#d").nagiProxy;
        expect(typeof scope.$get).toBe("function");
        expect(page.errors).toHaveLength(3);
    });

    it("logs an n-scope key named like a helper, and leaves it out", async () => {
        const page = await mount(`<div id="d" n-scope="{ $x: 1, _nagiY: 2, n: 3 }"></div>`);
        const raw = page.$("#d").nagiRaw;
        expect(["$x" in raw, "_nagiY" in raw, raw.n]).toEqual([false, false, 3]);
        expect(page.errors).toHaveLength(2);
    });

    it("lets a bind read a key named like an Object.prototype member", async () => {
        const page = await mount(`
            <div n-scope="{ n: 1 }"><span id="s" n-bind-textcontent="String(hasOwnProperty('n'))"></span></div>
        `);
        expect(page.$("#s").textContent).toBe("true");
        expect(page.errors).toEqual([]);
    });

    it("lets a key named like an Object.prototype member be set and bound", async () => {
        const page = await mount(`
            <div n-scope="{ valueOf: 1 }"><span id="s" n-bind-textcontent="valueOf"></span></div>
        `);
        page.scope("#s").valueOf = 2;
        expect(page.$("#s").textContent).toBe("2");
        expect(page.errors).toEqual([]);
    });
});

describe("outer scopes", () => {
    const html = `
        <div id="outer" n-scope="{ count: 1, name: 'outer', items: [1, 2, 3], remove(id) { this.items = this.items.filter((i) => i !== id) } }">
            <section id="inner" n-let-name="'inner'" n-let-id="2">
                <span id="name" n-bind-textcontent="name"></span>
                <span id="count" n-bind-textcontent="count"></span>
                <span id="items" n-bind-textcontent="items.join(',')"></span>
                <button id="inc" n-on-click="count++"></button>
                <button id="rename" n-on-click="name = 'x'"></button>
                <button id="remove" n-on-click="remove(id)"></button>
            </section>
        </div>
    `;

    it("reads the nearest scope first, and outer scopes for what it lacks", async () => {
        const page = await mount(`
            <div n-scope="{ outer: 'o', both: 'outer' }">
                <div n-scope="{ inner: 'i', both: 'inner' }">
                    <span id="s" n-bind-textcontent="outer + ':' + inner + ':' + both"></span>
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
        page.$("#outer").nagiProxy.count = 5;
        expect(page.$("#count").textContent).toBe("5");
    });

    it("writes to the scope that has the name", async () => {
        const page = await mount(html);
        page.$("#inc").click();
        page.$("#rename").click();
        expect(page.$("#outer").nagiProxy.count).toBe(2);
        expect(page.$("#outer").nagiProxy.name).toBe("outer");
        expect(page.$("#inner").nagiProxy.name).toBe("x");
        expect(Object.hasOwn(page.$("#inner").nagiProxy, "count")).toBe(false);
    });

    it("calls an outer method with what it reads and writes reaching the outer scope", async () => {
        const page = await mount(html);
        page.$("#remove").click();
        expect(page.$("#items").textContent).toBe("1,3");
    });

    it("goes out more than one scope", async () => {
        const page = await mount(`
            <div n-let-a="1"><div n-let-b="2"><div n-let-c="3"><span id="s" n-bind-textcontent="a + b + c"></span></div></div></div>
        `);
        expect(page.$("#s").textContent).toBe("6");
    });

    it("evaluates an inner n-let-* with the outer names", async () => {
        const page = await mount(`<div n-let-base="10"><div id="d" n-let-twice="base * 2"></div></div>`);
        expect(page.$("#d").nagiProxy.twice).toBe(20);
    });

    it("uses the innermost scope's helpers", async () => {
        let answer;
        const page = await mount(
            `<div id="outer" n-scope><div id="inner" n-scope><button id="b" n-on-click="$get('/x')"></button></div></div>`,
            { server: () => new Promise((resolve) => (answer = resolve)) },
        );
        page.$("#b").click();
        expect(page.$("#inner").nagiProxy.$fetching).toBe(true);
        expect(page.$("#outer").nagiProxy.$fetching).toBe(false);
        answer("");
        await page.settle();
    });

    it("runs an outer method with the outer scope as this", async () => {
        let answer;
        const page = await mount(
            `<div id="outer" n-scope="{ open() { this.isOpen = true }, save() { this.$get('/s') } }">
                <span id="s" n-bind-hidden="!isOpen"></span>
                <section n-let-x="1"><button id="b" n-on-click="open(); save()"></button></section>
            </div>`,
            { server: () => new Promise((resolve) => (answer = resolve)) },
        );
        page.$("#b").click();
        const outer = page.$("#outer").nagiProxy;
        expect(outer.isOpen).toBe(true);
        expect(page.$("#s").hidden).toBe(false);
        expect(outer.$fetching).toBe(true);
        answer("");
        await page.settle();
    });

    it("gives the same function each time an outer method is read", async () => {
        const page = await mount(`<div n-scope="{ f() {} }"><div id="i" n-let-x="1"></div></div>`);
        const inner = page.$("#i").nagiProxy;
        expect(inner.f).toBe(inner.f);
    });
});

describe("finding scopes", () => {
    it("skips everything under n-ignore", async () => {
        const page = await mount(`
            <div n-scope="{ n: 1 }">
                <div n-ignore><span id="s" n-bind-textcontent="n">x</span></div>
            </div>
        `);
        await page.settle();
        expect(page.$("#s").textContent).toBe("x");
    });

    it("finds the nearest scope from inside nested ones", async () => {
        const page = await mount(`
            <div n-let-a="'outer'"><div n-let-a="'inner'"><span id="s" n-bind-textcontent="a"></span></div></div>
        `);
        expect(page.$("#s").textContent).toBe("inner");
    });

    it("makes the scopes in what a factory adds, and none for what it takes away", async () => {
        const page = await mount(
            `<div n-scope="build($el)"><div id="gone" n-let-x="window.ran = true"></div></div>`,
            {
                beforeInit: (window) =>
                    (window.build = (el) => {
                        el.innerHTML = `<div n-let-a="'inner'"><span id="s" n-bind-textcontent="a"></span></div>`;
                        return { a: "outer" };
                    }),
            },
        );
        expect(page.$("#s").textContent).toBe("inner");
        expect(page.window.ran).toBeUndefined();
    });

    it("binds what a factory adds", async () => {
        const page = await mount(
            `<div n-scope="build($el)"></div>`,
            {
                beforeInit: (window) =>
                    (window.build = (el) => {
                        el.innerHTML = `<span id="s" n-bind-textcontent="name"></span>`;
                        return { name: "Ann" };
                    }),
            },
        );
        expect(page.$("#s").textContent).toBe("Ann");
    });

    it("goes on after a scope replaces its own element", async () => {
        const page = await mount(
            `<div id="a" n-scope="swapOut($el)"></div><div id="b" n-let-x="1"></div>`,
            {
                beforeInit: (window) =>
                    (window.swapOut = (el) => {
                        el.replaceWith(el.ownerDocument.createElement("div"));
                        return {};
                    }),
            },
        );
        expect(page.$("#b").nagiProxy?.x).toBe(1);
    });

    it("makes the scopes between an element a factory moves later and where it lands", async () => {
        const page = await mount(
            `<div id="a" n-scope="moveAfter($el)"></div>
            <div id="b" n-let-x="1"><span id="s" n-bind-textcontent="x"></span></div>`,
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
            `<section id="w"><div n-scope="(document.getElementById('w').replaceWith(document.createElement('section')), {})"></div></section>
            <div n-let-x="1"><span id="s" n-bind-textcontent="x"></span></div>`,
        );
        expect(page.$("#s").textContent).toBe("1");
    });

    it("leaves the scope and binds of an element a factory moves in", async () => {
        const page = await mount(
            `<div id="cart" n-let-items="1"><button id="b" n-on-click="items++"></button><span id="s" n-bind-textcontent="items"></span></div>
            <div n-scope><button id="load" n-on-click="$get('/x')"></button></div>
            <div id="target"></div>`,
            {
                server: () => `<div id="target" n-scope="take($el)"></div>`,
                beforeInit: (window) =>
                    (window.take = (el) => {
                        el.append(el.ownerDocument.getElementById("cart"));
                        return {};
                    }),
            },
        );
        const scope = page.$("#cart").nagiProxy;
        page.$("#load").click();
        await page.settle();
        expect(page.$("#cart").nagiProxy).toBe(scope);
        page.$("#b").click();
        expect(scope.items).toBe(2);
        expect(page.$("#s").textContent).toBe("2");
    });

    it("makes the scopes inside an element a factory moves earlier", async () => {
        const page = await mount(`
            <div id="x"></div>
            <section>
                <div n-scope="(document.getElementById('x').append($el), {})">
                    <div n-let-a="1"><span id="s" n-bind-textcontent="a"></span></div>
                </div>
            </section>
        `);
        expect(page.$("#s").textContent).toBe("1");
    });
});
