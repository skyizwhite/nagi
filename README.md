<p align="center">
  <img src="./assets/logo.svg" alt="" width="120">
</p>

# Nagi (凪)

Nagi is a small library for reactive HTML and partial page updates. It is a fork of [Nomini](https://github.com/nonnorm/nomini) by nonnorm, reworked so that every binding is an attribute of its own and easy to write from a template engine.

Nagi lets you:
- Add lightweight reactive state directly in your HTML
- Bind DOM properties and classes with automatic dependency tracking
- Listen to any event with inline handlers
- Make requests and swap their responses into any part of the page
- Keep everything declarative and local

## Why Nagi?
- Values are plain JavaScript, and the only syntax to learn is a handful of attribute names
- One attribute per binding, so templates can add, leave out or pass along each one
- Event handlers with modifiers and access to reactive variables
- Requests send exactly what you give them

## What Nagi is *not*
Nagi is deliberately minimal. It **does not** try to be:
- A template language
- A performant virtual DOM
- A full-featured set of helpers for every use case
- A global state management system

Nagi stays small by keeping the mental model simple: **Boring HTML + islands of reactivity + server-driven pages**

## Usage

Copy `dist/nagi.min.js` into your project and load it with a normal or `defer` script tag, not `async`. Nagi sets up the page once on `DOMContentLoaded`, and after that only what a response swaps in.

```html
<script defer src="/js/nagi.min.js"></script>
```

```html
<div n-scope="{ count: 0 }">
  <button n-on-click="count++">+1</button>
  <span n-bind-textcontent="count"></span>
</div>
```

`n-scope`, `n-let-*`, `n-bind-*` and `n-on-*` hold plain JavaScript, and the names of the scope can be used in them as variables. `this` is the element.

### Attributes

#### `n-scope`
Makes a reactive scope from an object. Elements inside it read and write its names, and bindings that read a name update when it changes.

```html
<div n-scope="{ first: 'Ada', last: 'Lovelace', full() { return `${this.first} ${this.last}` } }">
  <p n-bind-textcontent="full()"></p>
</div>
```

- The value can be any expression that gives a plain object or a class instance, such as `n-scope="makeCart(this)"`. Methods and getters keep working, with `this` as the scope. The scope is a copy, so later changes to the original object are not seen.
- `n-scope` cannot read the names of outer scopes. Use `n-let-*` for values made from them.
- `n-scope` with no value makes an empty scope.
- Scopes nest. A name is read from the nearest scope that has it, and written back to that scope.

#### `n-let-<name>`
Adds one name to the scope, from an expression that can read outer scopes. An element with `n-let-*` is a scope even without `n-scope`. An `n-let-*` wins over `n-scope` of the same name.

```html
<div n-let-open="false" n-let-toggle="() => open = !open">
  <button n-on-click="toggle()">Menu</button>
  <nav n-bind-hidden="!open">…</nav>
</div>
```

Names starting with `$` or `_nagi` belong to Nagi and cannot be used.

#### `n-bind-<property>`
Sets a property of the element to the value of an expression, and sets it again when what the expression read changes. The property is found by its name in lowercase, so `n-bind-textcontent` sets `textContent`. An expression that gives a promise sets the property when it resolves.

```html
<input n-bind-value="query" n-bind-disabled="$fetching">
```

A dot reaches one level further:

| Attribute | Effect |
|---|---|
| `n-bind-class="…"` | Adds the classes of a string, an array, or the keys of an object whose values are truthy, and removes the ones it added before. Classes written in the HTML stay |
| `n-bind-class.<name>="…"` | Toggles one class |
| `n-bind-style.<css-name>="…"` | Sets one style, `--custom` properties included. `null` or `false` removes it |
| `n-bind-dataset.<name>="…"` | Sets `data-<name>`. `null` or `false` removes it |
| `n-bind-<property>.<sub>="…"` | Sets a property of an object the element's property holds |

```html
<li n-bind-class="{ done: item.done, active: item.id === current }"
    n-bind-style.--progress="item.progress + '%'"></li>
```

#### `n-on-<event>`
Runs statements when the event fires. The event is `e`, and the handler can `await`. Custom events and events from other libraries work too, as long as their names are lowercase.

```html
<button n-on-click="count++; $dispatch('changed', { count })">+1</button>
```

Modifiers follow the event name:

| Modifier | Effect |
|---|---|
| `.prevent` | Calls `e.preventDefault()` |
| `.stop` | Calls `e.stopPropagation()` |
| `.once` | Runs only the first time |
| `.window` | Listens on `window` |
| `.debounce<ms>` | Waits until no event has fired for `<ms>`, then runs once with the last one |

```html
<form n-on-submit.prevent="$post('/save', e)">…</form>
<input n-on-input.debounce300="$get('/search', { q: this.value })">
```

#### `n-ref`
Puts the element in its scope's `$refs` under the given name. It needs a scope, and logs an error outside any.

```html
<div n-scope>
  <button n-on-click="$refs.dialog.showModal()">Open</button>
  <dialog n-ref="dialog">…</dialog>
</div>
```

#### `n-form`
Copies each named field inside it into its scope, and updates it on `input` and `change`. It needs a scope, and logs an error outside any. The copy goes one way, from the field to the scope; use `n-bind-value` to write back.

- A checkbox gives a boolean, a number or range field a number (`0` when empty), a file field its `FileList`, a radio group the value of the checked one, and any other field its `value`.
- Submit buttons inside it are disabled while the scope has a request in flight. A button already disabled when the request starts is left alone, and its `n-bind-disabled` runs again when the request ends.

```html
<form n-scope n-form n-on-submit.prevent="$post('/signup', e)">
  <input name="email" type="email">
  <button>Sign up</button>
  <p n-bind-hidden="!email">We will write to <span n-bind-textcontent="email"></span>.</p>
</form>
```

#### `n-ignore`
Nagi leaves the element and everything inside it alone.

### `data-*` attributes

`data-*` attributes are not names in a scope. Read them where you need them:

- `this.dataset.<name>` reads the element's own. In `n-let-*`, `this` is the scope's element, so `n-let-id="this.dataset.id"` turns one into a name.
- `$dataset()` merges the `data-*` of the element and all its ancestors, up to `<html>`, the nearer ones winning. Keys are camelCase, as in `dataset`.

```html
<body data-csrf="…">
  <ul n-scope data-list="7">
    <li data-item="42">
      <button n-on-click="const { list, item, csrf } = $dataset(); $post('/move', { list, item, csrf })">Move</button>
    </li>
  </ul>
</body>
```

Pass a request only the values it needs. `$dataset()` as a whole also holds what the page's outer elements carry.

### Helpers

Every scope has these names. An element outside any scope has a set of its own: its requests, `$fetching` and debounces belong to it alone.

| Helper | Description |
|---|---|
| `$get(url, data, options)` | Sends a GET request. `$post`, `$put`, `$patch` and `$delete` send the other methods |
| `$fetch(url, method, data, options)` | Sends a request with any method |
| `$abort()` | Aborts every request of the scope |
| `$fetching` | `true` while the scope has a request in flight |
| `$refs` | The elements named by `n-ref` |
| `$dataset()` | The `data-*` of the element and all its ancestors, merged with the nearer ones winning |
| `$dispatch(name, detail, options)` | Dispatches a bubbling event from the element |
| `$watch(fn)` | Runs `fn`, and runs it again when what it read changes |
| `$debounce(fn, ms, abortable)` | Waits until it has not been called for `ms`, then runs `fn`. With `abortable`, a new request of the scope drops it |
| `$persist(name, key)` | Restores a name of the scope from `localStorage`, and saves it there as it changes. Call it from `n-on-init` |

### Requests

A request sends only the data it is given. The data can be:

- An object. Arrays repeat the key, `null` and `undefined` are left out, and files make it `FormData`
- A form, an element inside a form, or an event whose target is in a form. The form's fields are sent, with the button that was clicked or that submitted it
- `FormData`, `URLSearchParams`, or a query string

GET, HEAD and DELETE put the data in the query string, leaving out files. Other methods send it as the body. Every request has the `n-request: true` header.

```html
<button n-on-click="$delete(`/items/${id}`)">Delete</button>
<button n-on-click="$get('/items', { page: this.dataset.page })" data-page="2">More</button>
```

`options` can hold:

- `timeout`: aborts the request after this many milliseconds, and sends `fetcherr` with a `TimeoutError`
- `dedupe: false`: sends a write even while the same one is in flight

A scope has one read (GET, HEAD, OPTIONS) in flight at a time: a new request of the scope aborts it, so the newest response wins. To run reads side by side, put them in separate scopes; an element outside any scope counts as one. Writes are never aborted, since the server may already have done them. A write that is the same as one still in flight is skipped, and `fetchskip` is dispatched. A swap that removes the element that made a read aborts the read.

The request helpers return nothing. React to the result through what the response swaps in, or through the events below.

### Responses

The response is HTML. Each top-level element with an `id` is swapped into the element of the same `id` on the page. `n-swap` on the response's element picks how:

| `n-swap` | Effect |
|---|---|
| `outer` (default) | Replaces the target |
| `inner` | Replaces the target's children |
| `before` / `after` | Puts the children before or after the target |
| `prepend` / `append` | Puts the children at the start or end of the target |

Except with `outer`, the element in the response is only a wrapper, and its children are what goes in.

```html
<div id="cart-count">3</div>
<ul id="items" n-swap="append">
  <li>New item</li>
</ul>
```

What is swapped in is set up as if it had been on the page. A scope replaced by an `outer` swap starts over from its attributes. For an element whose `id` and tag stay the same, `style`, `class`, `width` and `height` start from their old values and move to the new ones in the next frame, so CSS transitions run. An error response is swapped only when one of its elements matches an `id` on the page.

These response headers change what happens:

| Header | Effect |
|---|---|
| `n-redirect: <url>` | Goes to the URL instead of swapping. Use it on a 2xx response, since `fetch` follows 3xx redirects itself |
| `n-replace-url: <url>` | Replaces the URL in the address bar, swapped or not |

### Events

| Event | Sent to | When |
|---|---|---|
| `init` | An element with `n-bind-*` or `n-on-*` | After its bindings and handlers are set up, so `n-on-init` on the same element runs. Does not bubble |
| `destroy` | An element with `n-bind-*` or `n-on-*` | Before a swap removes it. Does not bubble |
| `fetcherr` | The element that made the request | When the request fails, times out, or the response is not 2xx. `detail` has `err`, `url`, `status`, `text` and `swapped` |
| `fetchskip` | The element that made the request | When a write is skipped as a duplicate. `detail` has `method` and `url` |
| `fetchredirect` | The element that made the request | Before `n-redirect` is followed. Cancel it to stay. `detail` has `url` |

`fetcherr`, `fetchskip` and `fetchredirect` bubble. When the element is no longer on the page they go to `document` instead, so listen on `window` to catch them all.

```html
<body n-on-fetcherr.window="alert(`Failed: ${e.detail.status ?? e.detail.err}`)">
```

### Things to know

- HTML lowercases attribute names, so what follows `n-let-`, `n-on-`, `class.` and `style.` is lowercase. `n-let-isOpen` defines `isopen`, and a name after `n-let-` must be a valid identifier to be used as a variable.
- Only assigning a name is tracked. Write `items = [...items, x]`, not `items.push(x)`.
- Declare every name you assign in a scope. Assigning a name no scope has makes a global variable, and nothing updates.
- In a handler, "the element" for `$dispatch`, `$dataset` and the request events is the handler's element until the first `await`, and the scope's element after it.
- Elements added by other scripts are not set up. Only the page at `DOMContentLoaded` and what a response swaps in are.
- Outside any scope, a name in `n-bind-*` is read from `window`, and the binding does not update when it changes.

## Development

Tools are managed with [mise](https://mise.jdx.dev).

```sh
mise install
npm install
npm test        # or `mise run test`
```

`sh scripts/build.sh` writes `dist/nagi.min.js`.

## License

MIT. Nagi keeps the copyright of Nomini, its origin; see [LICENSE](./LICENSE).
