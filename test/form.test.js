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

    it("shows the value of a field a response brings in where the page could not read it before", async () => {
        const page = await mount(
            `<form n-scope n-form>
                <span id="s" n-bind-textcontent="extra"></span>
                <div id="target"></div>
                <button type="button" id="b" n-on-click="$get('/x')"></button>
            </form>`,
            { server: () => `<div id="target"><input name="extra" value="hi"></div>` },
        );
        await swapOnce(page);
        expect(page.$("#s").textContent).toBe("hi");
    });

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

    it("keeps writing to the name a field had when it was set up", async () => {
        const page = await mount(`<form id="f" n-scope="{ k: 'b' }" n-form><input name="a" n-bind-name="k"></form>`);
        const input = page.$("[name=b]");
        input.value = "z";
        input.dispatchEvent(new page.window.Event("input"));
        expect(page.$("#f").nagiProxy.a).toBe("z");
        expect("b" in page.$("#f").nagiRaw).toBe(false);
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

    it("logs a field whose name n-scope or n-let-* already gave the scope, and leaves it out", async () => {
        const page = await mount(`
            <form id="f" n-scope="{ email: 'a@b.c' }" n-let-q="'x'" n-form><input name="email" value="html"><input name="q" value="y"></form>
        `);
        const scope = page.$("#f").nagiProxy;
        expect([scope.email, scope.q]).toEqual(["a@b.c", "x"]);
        expect(page.errors).toHaveLength(2);
    });

    it("writes a scope value into a field only through n-bind-value", async () => {
        const page = await mount(`<form id="f" n-scope n-form><input name="q" value="a" n-bind-value="q"><input name="other" value="o"></form>`);
        const scope = page.$("#f").nagiProxy;
        scope.q = "b";
        scope.other = "x";
        expect(page.$("[name=q]").value).toBe("b");
        expect(page.$("[name=other]").value).toBe("o");
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

    it("logs fields other than radios that share a name, and reads only the first", async () => {
        const page = await mount(`
            <form id="f" n-scope n-form>
                <input type="checkbox" name="t" value="a" checked><input type="checkbox" name="t" value="b">
                <input type="hidden" name="ids" value="1"><input type="hidden" name="ids" value="2">
            </form>
        `);
        const scope = page.$("#f").nagiProxy;
        expect([scope.t, scope.ids]).toEqual([true, "1"]);
        expect(page.errors).toHaveLength(2);
    });

    it("lets a field a swap brings in take the name of the one it replaced", async () => {
        const page = await mount(
            `<form id="f" n-scope n-form><div id="g"><input name="q" value="old"></div><button id="b" type="button" n-on-click="$get('/x')"></button></form>`,
            { server: () => `<div id="g"><input name="q" value="new"></div>` },
        );
        page.$("#b").click();
        await page.settle();
        expect(page.$("#f").nagiProxy.q).toBe("new");
        expect(page.errors).toEqual([]);
    });

    it("does not copy named input buttons", async () => {
        const page = await mount(`
            <form id="f" n-scope n-form><input type="submit" name="act" value="Save"><input type="submit" name="act" value="Delete"></form>
        `);
        expect("act" in page.$("#f").nagiRaw).toBe(false);
        expect([...page.window.document.querySelectorAll("[name=act]")].map((el) => el.value)).toEqual(["Save", "Delete"]);
    });

    it("stops following resets for a field a swap removed", async () => {
        const page = await mount(
            `<form id="f" n-scope n-form>
                <div id="extra"><input name="coupon" value="X"></div>
                <button id="b" type="button" n-on-click="$get('/x')"></button>
            </form>`,
            { server: () => `<div id="extra"></div>` },
        );
        page.$("#b").click();
        await page.settle();
        page.$("#f").nagiProxy.coupon = "gone";
        page.$("#f").reset();
        await later(10);
        expect(page.$("#f").nagiProxy.coupon).toBe("gone");
    });

    it("reads only native fields, leaving outputs and custom elements to n-on-*", async () => {
        const page = await mount(
            `<form id="f" n-scope n-form><output name="total">3</output><x-pick name="pick"></x-pick></form>`,
            { beforeInit: (window) => window.customElements.define("x-pick", class extends window.HTMLElement { value = "p"; }) },
        );
        expect(["total" in page.$("#f").nagiRaw, "pick" in page.$("#f").nagiRaw]).toEqual([false, false]);
    });

    it("reads a checkbox as a boolean, whether or not it has a value", async () => {
        const page = await mount(`<form id="f" n-scope n-form><input type="checkbox" name="agree" value="yes"></form>`);
        expect(page.$("#f").nagiProxy.agree).toBe(false);
    });

    it("reads a multiple select as the list of the selected values", async () => {
        const page = await mount(`
            <form id="f" n-scope n-form><select name="s" multiple><option selected>a</option><option selected>b</option><option>c</option></select></form>
        `);
        expect([...page.$("#f").nagiProxy.s]).toEqual(["a", "b"]);
    });

    it("logs a field named like a getter of the scope", async () => {
        const page = await mount(`<form id="f" n-scope="{ get total() { return 5 } }" n-form><input name="total" value="3"></form>`);
        expect(page.$("#f").nagiProxy.total).toBe(5);
        expect(page.errors).toHaveLength(1);
    });

    it("leaves alone a named custom element that is not a field, such as an icon", async () => {
        const page = await mount(`<form id="f" n-scope="{ search: 'foo' }" n-form><sl-icon name="search"></sl-icon></form>`);
        expect(page.$("#f").nagiProxy.search).toBe("foo");
    });

    it("resets a radio group to its default whatever order the radios come in", async () => {
        const page = await mount(`
            <form id="f" n-scope n-form><input type="radio" name="s" value="a"><input type="radio" name="s" value="b" checked></form>
        `);
        const [a, b] = page.window.document.querySelectorAll("[name=s]");
        a.checked = true;
        a.dispatchEvent(new page.window.Event("change"));
        expect(page.$("#f").nagiProxy.s).toBe("a");
        page.$("#f").reset();
        await later(10);
        expect([a.checked, b.checked, page.$("#f").nagiProxy.s]).toEqual([false, true, "b"]);
    });

    it("reads an empty number field as undefined, so it can be cleared", async () => {
        const page = await mount(`<form id="f" n-scope n-form><input type="number" name="n" value="5" n-bind-value="n ?? ''"></form>`);
        const input = page.$("[name=n]");
        input.value = "";
        input.dispatchEvent(new page.window.Event("input"));
        expect(input.value).toBe("");
        expect(page.$("#f").nagiProxy.n).toBeUndefined();
    });

    it("leaves ignored radios out of a radio group", async () => {
        const page = await mount(`
            <form id="f" n-scope n-form><input id="a" type="radio" name="s" value="a"><div n-ignore><input type="radio" name="s" value="z" checked></div></form>
        `);
        expect(page.$("#f").nagiProxy.s).toBeUndefined();
        page.$("#a").checked = true;
        page.$("#a").dispatchEvent(new page.window.Event("change"));
        expect(page.$("#f").nagiProxy.s).toBe("a");
    });

    it("logs radios of one name in different forms of a scope, and keeps the first form's", async () => {
        const page = await mount(`
            <div id="d" n-scope n-form>
                <form><input type="radio" name="s" value="a" checked></form>
                <form><input type="radio" name="s" value="b" checked></form>
            </div>
        `);
        expect(page.$("#d").nagiProxy.s).toBe("a");
        expect(page.errors).toHaveLength(1);
    });

    it("has read the fields by the time binds and init handlers first run", async () => {
        const page = await mount(`
            <form n-scope="{ seen: null }" n-form>
                <input name="q" value="x"><span id="s" n-on-init="seen = q" n-bind-textcontent="q.toUpperCase()"></span>
            </form>
        `);
        expect(page.$("#s").textContent).toBe("X");
        expect(page.scope("#s").seen).toBe("x");
        expect(page.errors).toEqual([]);
    });

    it("takes a field named like an Object.prototype member from the field", async () => {
        const page = await mount(`<form id="f" n-scope="{ a: 1 }" n-form><input name="constructor" value="x"></form>`);
        expect(page.$("[name=constructor]").value).toBe("x");
        expect(page.$("#f").nagiProxy.constructor).toBe("x");
    });

    it("clears a radio group's name when a reset leaves none of it checked", async () => {
        const page = await mount(`<form id="f" n-scope n-form><input id="a" type="radio" name="s" value="a"><input type="radio" name="s" value="b"></form>`);
        const a = page.$("#a");
        a.checked = true;
        a.dispatchEvent(new page.window.Event("change"));
        expect(page.$("#f").nagiProxy.s).toBe("a");
        page.$("#f").reset();
        await later(10);
        expect(page.$("#f").nagiProxy.s).toBeUndefined();
    });

    it("keeps what an init handler sets for a field's name", async () => {
        const page = await mount(`<form id="f" n-scope n-form n-on-init="q = 'preset'"><input name="q"></form>`);
        expect(page.$("#f").nagiProxy.q).toBe("preset");
    });

    it("leaves alone buttons with no form to submit", async () => {
        const page = await mount(`<div id="d" n-scope n-form><button id="b"></button></div>`);
        page.$("#d").nagiProxy.$fetching = true;
        expect(page.$("#b").disabled).toBe(false);
    });

    it("leaves ignored radios out when a reset reads a radio group", async () => {
        const page = await mount(`
            <form id="f" n-scope n-form><input id="a" type="radio" name="s" value="a"><div n-ignore><input type="radio" name="s" value="z" checked></div></form>
        `);
        const a = page.$("#a");
        a.checked = true;
        a.dispatchEvent(new page.window.Event("change"));
        page.$("#f").reset();
        await later(10);
        expect(page.$("#f").nagiProxy.s).toBeUndefined();
    });

    it("keeps the type of a value an init handler set when a bind writes it into its field", async () => {
        const page = await mount(`<form id="f" n-scope n-form n-on-init="n = 5"><input name="n" n-bind-value="n"></form>`);
        expect(page.$("#f").nagiProxy.n).toBe(5);
    });

    it("re-enables only the buttons it disabled when a request ends", async () => {
        const page = await mount(`<form id="f" n-scope n-form><button id="a" disabled></button></form>`);
        const scope = page.$("#f").nagiProxy;
        scope.$fetching = true;
        page.$("#a").disabled = false;
        scope.$fetching = false;
        expect(page.$("#a").disabled).toBe(false);
    });

    it("forgets a field another script removed, so its name can be taken again", async () => {
        const page = await mount(`<form id="f" n-scope n-form><input id="a" type="radio" name="s" value="a" checked><input id="b" type="radio" name="s" value="b"></form>`);
        page.$("#a").remove();
        page.$("#b").checked = true;
        page.$("#b").dispatchEvent(new page.window.Event("change"));
        expect(page.$("#f").nagiProxy.s).toBe("b");
    });

    it("follows the reset of the form a field names with form=, even after that form is swapped", async () => {
        const page = await mount(
            `<div n-scope n-form id="d">
                <form id="f"></form><input name="q" form="f" value="x">
                <button id="b" type="button" n-on-click="$get('/x')"></button>
            </div>`,
            { server: () => `<form id="f"></form>` },
        );
        page.$("#b").click();
        await page.settle();
        const input = page.$("[name=q]");
        input.value = "typed";
        input.dispatchEvent(new page.window.Event("input"));
        page.$("#f").reset();
        await later(10);
        expect(page.$("#d").nagiProxy.q).toBe("x");
    });

    it("stops reading a field that left the page once another field has taken its name", async () => {
        const page = await mount(
            `<form id="f" n-scope n-form><input id="a" name="q" value="1"><div id="w"></div><button id="b" type="button" n-on-click="$get('/x')"></button></form>`,
            { server: () => `<div id="w"><input name="q" value="2"></div>` },
        );
        const a = page.$("#a");
        a.remove();
        page.$("#b").click();
        await page.settle();
        page.$("#f").append(a);
        a.value = "3";
        a.dispatchEvent(new page.window.Event("input"));
        expect(page.$("#f").nagiProxy.q).toBe("2");
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
