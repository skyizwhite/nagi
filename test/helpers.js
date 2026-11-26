import { readFileSync } from "node:fs";
import { Window } from "happy-dom";

const source = readFileSync(new URL("../nomini.js", import.meta.url), "utf8");

const windows = new Set();

export const closeWindows = async () => {
    const closing = [...windows].map((window) => window.happyDOM.close());
    windows.clear();
    await Promise.allSettled(closing);
};

const respond = (answer) => {
    if (answer instanceof Response) return answer;
    if (typeof answer === "string") answer = { body: answer };
    const { body = null, status = 200, headers = {} } = answer ?? {};
    return new Response(body, { status, headers });
};

const abortError = () => new DOMException("The operation was aborted.", "AbortError");

const trackBody = (response, signal, done) => {
    if (!response.body) {
        done();
        return response;
    }
    const reader = response.body.getReader();
    let abort;
    const body = new ReadableStream({
        start(controller) {
            abort = () => {
                controller.error(abortError());
                reader.cancel().catch(() => {});
                done();
            };
            signal?.addEventListener("abort", abort, { once: true });
        },
        async pull(controller) {
            let ended, value;
            try {
                ({ done: ended, value } = await reader.read());
            } catch (err) {
                signal?.removeEventListener("abort", abort);
                done();
                throw err;
            }
            if (signal?.aborted) return;
            if (ended) {
                signal?.removeEventListener("abort", abort);
                controller.close();
                done();
            } else controller.enqueue(value);
        },
        cancel(reason) {
            signal?.removeEventListener("abort", abort);
            done();
            return reader.cancel(reason);
        },
    }, { highWaterMark: 0 });
    return new Response(body, response);
};

export const mount = async (html, { server, beforeInit } = {}) => {
    const window = new Window({ url: "http://localhost/" });
    windows.add(window);

    const requests = [];
    const pending = new Set();
    const unserved = [];

    window.TextDecoderStream = TextDecoderStream;
    window.fetch = (url, opts = {}) => {
        const request = {
            url: new URL(url, window.location.href).href,
            method: opts.method ?? "GET",
            headers: Object.fromEntries(new Headers(opts.headers)),
            body: opts.body === undefined ? undefined : String(opts.body),
        };
        requests.push(request);

        let done;
        const work = new Promise((resolve) => (done = resolve));
        work.request = request;
        pending.add(work);
        work.then(() => pending.delete(work));

        const { signal } = opts;
        return new Promise((resolve, reject) => {
            const abort = () => {
                done();
                reject(abortError());
            };
            if (signal?.aborted) return abort();
            signal?.addEventListener("abort", abort, { once: true });

            new Promise((answered) => {
                if (!server) {
                    unserved.push(request);
                    throw new Error(`No server for ${request.method} ${request.url}`);
                }
                answered(server(request));
            })
                .then((answer) => {
                    if (signal?.aborted) return;
                    signal?.removeEventListener("abort", abort);
                    resolve(trackBody(respond(answer), signal, done));
                })
                .catch((err) => {
                    done();
                    reject(err);
                });
        });
    };

    const errors = [];
    const warnings = [];
    window.console.error = (...args) => errors.push(args);
    window.console.warn = (...args) => warnings.push(args);

    const { document } = window;
    document.body.innerHTML = html;
    beforeInit?.(window);
    window.eval(source);
    document.dispatchEvent(new window.Event("DOMContentLoaded"));

    const $ = (selector) => document.querySelector(selector);

    return {
        window,
        document,
        $,
        requests,
        errors,
        warnings,
        scope: (selector) => $(selector).closest("[nm-data]").nmProxy,
        settle: async (timeout = 1000) => {
            await settle(window, pending, timeout);
            if (unserved.length) {
                const asked = unserved.map((r) => `${r.method} ${r.url}`);
                throw new Error(`fetched with no server: ${asked.join(", ")}`);
            }
        },
    };
};

const settle = async (window, pending, timeout) => {
    let timer;
    const late = new Promise((_, reject) => {
        timer = setTimeout(() => {
            const left = [...pending].map(({ request: r }) => `${r.method} ${r.url}`);
            reject(new Error(`settle() timed out waiting for: ${left.join(", ")}`));
        }, timeout);
    });
    try {
        await Promise.race([drain(window, pending), late]);
    } finally {
        clearTimeout(timer);
    }
};

const drain = async (window, pending) => {
    do {
        await Promise.all(pending);
        await new Promise((resolve) => setTimeout(resolve));
        await window.happyDOM.waitUntilComplete();
    } while (pending.size > 0);
};
