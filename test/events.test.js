import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";
import { later } from "./support.js";

describe("init event", () => {
    it("fires after everything in the set-up part is bound, so a parent can reach its children", async () => {
        const page = await mount(`
            <div id="d" n-scope="{ got: '' }" n-on-init="$refs.child.dispatchEvent(new Event('ping'))">
                <span n-ref="child" n-on-ping="got = 'pinged'" n-bind-title="got"></span>
            </div>
        `);
        expect(page.scope("#d").got).toBe("pinged");
        expect(page.document.querySelector("span").title).toBe("pinged");
    });

    it("fires after every element a fragment brings in is bound", async () => {
        const page = await mount(
            `<div id="d" n-scope="{ got: '' }"><button id="b" n-on-click="$get('/x')"></button><ul id="list"></ul></div>`,
            {
                server: () =>
                    `<ul id="list" n-swap="append"><li n-on-init="$refs.second.dispatchEvent(new Event('ping'))"></li><li n-ref="second" n-on-ping="got = 'pinged'"></li></ul>`,
            },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.scope("#d").got).toBe("pinged");
    });

    it("fires once on an element an earlier init handler set up again", async () => {
        const page = await mount(`
            <div id="d" n-scope="{ count: 0 }" n-on-init="const c = $refs.c; nagi.destroy(c); nagi.init(c)">
                <span n-ref="c" n-on-init="count++"></span>
            </div>
        `);
        expect(page.scope("#d").count).toBe(1);
    });

    it("fires on an element set up before it was in the page once nagi.init meets it in the page", async () => {
        const page = await mount(`<div id="d" n-scope></div>`);
        const el = page.document.createElement("i");
        el.setAttribute("n-on-init", "globalThis.initRuns = (globalThis.initRuns ?? 0) + 1");
        page.window.nagi.init(el);
        page.$("#d").append(el);
        page.window.nagi.init(el);
        page.window.nagi.init(el);
        expect(page.window.initRuns).toBe(1);
    });

    it("sends no destroy to an element torn down before it got its init", async () => {
        const page = await mount(`
            <div id="d" n-scope="{ got: [] }" n-on-init="nagi.destroy($refs.c)">
                <span n-ref="c" n-on-init="got = [...got, 'init']" n-on-destroy="got = [...got, 'destroy']"></span>
            </div>
        `);
        expect(page.scope("#d").got).toEqual([]);
    });

    it("does not fire on an element an earlier init handler took out of the page", async () => {
        const page = await mount(`
            <div id="d" n-scope="{ ran: false }" n-on-init="$el.querySelector('i').remove()"><i n-on-init="ran = true"></i></div>
        `);
        expect(page.scope("#d").ran).toBe(false);
    });
});

describe("handlers", () => {
    it("listens with on<event> and runs the handler with $el as the element", async () => {
        const page = await mount(`
            <div n-scope="{ id: null }"><button id="b" n-on-click="id = $el.id + ':' + e.type"></button></div>
        `);
        page.$("#b").click();
        expect(page.scope("#b").id).toBe("b:click");
    });

    it("listens to custom events", async () => {
        const page = await mount(`
            <div n-scope="{ got: null }"><span id="s" n-on-ping="got = e.detail"></span></div>
        `);
        page.$("#s").dispatchEvent(new page.window.CustomEvent("ping", { detail: 42 }));
        expect(page.scope("#s").got).toBe(42);
    });

    it("runs statements with the event as e and the element as $el", async () => {
        const page = await mount(`
            <div n-scope="{ got: null }"><button id="b" n-on-click="const t = e.type; got = $el.id + ':' + t"></button></div>
        `);
        page.$("#b").click();
        expect(page.scope("#b").got).toBe("b:click");
    });

    it("lets a handler await", async () => {
        const page = await mount(`
            <div n-scope="{ got: [] }"><button id="b" n-on-click="got = [...got, 1]; await 0; got = [...got, 2]"></button></div>
        `);
        page.$("#b").click();
        expect(page.scope("#b").got).toEqual([1]);
        await page.settle();
        expect(page.scope("#b").got).toEqual([1, 2]);
    });

    it("keeps an event name as written", async () => {
        const page = await mount(`
            <div n-scope="{ got: 0 }"><span id="s" n-on-my-event="got++"></span></div>
        `);
        page.$("#s").dispatchEvent(new page.window.Event("my-event"));
        expect(page.scope("#s").got).toBe(1);
    });

    it("listens to a kebab-case event as written", async () => {
        const page = await mount(`
            <div n-scope="{ got: 0 }"><span id="s" n-on-item-added="got++"></span></div>
        `);
        page.$("#s").dispatchEvent(new page.window.Event("item-added"));
        expect(page.scope("#s").got).toBe(1);
    });

    it("logs a handler that rejects", async () => {
        const page = await mount(`
            <div n-scope="{}"><button id="b" n-on-click="await 0; throw new Error('no')"></button></div>
        `);
        page.$("#b").click();
        await page.settle();
        expect(page.errors).toHaveLength(1);
    });

    it("warns about a handler that only makes a function", async () => {
        const page = await mount(`<div n-scope><button n-on-click="() => 1"></button></div>`);
        expect(page.warnings).toHaveLength(1);
    });
});

describe("init and destroy", () => {
    it("dispatches a non-bubbling init on the element after binding it", async () => {
        const page = await mount(`
            <div n-scope="{ got: [] }" id="d" n-on-init="got = [...got, 'scope']">
                <span n-on-init="got = [...got, 'child']"></span>
            </div>
        `);
        await page.settle();
        expect(page.$("#d").nagiProxy.got).toEqual(["scope", "child"]);
    });

    it("sends init and destroy to an element with only n-on-* attributes", async () => {
        const page = await mount(
            `<div id="d" n-scope="{ log: [] }">
                <button id="b" n-on-click="$get('/x')"></button>
                <div id="target"><span n-on-init="log.push('init')" n-on-destroy="log.push('destroy')"></span></div>
            </div>`,
            { server: () => `<div id="target"></div>` },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.$("#d").nagiProxy.log).toEqual(["init", "destroy"]);
    });
});

describe("modifiers", () => {
    it("calls preventDefault with .prevent", async () => {
        const page = await mount(`
            <div n-scope="{}"><form id="f" n-on-submit.prevent=""></form></div>
        `);
        const event = new page.window.Event("submit", { cancelable: true });
        page.$("#f").dispatchEvent(event);
        expect(event.defaultPrevented).toBe(true);
    });

    it("stops propagation with .stop", async () => {
        const page = await mount(`
            <div n-scope="{ hits: 0 }" n-on-click="hits++">
                <button id="b" n-on-click.stop=""></button>
            </div>
        `);
        page.$("#b").click();
        expect(page.scope("#b").hits).toBe(0);
    });

    it("runs once with .once", async () => {
        const page = await mount(`
            <div n-scope="{ hits: 0 }"><button id="b" n-on-click.once="hits++"></button></div>
        `);
        page.$("#b").click();
        page.$("#b").click();
        expect(page.scope("#b").hits).toBe(1);
    });

    it("listens on window with .window", async () => {
        const page = await mount(`
            <div n-scope="{ key: null }"><span id="s" n-on-keydown.window="key = e.key"></span></div>
        `);
        page.window.dispatchEvent(new page.window.KeyboardEvent("keydown", { key: "Escape" }));
        expect(page.scope("#s").key).toBe("Escape");
    });

    it("takes the name before the first dot as the event, and warns about modifiers it does not know", async () => {
        const page = await mount(`
            <div n-scope n-let-got="0"><button id="b" n-on-click.self="got++"></button></div>
        `);
        page.$("#b").click();
        expect(page.scope("#b").got).toBe(1);
        expect(page.warnings).toHaveLength(1);
    });
});

describe("debounce", () => {
    it("runs only the last of quick events with .debounce<ms>", async () => {
        const page = await mount(`
            <div n-scope="{ got: [] }"><input id="i" n-on-input.debounce30="got = [...got, $el.value]"></div>
        `);
        const input = page.$("#i");
        for (const value of ["a", "ab", "abc"]) {
            input.value = value;
            input.dispatchEvent(new page.window.Event("input"));
        }
        expect(page.scope("#i").got).toEqual([]);
        await page.settle();
        expect(page.scope("#i").got).toEqual(["abc"]);
    });

    it("keeps a timer for each handler of an element", async () => {
        const page = await mount(`
            <div n-scope="{ got: [] }">
                <input id="i" n-on-input.debounce20="got = [...got, 'input']" n-on-ping.debounce20="got = [...got, 'ping']">
            </div>
        `);
        const input = page.$("#i");
        input.dispatchEvent(new page.window.Event("input"));
        input.dispatchEvent(new page.window.Event("ping"));
        await page.settle();
        expect([...page.scope("#i").got].sort()).toEqual(["input", "ping"]);
    });

    it("keeps apart the different debounces of one handler", async () => {
        const page = await mount(`
            <div n-scope="{ got: [] }">
                <button id="b" n-on-click="$debounce(() => got = [...got, 'a'], 10); $debounce(() => got = [...got, 'b'], 20)"></button>
            </div>
        `);
        page.$("#b").click();
        await later(40);
        expect(page.scope("#b").got).toEqual(["a", "b"]);
    });

    it("runs the debounce of a handler called quickly again only once", async () => {
        const page = await mount(`
            <div n-scope="{ ran: 0 }"><button id="b" n-on-click="$debounce(() => ran++, 20)"></button></div>
        `);
        for (let i = 0; i < 3; i++) page.$("#b").click();
        await later(40);
        expect(page.scope("#b").ran).toBe(1);
    });

    it("keeps apart the same debounce in two handlers of an element after an await", async () => {
        const page = await mount(`
            <div n-scope="{ ran: 0 }">
                <input id="i" n-on-input="await 0; $debounce(() => ran++, 20)" n-on-change="await 0; $debounce(() => ran++, 20)">
            </div>
        `);
        const input = page.$("#i");
        input.dispatchEvent(new page.window.Event("input"));
        input.dispatchEvent(new page.window.Event("change"));
        await later(50);
        expect(page.scope("#i").ran).toBe(2);
    });

    it("keeps one debounce of a handler whether or not it awaited first", async () => {
        const page = await mount(`
            <div n-scope="{ ran: 0 }"><input id="i" n-on-input="if ($el.value === 'b') await 0; $debounce(() => ran++, 20)"></div>
        `);
        const input = page.$("#i");
        for (const value of ["a", "b"]) {
            input.value = value;
            input.dispatchEvent(new page.window.Event("input"));
        }
        await later(50);
        expect(page.scope("#i").ran).toBe(1);
    });

    it("debounces a function bound anew on each call as one", async () => {
        const page = await mount(`
            <div n-scope="{ got: [] }">
                <input id="i" n-on-input="const add = (x) => got = [...got, x]; $debounce(add.bind(null, $el.value), 20)">
            </div>
        `);
        const input = page.$("#i");
        for (const value of ["a", "ab", "abc"]) {
            input.value = value;
            input.dispatchEvent(new page.window.Event("input"));
        }
        await later(50);
        expect(page.scope("#i").got).toEqual(["abc"]);
    });

    it("keeps apart calls given different keys, and counts calls given one key as one", async () => {
        const page = await mount(`
            <div n-scope="{ got: [] }">
                <button id="b" n-on-click="['a', 'b'].forEach((x) => $debounce(() => got = [...got, x], 10, { key: x })); $debounce(() => got = [...got, 'c'], 10, { key: 'k' })"></button>
                <button id="c" n-on-click="$debounce(() => got = [...got, 'd'], 10, { key: 'k' })"></button>
            </div>
        `);
        page.$("#b").click();
        page.$("#c").click();
        await later(40);
        expect([...page.scope("#b").got].sort()).toEqual(["a", "b", "c", "d"]);
    });

    it("counts calls with one key on one element as one, whatever their code, and takes any value as a key", async () => {
        const page = await mount(`
            <div n-scope="{ got: [] }">
                <button id="b" n-on-click="const a = {}, b = {}, s = Symbol('s');
                    $debounce(() => got = [...got, 'x'], 10, { key: 'k' });
                    $debounce(() => got = [...got, 'y'], 10, { key: 'k' });
                    $debounce(() => got = [...got, 'a'], 10, { key: a });
                    $debounce(() => got = [...got, 'b'], 10, { key: b });
                    $debounce(() => got = [...got, 's'], 10, { key: s })"></button>
            </div>
        `);
        page.$("#b").click();
        await later(40);
        expect([...page.scope("#b").got].sort()).toEqual(["a", "b", "s", "y"]);
        expect(page.errors).toEqual([]);
    });

    it("keys a this.$debounce in a .debounce handler by that handler", async () => {
        const page = await mount(`
            <div n-scope="{ ran: 0, save() { this.$debounce(() => this.ran++, 10) } }">
                <input id="i" n-on-input.debounce10="save()" n-on-change.debounce10="save()">
            </div>
        `);
        const input = page.$("#i");
        input.dispatchEvent(new page.window.Event("input"));
        input.dispatchEvent(new page.window.Event("change"));
        await later(50);
        expect(page.scope("#i").ran).toBe(2);
    });

    it("keys a this.$debounce in a debounced function by the place the first $debounce came from", async () => {
        const page = await mount(`
            <div n-scope="{ ran: 0, save() { this.$debounce(() => this.ran++, 10) } }">
                <input id="i" n-on-input="$debounce(() => save(), 10)" n-on-change="$debounce(() => save(), 10)">
            </div>
        `);
        const input = page.$("#i");
        input.dispatchEvent(new page.window.Event("input"));
        input.dispatchEvent(new page.window.Event("change"));
        await later(50);
        expect(page.scope("#i").ran).toBe(2);
    });

    it("takes abortable as true or in the options", async () => {
        const page = await mount(
            `<div id="d" n-scope="{ ran: 0 }">
                <button id="b" n-on-click="$debounce(() => ran++, 20, true); $debounce(() => ran += 10, 20, { abortable: true }); $debounce(() => ran += 100, 20); $get('/x')"></button>
            </div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        await later(40);
        expect(page.scope("#d").ran).toBe(100);
    });

    it("keeps a timer for each watcher of an element", async () => {
        const page = await mount(`
            <div n-scope="{ got: [] }">
                <span id="s" n-on-init="$watch(() => $debounce(() => got.push('a'), 10));
                    $watch(() => $debounce(() => got.push('b'), 10));"></span>
            </div>
        `);
        await page.settle();
        expect([...page.scope("#s").got].sort()).toEqual(["a", "b"]);
    });

    it("debounces in a watcher made again by its parent", async () => {
        const page = await mount(`
            <div n-scope n-let-q="''" n-let-saved="0">
                <span id="s" n-on-init="$watch(() => { q; $watch(() => $debounce(() => saved++, 20)) })"></span>
            </div>
        `);
        const scope = page.scope("#s");
        await later(40);
        scope.saved = 0;
        for (const q of ["a", "ab", "abc", "abcd"]) scope.q = q;
        await later(50);
        expect(scope.saved).toBe(1);
    });

    it("keeps apart debounces from different code with no handler or watcher", async () => {
        const page = await mount(`
            <div n-scope n-let-a="0" n-let-b="0">
                <button id="x" n-on-click="await 0; $debounce(() => a++, 10)"></button>
                <button id="y" n-on-click="await 0; $debounce(() => b++, 10)"></button>
            </div>
        `);
        page.$("#x").click();
        page.$("#y").click();
        await later(40);
        const scope = page.scope("#x");
        expect([scope.a, scope.b]).toEqual([1, 1]);
    });

    it("keeps apart debounces of sibling watchers with the same code", async () => {
        const page = await mount(`
            <div n-scope n-let-a="0" n-let-b="0" n-let-saved="[]">
                <span id="s" n-on-init="[['a', () => a], ['b', () => b]].forEach(([name, read]) => $watch(() => { read(); $debounce(() => saved.push(name), 20) }))"></span>
            </div>
        `);
        const scope = page.scope("#s");
        await later(40);
        scope.saved.length = 0;
        scope.a = 1;
        scope.b = 1;
        await later(50);
        expect([...scope.saved].sort()).toEqual(["a", "b"]);
    });

    it("still runs a debounce whose watcher a parent made again without debouncing", async () => {
        const page = await mount(`
            <div n-scope n-let-mode="0" n-let-q="''" n-let-saved="0">
                <span id="s" n-on-init="let last = ''; $watch(() => { mode; $watch(() => { const v = q; if (v !== last) { last = v; $debounce(() => saved++, 20) } }) })"></span>
            </div>
        `);
        const scope = page.scope("#s");
        scope.q = "x";
        scope.mode = 1;
        await later(50);
        expect(scope.saved).toBe(1);
    });

    it("debounces after an await", async () => {
        const page = await mount(`
            <div id="d" n-scope="{ ran: 0 }">
                <button id="b" n-on-click="await 0; $debounce(() => ran++, 10)"></button>
            </div>
        `);
        page.$("#b").click();
        await page.settle();
        expect(page.$("#d").nagiProxy.ran).toBe(1);
        expect(page.errors).toEqual([]);
    });

    it("debounces a request with no scope after an await", async () => {
        const page = await mount(
            `<button id="b" n-on-click="await 0; $debounce(() => $get('/s'), 10)"></button>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.requests).toHaveLength(1);
        expect(page.errors).toEqual([]);
    });

    it("still runs when another request starts in the scope", async () => {
        const page = await mount(
            `<div n-scope="{ got: [] }">
                <input id="i" n-on-input.debounce20="got = [...got, 'saved']">
                <button id="b" n-on-click="$get('/poll')"></button>
            </div>`,
            { server: () => "" },
        );
        page.$("#i").dispatchEvent(new page.window.Event("input"));
        page.$("#b").click();
        await page.settle();
        expect(page.scope("#i").got).toEqual(["saved"]);
    });

    it("drops a debounce asked to be abortable when a request starts in its scope", async () => {
        const page = await mount(
            `<div n-scope="{ got: [] }">
                <input id="i" n-on-input="$debounce(() => got = [...got, 'search'], 20, true)">
                <button id="b" n-on-click="$get('/reset')"></button>
            </div>`,
            { server: () => "" },
        );
        page.$("#i").dispatchEvent(new page.window.Event("input"));
        page.$("#b").click();
        await page.settle();
        expect(page.scope("#i").got).toEqual([]);
    });
});

describe("helpers after an await", () => {
    const tick = "await new Promise((resolve) => setTimeout(resolve))";

    it("dispatches from the handler's element and reads its data-* after an await", async () => {
        const page = await mount(`
            <ul id="u" n-scope="{ got: [] }">
                <li data-id="7" n-on-done="got = [...got, 'li']">
                    <button id="b" n-on-click="${tick}; got = [...got, $dataset().id]; $dispatch('done')"></button>
                </li>
            </ul>
        `);
        page.$("#b").click();
        await later(20);
        expect(page.scope("#u").got).toEqual(["7", "li"]);
    });

    it("sends the fetch events of a request made after an await from the handler's element", async () => {
        const page = await mount(
            `<div id="d" n-scope="{ got: '' }">
                <p n-on-fetcherr="got = 'p'"><button id="b" n-on-click="${tick}; $get('/x')"></button></p>
            </div>`,
            { server: () => ({ status: 500 }) },
        );
        page.$("#b").click();
        await later(20);
        await page.settle();
        expect(page.scope("#d").got).toBe("p");
    });

    it("gives a $watch made after an await to the handler's element, so it stops with it", async () => {
        const page = await mount(`
            <div id="d" n-scope="{ n: 0, runs: 0 }">
                <div id="row"><button id="b" n-on-click="${tick}; $watch(() => { n; runs++ })"></button></div>
            </div>
        `);
        const scope = page.scope("#d");
        page.$("#b").click();
        await later(20);
        expect(scope.runs).toBe(1);
        page.window.nagi.destroy(page.$("#row"));
        scope.n = 1;
        expect(scope.runs).toBe(1);
    });

    it("still finds names of the scope that the host layer does not hold", async () => {
        const page = await mount(`
            <div id="d" n-scope="{ toString: 'mine', got: '' }">
                <button id="b" n-on-click="got = toString + String($fetching) + typeof $refs + typeof $abort"></button>
            </div>
        `);
        page.$("#b").click();
        expect(page.scope("#d").got).toBe("minefalseobjectfunction");
    });

    it("still dispatches from the handler's element when it left the page during the await", async () => {
        const page = await mount(`
            <div id="d" n-scope="{ got: [] }" n-on-removed="got = [...got, 'scope']">
                <div id="row" n-on-removed="got = [...got, 'row']"><button id="b" n-on-click="${tick}; $dispatch('removed')"></button></div>
            </div>
        `);
        page.$("#b").click();
        page.$("#row").remove();
        await later(20);
        expect(page.scope("#d").got).toEqual(["row"]);
    });

    it("gives a $watch made after its element left the page to that element, so destroying it stops the watch", async () => {
        const page = await mount(`
            <div id="d" n-scope="{ n: 0, runs: 0 }">
                <div id="row"><button id="b" n-on-click="${tick}; $watch(() => { n; runs++ })"></button></div>
            </div>
        `);
        const scope = page.scope("#d");
        const row = page.$("#row");
        page.$("#b").click();
        row.remove();
        await later(20);
        expect(scope.runs).toBe(1);
        page.window.nagi.destroy(row);
        scope.n = 1;
        expect(scope.runs).toBe(1);
    });

    it("keeps __host for Nagi, so binds under a scope that names it still work", async () => {
        const page = await mount(`
            <div id="d" n-scope="{ __host: null, got: 0 }"><button id="b" n-on-click="got = 1"></button></div>
        `);
        page.$("#b").click();
        expect(page.scope("#d").got).toBe(1);
        expect(page.errors.map(([message, key]) => [message, key])).toEqual([["[Nagi] this name is Nagi's own:", "__host"]]);
    });

    it("reads the data-* of an element destroyed after it left the page", async () => {
        const page = await mount(`
            <div id="d" n-scope="{ got: '' }">
                <ul><li id="row" data-id="7"><button n-on-destroy="got = $dataset().id"></button></li></ul>
            </div>
        `);
        const row = page.$("#row");
        row.remove();
        page.window.nagi.destroy(row);
        expect(page.scope("#d").got).toBe("7");
    });

    it("acts from a bind's element after the await of its promise", async () => {
        const page = await mount(`
            <div id="d" n-scope>
                <p data-id="9"><span id="s" n-bind-textcontent="(async () => { ${tick}; return $dataset().id })()"></span></p>
            </div>
        `);
        await later(20);
        expect(page.$("#s").textContent).toBe("9");
    });

    it("gives the same helper each time it is read", async () => {
        const page = await mount(`<div id="d" n-scope="{ same: null }"><button id="b" n-on-click="same = $dispatch === $dispatch"></button></div>`);
        page.$("#b").click();
        expect(page.scope("#d").same).toBe(true);
    });

    it("gives a this.$watch made after an await to the scope's element, and still works without this", async () => {
        const page = await mount(`
            <div id="outer" n-scope="{ n: 0 }">
                <div id="d" n-scope="{ async start() { await 0; this.$watch(() => { this.n; globalThis.countA = (globalThis.countA ?? 0) + 1 }) } }">
                    <button id="b" n-on-click="start()"></button>
                    <button id="c" n-on-click="const w = $watch; w(() => { n; globalThis.countB = (globalThis.countB ?? 0) + 1 })"></button>
                </div>
            </div>
        `);
        const { window } = page;
        page.$("#b").click();
        await later(20);
        page.$("#c").click();
        expect([window.countA, window.countB]).toEqual([1, 1]);
        page.window.nagi.destroy(page.$("#d"));
        page.scope("#outer").n = 1;
        expect([window.countA, window.countB]).toEqual([1, 1]);
        expect(page.errors).toEqual([]);
    });

    it("starts no $watch, $debounce or read for an element and scope torn down during the await", async () => {
        let answer;
        const page = await mount(
            `<div id="outer" n-scope="{ n: 0 }">
                <div id="x" n-scope>
                    <button id="b" n-on-click="${tick}; $watch(() => { n; globalThis.goneWatch = (globalThis.goneWatch ?? 0) + 1 }); $debounce(() => (globalThis.goneTimer = true), 5); $get('/late')"></button>
                </div>
            </div>`,
            { server: () => new Promise((resolve) => (answer = resolve)) },
        );
        page.$("#b").click();
        const x = page.$("#x");
        page.window.nagi.destroy(x);
        x.remove();
        await later(30);
        page.scope("#outer").n = 1;
        expect(page.window.goneWatch).toBeUndefined();
        expect(page.window.goneTimer).toBeUndefined();
        expect(x.querySelector("#b").nagiRead).toBeFalsy();
        answer("");
        await page.settle();
    });

    it("lets live listeners of a stale handler's event start what they start", async () => {
        const page = await mount(`
            <div id="d" n-scope="{ got: 0 }" n-on-done.debounce10="got = 1">
                <button id="b" n-on-click="${tick}; $dispatch('done')"></button>
            </div>
        `);
        const b = page.$("#b");
        b.click();
        page.window.nagi.destroy(b);
        page.window.nagi.init(b);
        await later(40);
        expect(page.scope("#d").got).toBe(1);
    });

    it("ties no read to a scope element made anew when a request goes through the old scope", async () => {
        let answer;
        const page = await mount(
            `<div id="x" n-scope><button id="b" n-on-click="${tick}; this.$get('/x')"></button></div>`,
            { server: () => new Promise((resolve) => (answer = resolve)) },
        );
        const x = page.$("#x");
        page.$("#b").click();
        page.window.nagi.destroy(x);
        page.window.nagi.init(x);
        await later(20);
        expect(x.nagiRead).toBeFalsy();
        answer("");
        await page.settle();
    });

    it("leaves the new listeners and the live reads of a scope to a stale request, and persists nothing for it", async () => {
        let answers = [];
        const page = await mount(
            `<div id="d" n-scope="{ errs: 0, draft: 'live' }">
                <button id="b" n-on-fetcherr="errs++" n-on-click="${tick}; $persist('draft', 'staleDraft'); $get('/stale')"></button>
                <button id="list" n-on-click="$get('/list')"></button>
            </div>`,
            { server: (request) => new Promise((resolve) => answers.push([request.url, resolve])) },
        );
        const b = page.$("#b");
        b.click();
        page.window.nagi.destroy(b);
        page.window.nagi.init(b);
        page.$("#list").click();
        await later(20);
        expect(page.window.localStorage.getItem("staleDraft")).toBe(null);
        answers.forEach(([url, resolve]) => resolve(url.endsWith("/stale") ? { status: 500 } : ""));
        await page.settle();
        expect(page.scope("#d").errs).toBe(0);
        expect(page.requests.map((r) => new URL(r.url).pathname).sort()).toEqual(["/list", "/stale"]);
    });

    it("keeps an element given n-scope later from treating its own handlers as stale", async () => {
        const page = await mount(`<button id="b" n-on-click="$debounce(() => (globalThis.laterScope = true), 5)"></button>`);
        page.$("#b").setAttribute("n-scope", "{}");
        page.window.nagi.init(page.$("#b"));
        page.$("#b").click();
        await later(20);
        expect(page.window.laterScope).toBe(true);
    });

    it("starts nothing for a handler whose element was torn down and set up again during the await", async () => {
        const page = await mount(`
            <div id="d" n-scope="{ n: 0 }">
                <button id="b" n-on-click="${tick}; $watch(() => { n; globalThis.revivedWatch = (globalThis.revivedWatch ?? 0) + 1 })"></button>
            </div>
        `);
        const b = page.$("#b");
        b.click();
        page.window.nagi.destroy(b);
        page.window.nagi.init(b);
        await later(20);
        page.scope("#d").n = 1;
        expect(page.window.revivedWatch).toBeUndefined();
    });
});

