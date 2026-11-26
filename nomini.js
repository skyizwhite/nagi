// Nomini v0.3.1
// Inspired by aidenybai/dababy
// Copyright (c) 2025 nonnorm
// Licensed under the MIT License.

(() => {
    // Utility functions
    const dispatch = (el, name, opts) => {
        opts = { bubbles: true, detail: {}, ...opts };
        el.dispatchEvent(new CustomEvent(name, opts));
    };

    const evalExpression = (expression, data, thisArg) => {
        if (/^{.*}$/s.test(expression)) {
            expression = expression.slice(1, -1);
        }

        try {
            return new Function(
                "__data",
                `with(__data) {return {${expression}}}`,
            ).call(thisArg, data);
        } catch (err) {
            console.error("[Nomini] failed to parse obj:", expression, "\n", err);
            return {};
        }
    };

    const queryAttr = (el, selector) => {
        const elMatch = el.matches(selector) ? [el] : [];
        return [...elMatch, ...el.querySelectorAll(selector)].filter(
            (val) => !val.closest("[nm-ignore]"),
        );
    };

    const getClosestProxy = (el) =>
        el.closest("[nm-data]")?.nmProxy || helpers();

    const runWithEl = (el, fn, bind = null, handler = null) => {
        const prev = [currentEl, currentBind, currentHandler];
        currentEl = el;
        currentBind = bind;
        currentHandler = handler;
        try {
            return fn();
        } finally {
            [currentEl, currentBind, currentHandler] = prev;
        }
    };

    const unlink = (run) => {
        run.deps.forEach((deps) => deps.delete(run));
        run.deps.clear();
        run.children.forEach(kill);
        run.children = [];
    };

    const kill = (run) => {
        run.gone = true;
        run.owner?.nmRuns.delete(run);
        unlink(run);
    };

    const watch = (fn, el = currentEl, owner = el) => {
        const run = () => {
            if (run.gone || run === currentBind) return;
            if (run.active) return (run.dirty = true);
            run.active = true;
            try {
                for (let i = 0; i < 100 && !run.gone && (i === 0 || run.dirty); i++) {
                    run.dirty = false;
                    unlink(run);
                    try {
                        runWithEl(el, fn, run);
                    } catch (err) {
                        console.error("[Nomini] failed to run:", fn, "\n", err);
                    }
                }
                if (run.gone) unlink(run);
                else if (run.dirty) console.error("[Nomini] stopped running after 100 times:", fn);
            } finally {
                run.active = false;
            }
        };
        run.owner = owner;
        run.deps = new Set();
        run.children = [];
        owner && (owner.nmRuns ||= new Set()).add(run);
        currentBind?.children.push(run);
        run();
    };

    // Important reactivity stuff
    let currentBind = null;
    let currentEl = null;
    let currentHandler = null;

    // Helpers that are included with every data object
    const helpers = (pending = 0, writing = new Set()) => ({
        // --- BEGIN ref
        $refs: {},
        // --- END ref
        // --- BEGIN fetch
        _nmFetching: false,
        _nmAbort: new AbortController(),
        $get(url, data) {
            this.$fetch(url, "GET", data);
        },
        $post(url, data) {
            this.$fetch(url, "POST", data);
        },
        $fetch(url, method, data) {
            const el = currentEl ?? this._nmEl;
            const controller = new AbortController();
            const { signal } = controller;
            method = (method || "GET").toUpperCase();
            const reading = /^(GET|HEAD|OPTIONS)$/.test(method);
            const report = (name, detail) => dispatch(el?.isConnected ? el : document, name, { detail });
            let write;

            const opts = runWithEl(el, () => {
                data = { ...this.$nmData(), ...this.$dataset(), ...data };

                const encodedData = new URLSearchParams(data);
                const opts = { headers: { "nm-request": true }, method, signal };
                const query = String(encodedData);

                if (!/^(GET|HEAD|DELETE)$/.test(method)) opts.body = encodedData;
                else if (query) {
                    const hashAt = url.includes("#") ? url.indexOf("#") : url.length;
                    const path = url.slice(0, hashAt);
                    const joiner = !path.includes("?") ? "?" : /[?&]$/.test(path) ? "" : "&";
                    url = path + joiner + query + url.slice(hashAt);
                }

                write = !reading && `${method} ${url} ${opts.body ?? ""}`;
                if (writing.has(write)) return;

                this._nmAbort.abort();
                return opts;
            });

            if (!opts) return report("fetchskip", { method, url });

            this._nmAbort = reading ? controller : new AbortController();
            if (write) writing.add(write);
            pending++;
            this._nmFetching = true;

            fetch(url, opts)
                .then(async (res) => {
                    if (!res.ok) {
                        throw new Error(`${res.statusText}: ${await res.text()}`);
                    }

                    if (!res.body) return;

                    const stream = res.body.pipeThrough(new TextDecoderStream()).getReader();
                    let buf = "";

                    while (true) {
                        const { done, value } = await stream.read();
                        if (done) break;
                        buf += value;
                    }

                    if (!signal.aborted) swap(buf);
                })
                .catch((err) => signal.aborted || report("fetcherr", { err, url }))
                .finally(() => {
                    writing.delete(write);
                    if (!--pending) this._nmFetching = false;
                });
        },
        $nmData() {
            const isPrimitive = (x) => x !== Object(x);

            return Object.entries(this).reduce((acc, [k, v]) => {
                if (!/^[a-z]+$/i.test(k)) return acc;
                if (typeof v === "function") v = v();
                if (isPrimitive(v) || (Array.isArray(v) && v.every(isPrimitive)))
                    acc[k] = v;
                return acc;
            }, {});
        },
        // --- END fetch
        $dataset() {
            let datasets = {};
            let el = currentEl ?? this._nmEl;

            while (el?.nodeType === 1) {
                datasets = { ...el.dataset, ...datasets };
                if (el.hasAttribute("nm-data")) break;
                el = el.parentElement;
            }

            return datasets;
        },
        $watch: (fn) => watch(fn),
        $dispatch(evt, detail, opts) {
            dispatch(currentEl ?? this._nmEl ?? document, evt, { detail, ...opts });
        },
        $debounce(fn, ms, abortable = false) {
            const el = currentEl ?? this._nmEl;
            const signal = abortable && runWithEl(el, () => this._nmAbort?.signal);
            const timers = ((el ?? document).nmTimers ||= new Map());
            const key = currentHandler ?? currentBind;
            clearTimeout(timers.get(key));
            timers.set(key, setTimeout(() => {
                timers.delete(key);
                if (!signal?.aborted) runWithEl(el, fn);
            }, ms));
        },
        // --- BEGIN helpers
        $persist(prop, key) {
            key = key || `_nmProp-${prop}`;

            const stored = localStorage[key];
            if (stored) this[prop] = JSON.parse(stored);

            watch(() => {
                localStorage[key] = JSON.stringify(this[prop]);
            });
        },
        // --- END helpers
    });

    // --- BEGIN fetch
    const drop = (el) => {
        queryAttr(el, "*").forEach((node) => node.nmBound && dispatch(node, "destroy", { bubbles: false }));
        // --- BEGIN ref
        queryAttr(el, "[nm-ref]").forEach((node) => {
            const refs = getClosestProxy(node).$refs;
            const name = node.getAttribute("nm-ref");
            if (refs[name] === node) delete refs[name];
        });
        // --- END ref
        [el, ...el.querySelectorAll("*")].forEach((node) => {
            node.nmProxy?._nmAbort.abort();
            node.nmRuns?.forEach(kill);
            node.nmCleanup?.forEach((clean) => clean());
            node.nmTimers?.forEach(clearTimeout);
        });
    };

    const initAll = (nodes) => nodes.forEach((node) => node.nodeType === 1 && init(node));

    const swap = (text) => {
        const template = document.createElement("template");
        template.innerHTML = text;

        for (const fragment of [...template.content.children]) {
            if (!fragment.id) {
                console.warn("[Nomini] Fragment is missing an id: ", fragment);
                continue;
            }

            const strategy = fragment.getAttribute("nm-swap") || "outer";
            const target = document.getElementById(fragment.id);

            if (!target) {
                console.warn("[Nomini] Swap target not found: #", fragment.id);
                continue;
            }

            if (!/^(inner|outer|before|after|prepend|append)$/.test(strategy)) {
                console.error("[Nomini] Invalid swap strategy: ", strategy);
                continue;
            }

            // --- BEGIN morph
            cssMorph(fragment);
            // --- END morph

            const kids = [...fragment.childNodes];

            if (strategy === "inner") {
                [...target.children].forEach(drop);
                target.replaceChildren(...kids);
                // --- BEGIN template
                if (target.hasAttribute("nm-use")) use(target);
                // --- END template
                initAll([...target.childNodes]);
            } else if (strategy === "outer") {
                drop(target);
                target.replaceWith(fragment);
                init(fragment);
            } else {
                target[strategy](...kids);
                initAll(kids);
            }
        }
    };
    // --- END fetch

    // --- BEGIN morph
    const cssMorph = (fragment) => {
        const attributesToSettle = ["style", "class", "height", "width"];

        const idSet = queryAttr(fragment, "[id]");

        idSet.forEach((newEl) => {
            const oldEl = document.getElementById(newEl.id);

            if (oldEl && oldEl.tagName === newEl.tagName) {
                const newElCopy = newEl.cloneNode();

                const morph = (src) =>
                    attributesToSettle.forEach((attr) => {
                        const attrVal = src.getAttribute(attr);
                        if (attrVal) newEl.setAttribute(attr, attrVal);
                        else newEl.removeAttribute(attr);
                    });

                morph(oldEl);
                requestAnimationFrame(() => morph(newElCopy));
            }
        });
    };
    // --- END morph

    // --- BEGIN template
    const use = (useEl) => {
        const id = useEl.getAttribute("nm-use");
        const template = document.getElementById(id);
        if (template) {
            const templateFrag = template.content.cloneNode(true);
            const slot = templateFrag.querySelector("slot:not([name])");
            if (slot) slot.replaceWith(...useEl.childNodes);
            useEl.replaceChildren(templateFrag);
        } else console.error("[Nomini] No template with id: #", id);
    };
    // --- END template

    const init = (baseEl) => {
        // --- BEGIN template
        queryAttr(baseEl, "[nm-use]").forEach(use);
        // --- END template

        // --- BEGIN data
        queryAttr(baseEl, "[nm-data]").forEach((dataEl) => {
            const rawData = {
                ...evalExpression(dataEl.getAttribute("nm-data"), {}, dataEl),
                ...helpers(),
                _nmEl: dataEl,
            };

            const trackedDeps = new Map();

            const proxyData = new Proxy(rawData, {
                get(obj, prop) {
                    if (currentBind) {
                        let deps = trackedDeps.get(prop);
                        if (!deps) trackedDeps.set(prop, (deps = new Set()));
                        deps.add(currentBind);
                        currentBind.deps.add(deps);
                    }

                    return obj[prop];
                },
                set(obj, prop, val) {
                    if (prop in obj && val !== Object(val) && Object.is(obj[prop], val)) return true;
                    obj[prop] = val;

                    const deps = trackedDeps.get(prop);

                    deps && [...deps].forEach((run) => run());

                    return true;
                },
            });

            dataEl.nmProxy = proxyData;
        });
        // --- END data

        // --- BEGIN ref
        queryAttr(baseEl, "[nm-ref]").forEach((el) => {
            const proxyData = getClosestProxy(el);
            const refName = el.getAttribute("nm-ref");

            proxyData.$refs[refName] = el;
        });
        // --- END ref

        // --- BEGIN form
        const formProxy = (el) => {
            const form = el.closest("[nm-form]");
            return form && getClosestProxy(form);
        };

        queryAttr(baseEl, "[name]").forEach((inputEl) => {
            const proxyData = formProxy(inputEl);
            if (!proxyData) return;

            const inputType = inputEl.type;

            const setVal = () => {
                let res;

                if (inputType === "checkbox")
                    res = inputEl.checked;
                else if (inputType === "radio") {
                    if (!inputEl.checked) {
                        if (!(inputEl.name in proxyData)) proxyData[inputEl.name] = undefined;
                        return;
                    }
                    res = inputEl.value;
                }
                else if (inputType === "file")
                    res = inputEl.files;
                else if (/number|range/.test(inputType))
                    res = +inputEl.value;
                else res = inputEl.value;

                proxyData[inputEl.name] = res;
            };

            setVal();

            inputEl.addEventListener("input", setVal);
            inputEl.addEventListener("change", setVal);
        });

        queryAttr(baseEl, "button, input[type='submit']").forEach((submitEl) => {
            const proxyData = formProxy(submitEl);
            if (proxyData) watch(() => submitEl.disabled = proxyData._nmFetching, submitEl);
        });
        // --- END form

        // --- BEGIN bind
        queryAttr(baseEl, "*").forEach((bindEl) => {
            const entries = [...bindEl.attributes].flatMap(({ name, value }) => {
                const [, kind, rest] = name.match(/^nm-(bind|on)-(.+)$/) || [];
                if (kind === "on") return `${JSON.stringify("@" + rest)}: async (e) => {${value}\n}`;
                if (!kind) return [];
                const [main, ...subs] = rest.split(".");
                const key = [main.replace(/-(\w)/g, (_, c) => c.toUpperCase()), ...subs].join(".");
                return `${JSON.stringify(key)}: () => (${value || "undefined"}\n)`;
            });

            if (!entries.length) return;
            bindEl.nmBound = true;

            const proxyData = getClosestProxy(bindEl);
            const props = evalExpression(entries.join(","), proxyData, bindEl);

            Object.entries(props).forEach(([key, val]) => {
                if (key.startsWith("@")) {
                    // --- BEGIN events
                    const [eventName, ...mods] = key.slice(1).split(".");

                    const debounceMod = mods.find((val) => val.startsWith("debounce"));
                    const delay = +debounceMod?.slice(8);

                    const listener = (e) => runWithEl(bindEl, () => {

                        if (mods.includes("prevent")) e.preventDefault();
                        if (mods.includes("stop")) e.stopPropagation();

                        if (delay) proxyData.$debounce(() => val(e), delay);
                        else val(e);
                    }, null, val);

                    const listenOn = mods.includes("window") ? window : bindEl;
                    listenOn.addEventListener(eventName, listener, { once: mods.includes("once") });
                    if (listenOn === window)
                        (bindEl.nmCleanup ||= []).push(() => window.removeEventListener(eventName, listener));

                    return;
                    // --- END events

                    // If special event handling isn't enabled just do a normal event listener
                    bindEl.addEventListener(key.slice(1), (e) => runWithEl(bindEl, () => val(e), null, val));
                } else {
                    const [main, sub] = key.split(".");
                    const write = (resolvedVal) => {
                        if (sub) {
                            if (main === "class") bindEl.classList.toggle(sub, resolvedVal);
                            else bindEl[main][sub] = resolvedVal;
                        } else bindEl[main] = resolvedVal;
                    };

                    watch(() => {
                        const value = val();
                        if (typeof value?.then === "function")
                            value.then(write).catch((err) => console.error("[Nomini] failed to run:", val, "\n", err));
                        else write(value);
                    }, bindEl);
                }
            });

            dispatch(bindEl, "init", { bubbles: false });
        });
        // --- END bind
    };

    document.addEventListener("DOMContentLoaded", () => init(document.body));
})();
