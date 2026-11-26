import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";

const button = (call, scope = "{}") => `
    <div id="d" nm-data="${scope}"><button id="b" nm-on-click="${call}"></button></div>
    <div id="target">old</div>
`;

describe("requests", () => {
    it("$get sends the data in the query string with the nm-request header", async () => {
        const page = await mount(button(`$get('/x', { q: 'a b' })`), { server: () => "" });
        page.$("#b").click();
        await page.settle();

        const [request] = page.requests;
        expect(request.method).toBe("GET");
        expect(request.url).toBe("http://localhost/x?q=a+b");
        expect(request.headers["nm-request"]).toBe("true");
    });

    it("$get appends to a query string the URL already has", async () => {
        const page = await mount(button(`$get('/x?page=2', { q: 'a' })`), { server: () => "" });
        page.$("#b").click();
        await page.settle();
        expect(page.requests[0].url).toBe("http://localhost/x?page=2&q=a");
    });

    it("$post sends the data as a urlencoded body", async () => {
        const page = await mount(button(`$post('/x', { q: 'a' })`), { server: () => "" });
        page.$("#b").click();
        await page.settle();

        const [request] = page.requests;
        expect(request.method).toBe("POST");
        expect(request.url).toBe("http://localhost/x");
        expect(request.body).toBe("q=a");
    });

    it("sends the scope's letter-only primitive members, calling functions for them", async () => {
        const page = await mount(
            button(`$get('/x')`, "{ name: 'n', list: [1, 2], obj: { a: 1 }, _hidden: 1, getter() { return 'g' } }"),
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();

        const query = new URL(page.requests[0].url).searchParams;
        expect(query.get("name")).toBe("n");
        expect(query.get("list")).toBe("1,2");
        expect(query.get("getter")).toBe("g");
        expect(query.has("obj")).toBe(false);
        expect(query.has("_hidden")).toBe(false);
    });

    it("sends the data-* of the element up to its scope", async () => {
        const page = await mount(
            `<div nm-data="{}" data-from-scope="s"><button id="b" data-from-button="b" nm-on-click="$get('/x')"></button></div>`,
            { server: () => "" },
        );
        page.$("#b").click();
        await page.settle();

        const query = new URL(page.requests[0].url).searchParams;
        expect(query.get("fromScope")).toBe("s");
        expect(query.get("fromButton")).toBe("b");
    });

    it("lets the call's data win over the scope's", async () => {
        const page = await mount(button(`$get('/x', { name: 'call' })`, "{ name: 'scope' }"), { server: () => "" });
        page.$("#b").click();
        await page.settle();
        expect(new URL(page.requests[0].url).searchParams.get("name")).toBe("call");
    });

    it("sets _nmFetching while a request is out", async () => {
        let answer;
        const page = await mount(button(`$get('/x')`), {
            server: () => new Promise((resolve) => (answer = resolve)),
        });
        page.$("#b").click();
        expect(page.scope("#b")._nmFetching).toBe(true);

        answer("");
        await page.settle();
        expect(page.scope("#b")._nmFetching).toBe(false);
    });

    it("aborts the scope's request in flight when it makes another", async () => {
        const answers = [];
        const page = await mount(
            `<div nm-data="{}"><button id="b" nm-on-click="$get('/x')"></button></div>
            <div id="target">old</div>`,
            { server: () => new Promise((resolve) => answers.push(resolve)) },
        );
        const signals = [];
        const fetch = page.window.fetch;
        page.window.fetch = (url, opts) => {
            signals.push(opts.signal);
            return fetch(url, opts);
        };
        page.$("#b").click();
        page.$("#b").click();
        expect(signals.map((s) => s.aborted)).toEqual([true, false]);

        answers[0](`<div id="target">first</div>`);
        answers[1](`<div id="target">second</div>`);
        await page.settle();
        expect(page.$("#target").textContent).toBe("second");
    });

    it("swaps the newer answer when it aborts a request whose body is being read", async () => {
        let reading;
        const read = new Promise((resolve) => (reading = resolve));
        const slow = new ReadableStream({ pull: () => reading() }, { highWaterMark: 0 });
        const answers = [new Response(slow), `<div id="target">second</div>`];
        const page = await mount(
            `<div nm-data="{}"><button id="b" nm-on-click="$get('/x')"></button></div>
            <div id="target">old</div>`,
            { server: () => answers.shift() },
        );
        page.$("#b").click();
        await read;
        page.$("#b").click();
        await page.settle();
        expect(page.$("#target").textContent).toBe("second");
    });

    it("dispatches fetcherr when the answer's body fails partway", async () => {
        const page = await mount(
            `<div nm-data="{ _err: null }" nm-on-fetcherr="_err = e.detail.err">
                <button id="b" nm-on-click="$get('/x')"></button>
            </div>`,
            { server: () => new Response(new ReadableStream({ start: (c) => c.error(new Error("cut")) })) },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.scope("#b")._err.message).toBe("cut");
    });

    it("dispatches fetcherr from the element when the answer is not ok, and swaps nothing", async () => {
        const page = await mount(
            `<div nm-data="{ _err: null }" nm-on-fetcherr="_err = e.detail">
                <button id="b" nm-on-click="$get('/x', { q: 1 })"></button>
            </div>
            <div id="target">old</div>`,
            { server: () => ({ status: 500, body: `<div id="target">new</div>` }) },
        );
        page.$("#b").click();
        await page.settle();

        expect(page.scope("#b")._err.url).toBe("/x?q=1");
        expect(page.$("#target").textContent).toBe("old");
    });
});

describe("swaps", () => {
    const swap = async (answer, html = `<div id="target" class="t"><span>old</span></div>`) => {
        const page = await mount(button(`$get('/x')`) .replace(`<div id="target">old</div>`, html), {
            server: () => answer,
        });
        page.$("#b").click();
        await page.settle();
        return page;
    };

    it("replaces the element with the same id by default", async () => {
        const page = await swap(`<div id="target"><b>new</b></div>`);
        expect(page.$("#target").outerHTML).toBe(`<div id="target"><b>new</b></div>`);
    });

    it("replaces only the children with nm-swap=inner", async () => {
        const page = await swap(`<div id="target" nm-swap="inner"><b>new</b></div>`);
        expect(page.$("#target").outerHTML).toBe(`<div id="target" class="t"><b>new</b></div>`);
    });

    it.each([
        ["before", `<b>new</b><div id="target" class="t"><span>old</span></div>`],
        ["after", `<div id="target" class="t"><span>old</span></div><b>new</b>`],
        ["prepend", `<div id="target" class="t"><b>new</b><span>old</span></div>`],
        ["append", `<div id="target" class="t"><span>old</span><b>new</b></div>`],
    ])("puts the children %s the element", async (strategy, expected) => {
        const page = await swap(`<div id="target" nm-swap="${strategy}"><b>new</b></div>`);
        expect(page.$("#target").parentElement.innerHTML).toContain(expected);
    });

    it("swaps every element of the answer that has an id", async () => {
        const page = await swap(
            `<div id="target">one</div><div id="d2">two</div>`,
            `<div id="target">old</div><div id="d2">old</div>`,
        );
        expect(page.$("#target").textContent).toBe("one");
        expect(page.$("#d2").textContent).toBe("two");
    });

    it("warns about an element with no id or no target, and skips it", async () => {
        const page = await swap(`<p>no id</p><div id="nowhere">x</div>`);
        expect(page.warnings).toHaveLength(2);
        expect(page.$("#target").textContent).toBe("old");
    });

    it("binds what it swaps in", async () => {
        const page = await swap(
            `<div id="target" nm-data="{ n: 9 }"><span id="s" nm-bind-text-content="n"></span></div>`,
        );
        expect(page.$("#s").textContent).toBe("9");
    });

    it("dispatches destroy on the bound elements it replaces", async () => {
        const page = await mount(
            `<div nm-data="{ gone: [] }" id="d">
                <button id="b" nm-on-click="$get('/x')"></button>
                <div id="target"><span nm-on-destroy="gone = [...gone, 'span']"></span></div>
            </div>`,
            { server: () => `<div id="target"></div>` },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.$("#d").nmProxy.gone).toEqual(["span"]);
    });

    it("is waited for by settle() however slowly the answer comes", async () => {
        const later = (ms, value) => new Promise((resolve) => setTimeout(() => resolve(value), ms));
        const encoder = new TextEncoder();
        const body = new ReadableStream({
            async pull(controller) {
                controller.enqueue(encoder.encode(await later(50, `<div id="target">new</div>`)));
                controller.close();
            },
        });
        const page = await swap(later(50, new Response(body)));
        expect(page.$("#target").textContent).toBe("new");
    });

    it("swaps an answer streamed in pieces as one", async () => {
        const encoder = new TextEncoder();
        const body = new ReadableStream({
            start(controller) {
                controller.enqueue(encoder.encode(`<div id="target">`));
                controller.enqueue(encoder.encode(`new</div>`));
                controller.close();
            },
        });
        const page = await swap(new Response(body));
        expect(page.$("#target").textContent).toBe("new");
    });
});

describe("swap strategies and their element's lifecycle", () => {
    const mountSwap = (html, answer) =>
        mount(
            `<div id="d" nm-data="{ hits: 0, gone: [] }">
                <button id="b" nm-on-click="$get('/x')"></button>
                ${html}
            </div>`,
            { server: () => answer },
        );

    const swapOnce = async (page) => {
        page.$("#b").click();
        await page.settle();
    };

    it("binds the target of an inner swap only once", async () => {
        const page = await mountSwap(
            `<div id="target" nm-on-ping="hits++"></div>`,
            `<div id="target" nm-swap="inner"><span>new</span></div>`,
        );
        await swapOnce(page);
        await swapOnce(page);
        page.$("#target").dispatchEvent(new page.window.Event("ping"));
        expect(page.$("#d").nmProxy.hits).toBe(1);
    });

    it("keeps the scope of the target of an inner swap, and binds the new children to it", async () => {
        const page = await mount(
            `<button id="b" nm-on-click="$get('/x')"></button>
            <div id="target" nm-data="{ n: 1 }"></div>`,
            { server: () => `<div id="target" nm-swap="inner"><span id="s" nm-bind-text-content="n"></span></div>` },
        );
        const scope = page.$("#target").nmProxy;
        scope.n = 5;
        await swapOnce(page);
        expect(page.$("#target").nmProxy).toBe(scope);
        expect(page.$("#s").textContent).toBe("5");
        scope.n = 6;
        expect(page.$("#s").textContent).toBe("6");
    });

    it("logs a strategy that only contains a valid one, and goes on with the rest", async () => {
        const page = await mountSwap(
            `<div id="target">old</div><div id="other">old</div>`,
            `<div id="target" nm-swap="afterend">new</div><div id="other">new</div>`,
        );
        await swapOnce(page);
        expect(page.$("#target").textContent).toBe("old");
        expect(page.$("#other").textContent).toBe("new");
        expect(page.errors).toHaveLength(1);
    });

    const destroyed = `
        <div id="target" nm-on-destroy="gone = [...gone, 'target']">
            <span nm-on-destroy="gone = [...gone, 'child']"></span>
        </div>
    `;

    it("sends destroy to the target and what is in it on an outer swap", async () => {
        const page = await mountSwap(destroyed, `<div id="target"></div>`);
        await swapOnce(page);
        expect(page.$("#d").nmProxy.gone).toEqual(["target", "child"]);
    });

    it("sends destroy only to the children on an inner swap", async () => {
        const page = await mountSwap(destroyed, `<div id="target" nm-swap="inner"></div>`);
        await swapOnce(page);
        expect(page.$("#d").nmProxy.gone).toEqual(["child"]);
    });

    it.each(["before", "after", "prepend", "append"])("sends no destroy on a %s swap", async (strategy) => {
        const page = await mountSwap(destroyed, `<div id="target" nm-swap="${strategy}"><b>new</b></div>`);
        await swapOnce(page);
        expect(page.$("#d").nmProxy.gone).toEqual([]);
    });
});

describe("inner swaps into elements with nm-form, nm-use and nm-ref", () => {
    const swapOnce = async (page) => {
        page.$("#b").click();
        await page.settle();
    };

    it("wires the new fields and submit buttons of an nm-form target", async () => {
        const page = await mount(
            `<div nm-data="{}">
                <button id="b" type="button" nm-on-click="$get('/x')"></button>
                <form id="target" nm-form></form>
            </div>`,
            { server: () => `<form id="target" nm-swap="inner"><input name="q" value="hi"><button id="go">Go</button></form>` },
        );
        await swapOnce(page);
        const scope = page.scope("#target");
        expect(scope.q).toBe("hi");

        const input = page.$("[name=q]");
        input.value = "bye";
        input.dispatchEvent(new page.window.Event("input"));
        expect(scope.q).toBe("bye");

        scope._nmFetching = true;
        expect(page.$("#go").disabled).toBe(true);
    });

    it("wires the fields swapped into an element inside an nm-form", async () => {
        const page = await mount(
            `<form nm-data="{}" nm-form>
                <button id="b" type="button" nm-on-click="$get('/x')"></button>
                <div id="target"></div>
            </form>`,
            { server: () => `<div id="target" nm-swap="inner"><input name="q" value="hi"></div>` },
        );
        await swapOnce(page);
        expect(page.scope("#target").q).toBe("hi");
    });

    it("keeps the template of an nm-use target around the new children", async () => {
        const page = await mount(
            `<template id="frame"><div class="frame"><slot></slot></div></template>
            <div nm-data="{ n: 3 }">
                <button id="b" nm-on-click="$get('/x')"></button>
                <div id="target" nm-use="frame"><p>old</p></div>
            </div>`,
            { server: () => `<div id="target" nm-swap="inner"><p id="p" nm-bind-text-content="n">new</p></div>` },
        );
        await swapOnce(page);
        expect(page.$("#target").innerHTML).toBe(`<div class="frame"><p id="p" nm-bind-text-content="n">3</p></div>`);
    });

    it("forgets the $refs of the children it removes", async () => {
        const page = await mount(
            `<div id="target" nm-data="{}">
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
            `<div id="target" nm-data="{}">
                <button id="b" nm-on-click="$get('/x')"></button>
                <input nm-ref="box">
            </div>`,
            { server: () => `<div id="target" nm-swap="inner"><input id="new" nm-ref="box"></div>` },
        );
        await swapOnce(page);
        expect(page.$("#target").nmProxy.$refs.box).toBe(page.$("#new"));
    });
});

describe("a request's lifecycle", () => {
    const later = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    it("sends no fetcherr for a request it aborted, and stays fetching for the newer one", async () => {
        const answers = [];
        const page = await mount(
            `<div nm-data="{ _errs: [] }" nm-on-fetcherr="_errs = [..._errs, e.detail.err]">
                <button id="b" nm-on-click="$get('/x')"></button>
            </div>`,
            { server: () => new Promise((resolve) => answers.push(resolve)) },
        );
        page.$("#b").click();
        page.$("#b").click();
        await later(10);
        const scope = page.scope("#b");
        expect(scope._errs).toEqual([]);
        expect(scope._nmFetching).toBe(true);

        answers[1]("");
        await page.settle();
        expect(scope._nmFetching).toBe(false);
    });

    it("swaps nothing from a request aborted while its body is arriving", async () => {
        const encoder = new TextEncoder();
        let send;
        const first = new ReadableStream({ start: (controller) => (send = controller) });
        const answers = [new Response(first), `<div id="other">second</div>`];
        const page = await mount(
            `<div nm-data="{}"><button id="b" nm-on-click="$get('/x')"></button></div>
            <div id="target">old</div><div id="other">old</div>`,
            { server: () => answers.shift() },
        );
        page.$("#b").click();
        await later(5);
        send.enqueue(encoder.encode(`<div id="target">first</div>`));
        await later(5);
        page.$("#b").click();
        await page.settle();
        await later(40);
        expect(page.$("#other").textContent).toBe("second");
        expect(page.$("#target").textContent).toBe("old");
    });

    it("swaps an answer whose pieces come far apart as one", async () => {
        const encoder = new TextEncoder();
        const body = new ReadableStream({
            async start(controller) {
                controller.enqueue(encoder.encode(`<div id="target"><p>a`));
                await later(50);
                controller.enqueue(encoder.encode(`b</p></div>`));
                controller.close();
            },
        });
        const page = await mount(
            `<div nm-data="{}"><button id="b" nm-on-click="$get('/x')"></button></div>
            <div id="target">old</div>`,
            { server: () => new Response(body) },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.$("#target").innerHTML).toBe("<p>ab</p>");
        expect(page.warnings).toEqual([]);
    });

    it("is still fetching until what it answered is swapped in", async () => {
        const page = await mount(
            `<div nm-data="{ seen: [] }">
                <button id="b" nm-on-click="$get('/x')" nm-on-init="$watch(() => _nmFetching || seen.push(document.getElementById('target').textContent))"></button>
            </div>
            <div id="target">old</div>`,
            { server: () => `<div id="target">new</div>` },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.scope("#b").seen).toEqual(["old", "new"]);
    });

    it("takes an answer with no body as nothing to swap", async () => {
        const page = await mount(
            `<div nm-data="{ _err: null }" nm-on-fetcherr="_err = e.detail.err">
                <button id="b" nm-on-click="$get('/x')"></button>
            </div>
            <div id="target">old</div>`,
            { server: () => ({ status: 204 }) },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.scope("#b")._err).toBeNull();
        expect(page.$("#target").textContent).toBe("old");
        expect(page.scope("#b")._nmFetching).toBe(false);
    });

    it("aborts the request of a scope a swap removes", async () => {
        const signals = [];
        let answerInner;
        const page = await mount(
            `<div nm-data="{}"><button id="outer" nm-on-click="$get('/outer')"></button></div>
            <div id="target" nm-data="{}">
                <button id="inner" nm-on-click="$get('/inner')"></button>
            </div>
            <div id="late">old</div>`,
            {
                server: ({ url }) =>
                    url.endsWith("/inner")
                        ? new Promise((resolve) => (answerInner = resolve))
                        : `<div id="target"></div>`,
            },
        );
        const fetch = page.window.fetch;
        page.window.fetch = (url, opts) => {
            signals.push(opts.signal);
            return fetch(url, opts);
        };
        page.$("#inner").click();
        page.$("#outer").click();
        await later(20);
        expect(signals[0].aborted).toBe(true);
        answerInner(`<div id="late">late</div>`);
        await page.settle();
        expect(page.$("#late").textContent).toBe("old");
    });

    it("does not rerun a watcher that read the abort signal when it makes a request", async () => {
        const page = await mount(
            `<div nm-data="{ q: 'a' }">
                <span nm-on-init="$watch(() => { q; $debounce(() => 0, 10); $get('/s') })"></span>
            </div>`,
            { server: () => "" },
        );
        await page.settle();
        expect(page.requests).toHaveLength(1);
        expect(page.errors).toEqual([]);
    });

    it("does not rerun a watcher that debounces a request when the request is made", async () => {
        const page = await mount(
            `<div nm-data="{ q: 'a' }">
                <span nm-on-init="$watch(() => { q; $debounce(() => $get('/s'), 10) })"></span>
            </div>`,
            { server: () => "" },
        );
        await page.settle();
        await later(50);
        await page.settle();
        expect(page.requests).toHaveLength(1);
    });

    it("does not track what a request reads into the watcher that made it", async () => {
        const page = await mount(
            `<div nm-data="{ q: 'a' }">
                <span nm-on-init="$watch(() => $get('/s', { q }))"></span>
            </div>`,
            { server: () => "" },
        );
        await page.settle();
        await later(30);
        await page.settle();
        expect(page.requests).toHaveLength(1);
    });
});

describe("reads and writes", () => {
    const later = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const mountWrites = (answers) =>
        mount(
            `<div nm-data="{}">
                <button id="order" nm-on-click="$post('/order')"></button>
                <button id="del" nm-on-click="$fetch('/item', 'DELETE')"></button>
                <button id="search" nm-on-click="$get('/search')"></button>
            </div>
            <div id="done">old</div><div id="results">old</div>`,
            {
                server: ({ url }) => {
                    const path = new URL(url).pathname;
                    return new Promise((resolve) => (answers[path] = resolve));
                },
            },
        );

    it("does not abort a write when a read starts", async () => {
        const answers = {};
        const page = await mountWrites(answers);
        page.$("#order").click();
        page.$("#search").click();
        answers["/search"](`<div id="results">found</div>`);
        await later(10);
        answers["/order"](`<div id="done">ordered</div>`);
        await page.settle();
        expect(page.$("#done").textContent).toBe("ordered");
        expect(page.$("#results").textContent).toBe("found");
    });

    it("does not abort a DELETE when a read starts", async () => {
        const answers = {};
        const page = await mountWrites(answers);
        page.$("#del").click();
        page.$("#search").click();
        answers["/search"]("");
        answers["/item"](`<div id="done">deleted</div>`);
        await page.settle();
        expect(page.$("#done").textContent).toBe("deleted");
    });

    it("sends no second write like the one out, and sends one after it", async () => {
        const answers = {};
        const page = await mountWrites(answers);
        page.$("#order").click();
        page.$("#order").click();
        expect(page.requests.filter((r) => r.method === "POST")).toHaveLength(1);

        answers["/order"]("");
        await page.settle();
        page.$("#order").click();
        expect(page.requests.filter((r) => r.method === "POST")).toHaveLength(2);
        answers["/order"]("");
        await page.settle();
    });

    it("sends a different write while one is out", async () => {
        const answers = {};
        const page = await mountWrites(answers);
        page.$("#order").click();
        page.$("#del").click();
        expect(page.requests.map((r) => r.method)).toEqual(["POST", "DELETE"]);
        answers["/order"]("");
        answers["/item"]("");
        await page.settle();
    });

    it("sends a write with other data while one is out", async () => {
        let answer;
        const page = await mount(
            `<div nm-data="{}">
                <button id="a" nm-on-click="$post('/save', { v: 1 })"></button>
                <button id="b" nm-on-click="$post('/save', { v: 2 })"></button>
            </div>`,
            { server: () => new Promise((resolve) => (answer = resolve)) },
        );
        page.$("#a").click();
        page.$("#b").click();
        expect(page.requests.map((r) => r.body)).toEqual(["v=1", "v=2"]);
    });

    it("sends fetchskip from the element for a write it did not send", async () => {
        const answers = {};
        const page = await mount(
            `<div nm-data="{ _skipped: [] }" nm-on-fetchskip="_skipped = [..._skipped, e.detail]">
                <button id="order" nm-on-click="$post('/order')"></button>
            </div>`,
            { server: () => new Promise((resolve) => (answers.order = resolve)) },
        );
        page.$("#order").click();
        page.$("#order").click();
        expect(page.scope("#order")._skipped).toEqual([{ method: "POST", url: "/order" }]);
    });

    it("takes OPTIONS as a read, aborted by a newer request", async () => {
        const signals = [];
        const page = await mount(
            `<div nm-data="{}">
                <button id="o" nm-on-click="$fetch('/x', 'OPTIONS')"></button>
                <button id="g" nm-on-click="$get('/y')"></button>
            </div>`,
            { server: () => "" },
        );
        const fetch = page.window.fetch;
        page.window.fetch = (url, opts) => {
            signals.push(opts.signal);
            return fetch(url, opts);
        };
        page.$("#o").click();
        page.$("#g").click();
        expect(signals[0].aborted).toBe(true);
        await page.settle();
    });

    it("sends fetcherr to document when the element that asked is gone", async () => {
        let answer;
        const page = await mount(
            `<div nm-data="{}"><button id="outer" nm-on-click="$get('/outer')"></button></div>
            <div id="target" nm-data="{}"><button id="order" nm-on-click="$post('/order')"></button></div>`,
            {
                server: ({ url }) =>
                    url.endsWith("/order") ? new Promise((resolve) => (answer = resolve)) : `<div id="target"></div>`,
            },
        );
        const errs = [];
        page.document.addEventListener("fetcherr", (e) => errs.push(e.detail.url));
        page.$("#order").click();
        page.$("#outer").click();
        await later(10);
        answer({ status: 500, body: "no" });
        await page.settle();
        expect(errs).toEqual(["/order"]);
    });

    it("aborts a read when a write starts", async () => {
        const answers = {};
        const page = await mountWrites(answers);
        page.$("#search").click();
        page.$("#order").click();
        answers["/search"](`<div id="results">stale</div>`);
        answers["/order"]("");
        await page.settle();
        expect(page.$("#results").textContent).toBe("old");
    });

    it("stays fetching while any request is out", async () => {
        const answers = {};
        const page = await mountWrites(answers);
        const scope = page.scope("#order");
        page.$("#order").click();
        page.$("#search").click();
        answers["/search"]("");
        await later(10);
        expect(scope._nmFetching).toBe(true);
        answers["/order"]("");
        await page.settle();
        expect(scope._nmFetching).toBe(false);
    });

    it("lets a write finish when a swap removes its scope", async () => {
        let answer;
        const page = await mount(
            `<div nm-data="{}"><button id="outer" nm-on-click="$get('/outer')"></button></div>
            <div id="target" nm-data="{}"><button id="order" nm-on-click="$post('/order')"></button></div>
            <div id="done">old</div>`,
            {
                server: ({ url }) =>
                    url.endsWith("/order") ? new Promise((resolve) => (answer = resolve)) : `<div id="target"></div>`,
            },
        );
        page.$("#order").click();
        page.$("#outer").click();
        await later(10);
        answer(`<div id="done">ordered</div>`);
        await page.settle();
        expect(page.$("#done").textContent).toBe("ordered");
    });

    it("drops an abortable debounce when a write starts", async () => {
        const page = await mount(
            `<div nm-data="{ got: [] }">
                <input id="i" nm-on-input="$debounce(() => got = [...got, 'search'], 20, true)">
                <button id="b" nm-on-click="$post('/order')"></button>
            </div>`,
            { server: () => "" },
        );
        page.$("#i").dispatchEvent(new page.window.Event("input"));
        page.$("#b").click();
        await page.settle();
        expect(page.scope("#i").got).toEqual([]);
    });
});
