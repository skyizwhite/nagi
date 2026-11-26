import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";

const button = (call, scope = "{}") => `
    <div id="d" nm-data="${scope}"><button id="b" nm-bind="{ onclick: () => ${call} }"></button></div>
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
            `<div nm-data="{}" data-from-scope="s"><button id="b" data-from-button="b" nm-bind="{ onclick: () => $get('/x') }"></button></div>`,
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
            `<div nm-data="{}"><button id="b" nm-bind="{ onclick: () => $get('/x') }"></button></div>
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
            `<div nm-data="{}"><button id="b" nm-bind="{ onclick: () => $get('/x') }"></button></div>
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
            `<div nm-data="{ _err: null }" nm-bind="{ onfetcherr: (e) => _err = e.detail.err }">
                <button id="b" nm-bind="{ onclick: () => $get('/x') }"></button>
            </div>`,
            { server: () => new Response(new ReadableStream({ start: (c) => c.error(new Error("cut")) })) },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.scope("#b")._err.message).toBe("cut");
    });

    it("dispatches fetcherr from the element when the answer is not ok, and swaps nothing", async () => {
        const page = await mount(
            `<div nm-data="{ _err: null }" nm-bind="{ onfetcherr: (e) => _err = e.detail }">
                <button id="b" nm-bind="{ onclick: () => $get('/x', { q: 1 }) }"></button>
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
            `<div id="target" nm-data="{ n: 9 }"><span id="s" nm-bind="{ textContent: () => n }"></span></div>`,
        );
        expect(page.$("#s").textContent).toBe("9");
    });

    it("dispatches destroy on the bound elements it replaces", async () => {
        const page = await mount(
            `<div nm-data="{ gone: [] }" id="d">
                <button id="b" nm-bind="{ onclick: () => $get('/x') }"></button>
                <div id="target"><span nm-bind="{ ondestroy: () => gone = [...gone, 'span'] }"></span></div>
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
