import { describe, expect, it } from "vitest";
import { mount } from "./helpers.js";

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
