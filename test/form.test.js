import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";
import { later } from "./support.js";

describe("n-form", () => {
    const form = `
        <form id="f" n-scope="{}" n-form>
            <input name="text" value="hello">
            <input name="count" type="number" value="3">
            <input name="agree" type="checkbox" checked>
            <input name="size" type="radio" value="s">
            <input name="size" type="radio" value="m" checked>
            <select name="pick"><option>a</option><option selected>b</option></select>
            <button id="send">Send</button>
        </form>
    `;

    const swapOnce = async (page) => {
        page.$("#b").click();
        await page.settle();
    };

    it("copies each named field into the scope, typed by input type", async () => {
        const page = await mount(form);
        const scope = page.$("#f").nagiProxy;
        expect(scope.text).toBe("hello");
        expect(scope.count).toBe(3);
        expect(scope.agree).toBe(true);
        expect(scope.size).toBe("m");
        expect(scope.pick).toBe("b");
    });

    it("follows input and change events", async () => {
        const page = await mount(form);
        const input = page.$("[name=text]");
        input.value = "bye";
        input.dispatchEvent(new page.window.Event("input"));
        expect(page.$("#f").nagiProxy.text).toBe("bye");
    });

    it("writes to the name the field has when it changes, though a bind changed it", async () => {
        const page = await mount(`<form id="f" n-scope="{ k: 'b' }" n-form><input name="a" n-bind-name="k"></form>`);
        const input = page.$("[name=b]");
        input.value = "z";
        input.dispatchEvent(new page.window.Event("input"));
        expect(page.$("#f").nagiProxy.b).toBe("z");
    });

    it("disables the submit buttons while the scope is fetching", async () => {
        const page = await mount(form);
        const scope = page.$("#f").nagiProxy;
        scope.$fetching = true;
        await page.settle();
        expect(page.$("#send").disabled).toBe(true);

        scope.$fetching = false;
        await page.settle();
        expect(page.$("#send").disabled).toBe(false);
    });

    it("disables only the submit buttons, and leaves a button disabled in the HTML alone", async () => {
        const page = await mount(`
            <form id="f" n-scope n-form>
                <button id="submit"></button>
                <input id="image" type="image">
                <button id="plain" type="button"></button>
                <button id="off" disabled></button>
            </form>
        `);
        page.$("#f").nagiProxy.$fetching = true;
        await page.settle();
        expect(["submit", "image", "plain", "off"].map((id) => page.$(`#${id}`).disabled)).toEqual([true, true, false, true]);

        page.$("#f").nagiProxy.$fetching = false;
        await page.settle();
        expect(["submit", "image", "plain", "off"].map((id) => page.$(`#${id}`).disabled)).toEqual([false, false, false, true]);
    });

    it("disables a button while fetching that a bind enabled after the HTML disabled it", async () => {
        const page = await mount(`<form id="f" n-scope="{ ok: true }" n-form><button id="b" disabled n-bind-disabled="!ok"></button></form>`);
        expect(page.$("#b").disabled).toBe(false);
        page.$("#f").nagiProxy.$fetching = true;
        expect(page.$("#b").disabled).toBe(true);
        page.$("#f").nagiProxy.$fetching = false;
        expect(page.$("#b").disabled).toBe(false);
    });

    it("leaves a button disabled that a bind disabled during the request", async () => {
        const page = await mount(`<form id="f" n-scope="{ ok: true }" n-form><button id="b" n-bind-disabled="!ok"></button></form>`);
        const scope = page.$("#f").nagiProxy;
        scope.$fetching = true;
        scope.ok = false;
        scope.$fetching = false;
        expect(page.$("#b").disabled).toBe(true);
    });

    it("leaves alone a button a bind turned from submit into a plain button", async () => {
        const page = await mount(`<form id="f" n-scope n-form><button id="b" n-bind-type="'button'"></button></form>`);
        page.$("#f").nagiProxy.$fetching = true;
        expect(page.$("#b").disabled).toBe(false);
    });

    it("logs an n-form outside any scope, and leaves its fields and buttons alone", async () => {
        const answers = [];
        const page = await mount(
            `<form n-form><input name="q" value="a"><button id="send"></button></form>
            <span id="s" n-bind-textcontent="typeof q"></span>
            <button id="b" n-on-click="$get('/x')"></button>`,
            { server: () => new Promise((resolve) => answers.push(resolve)) },
        );
        expect(page.$("#s").textContent).toBe("undefined");
        expect(page.errors).toHaveLength(1);
        page.$("#b").click();
        expect(page.$("#send").disabled).toBe(false);
        answers.forEach((answer) => answer(""));
        await page.settle();
    });

    it("keeps the fields of an n-form inside a scope in that scope", async () => {
        const page = await mount(`<div id="d" n-scope><form n-form><input name="q" value="a"></form></div>`);
        expect(page.$("#d").nagiProxy.q).toBe("a");
        expect(page.$("form").nagiProxy).toBeUndefined();
    });

    it("logs a field named like a helper, and keeps the helper", async () => {
        const page = await mount(`<form id="f" n-scope n-form><input name="$fetching" value="x"></form>`);
        expect(page.$("#f").nagiProxy.$fetching).toBe(false);
        expect(page.errors).toHaveLength(1);
    });

    it("fills a field from a value the scope already has, and reads the field otherwise", async () => {
        const page = await mount(`
            <form id="f" n-scope="{ email: 'a@b.c' }" n-form>
                <input name="email" value="html"><input name="other" value="mine">
            </form>
        `);
        expect(page.$("[name=email]").value).toBe("a@b.c");
        expect(page.$("#f").nagiProxy.other).toBe("mine");
    });

    it("writes scope changes back to text, checkbox, radio and select fields", async () => {
        const page = await mount(`
            <form id="f" n-scope n-form>
                <input name="text" value="a"><input name="agree" type="checkbox">
                <input name="size" type="radio" value="s" checked><input name="size" type="radio" value="m">
                <select name="pick"><option>a</option><option>b</option></select>
            </form>
        `);
        const scope = page.$("#f").nagiProxy;
        scope.text = "b";
        scope.agree = true;
        scope.size = "m";
        scope.pick = "b";
        expect(page.$("[name=text]").value).toBe("b");
        expect(page.$("[name=agree]").checked).toBe(true);
        expect([...page.window.document.querySelectorAll("[name=size]")].map((r) => r.checked)).toEqual([false, true]);
        expect(page.$("[name=pick]").value).toBe("b");
    });

    it("leaves what is typed in a number field alone when it reads as the same number", async () => {
        const page = await mount(`<form id="f" n-scope n-form><input name="n" type="number"></form>`);
        const input = page.$("[name=n]");
        input.value = "1.";
        input.dispatchEvent(new page.window.Event("input"));
        expect(page.$("#f").nagiProxy.n).toBe(1);
        expect(input.value).toBe("1.");
    });

    it("reads the fields again after the form is reset", async () => {
        const page = await mount(`<form id="f" n-scope n-form><input name="q" value="x"></form>`);
        const input = page.$("[name=q]");
        input.value = "y";
        input.dispatchEvent(new page.window.Event("input"));
        page.$("#f").reset();
        await later(10);
        expect(page.$("#f").nagiProxy.q).toBe("x");
    });

    it("does not copy named buttons", async () => {
        const page = await mount(`<form id="f" n-scope n-form><button name="action" value="save"></button></form>`);
        expect("action" in page.$("#f").nagiRaw).toBe(false);
    });

    it("keeps submit buttons disabled for the whole request, whatever their binds say", async () => {
        const page = await mount(`
            <form id="f" n-scope="{ ok: true }" n-form>
                <button id="a" n-bind-disabled="!ok"></button><button id="b" disabled n-bind-disabled="!ok"></button>
            </form>
        `);
        const scope = page.$("#f").nagiProxy;
        scope.$fetching = true;
        scope.ok = false;
        scope.ok = true;
        expect([page.$("#a").disabled, page.$("#b").disabled]).toEqual([true, true]);
        scope.$fetching = false;
        expect([page.$("#a").disabled, page.$("#b").disabled]).toEqual([false, false]);
    });

    it("keeps the checked radio's value when an unchecked one comes after it", async () => {
        const page = await mount(`
            <form id="f" n-scope="{}" n-form>
                <input type="radio" name="c" value="a" checked>
                <input type="radio" name="c" value="b">
            </form>
        `);
        expect(page.$("#f").nagiProxy.c).toBe("a");
    });

    it("still defines the group's key", async () => {
        const page = await mount(`
            <form n-scope="{}" n-form>
                <input type="radio" name="c" value="a">
                <input type="radio" name="c" value="b">
                <span id="s" n-bind-textcontent="c ?? 'none'"></span>
            </form>
        `);
        expect(page.$("#s").textContent).toBe("none");
        expect(page.errors).toEqual([]);
    });

    it("keeps the fields of an inner n-form in the form's scope", async () => {
        const page = await mount(`
            <div id="outer" n-scope="{ name: 'Page title' }">
                <form id="f" n-scope n-form><input name="name" value="typed"></form>
            </div>
        `);
        expect(page.$("#outer").nagiProxy.name).toBe("Page title");
        expect(page.$("#f").nagiProxy.name).toBe("typed");
    });

    it("wires the new fields and submit buttons of an n-form target", async () => {
        const page = await mount(
            `<div n-scope="{}">
                <button id="b" type="button" n-on-click="$get('/x')"></button>
                <form id="target" n-form></form>
            </div>`,
            { server: () => `<form id="target" n-swap="inner"><input name="q" value="hi"><button id="go">Go</button></form>` },
        );
        await swapOnce(page);
        const scope = page.scope("#target");
        expect(scope.q).toBe("hi");

        const input = page.$("[name=q]");
        input.value = "bye";
        input.dispatchEvent(new page.window.Event("input"));
        expect(scope.q).toBe("bye");

        scope.$fetching = true;
        expect(page.$("#go").disabled).toBe(true);
    });

    it("wires the fields swapped into an element inside an n-form", async () => {
        const page = await mount(
            `<form n-scope="{}" n-form>
                <button id="b" type="button" n-on-click="$get('/x')"></button>
                <div id="target"></div>
            </form>`,
            { server: () => `<div id="target" n-swap="inner"><input name="q" value="hi"></div>` },
        );
        await swapOnce(page);
        expect(page.scope("#target").q).toBe("hi");
    });
});
