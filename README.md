<p align="center">
  <img src="./assets/logo.svg" alt="" width="120">
</p>

# Nagi (凪)

Nagi is a small library for reactive HTML and partial page updates. It is a fork of [Nomini](https://github.com/nonnorm/nomini) by nonnorm, reworked so that every binding is an attribute of its own and easy to write from a template engine.

Nagi lets you:
- Add lightweight reactive state directly in your HTML
- Bind DOM properties and classes with automatic dependency tracking
- Listen to any event with inline handlers
- Make requests and swap their answers into any part of the page
- Keep everything declarative and local

## Why Nagi?
- Write plain JavaScript, no special DSLs to learn
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

Copy `dist/nagi.min.js` into your project and load it with `defer`, or at the end of `<body>`. Nagi sets up the page on `DOMContentLoaded`.

```html
<script defer src="/js/nagi.min.js"></script>
```

```html
<div n-scope="{ count: 0 }">
  <button n-on-click="count++">+1</button>
  <span n-bind-textcontent="count"></span>
</div>
```

Every attribute holds plain JavaScript. Inside `n-bind-*` and `n-on-*`, `this` is the element, and the names of the scope can be used as variables.

### Attributes

#### `n-scope`
Makes a reactive scope from an object. Elements inside it read and write its names, and binds that read a name run again when it changes.

```html
<div n-scope="{ first: 'Ada', last: 'Lovelace', full() { return `${this.first} ${this.last}` } }">
  <p n-bind-textcontent="full()"></p>
</div>
```

- The value can be any expression that gives an object, such as `n-scope="makeCart(this)"`. Methods and getters keep working, with `this` as the scope.
- `n-scope` with no value makes an empty scope.
- The `data-*` attributes of the scope's element are added to it as strings, named as `dataset` names them.
- Scopes nest. A name is read from the nearest scope that has it, and written back to that scope.

#### `n-let-<name>`
Adds one name to the scope, from an expression. An element with `n-let-*` is a scope even without `n-scope`. An `n-let-*` wins over `n-scope` and `data-*` of the same name.

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
| `n-bind-class="…"` | Adds the classes of a string, an array, or the keys of an object whose values are true, and removes the ones it added before |
| `n-bind-class.<name>="…"` | Toggles one class |
| `n-bind-style.<css-name>="…"` | Sets one style, `--custom` properties included. `null` or `false` removes it |
| `n-bind-dataset.<name>="…"` | Sets `data-<name>`. `null` or `false` removes it |
| `n-bind-<property>.<sub>="…"` | Sets a property of a property |

```html
<li n-bind-class="{ done: item.done, active: item.id === current }"
    n-bind-style.--progress="item.progress + '%'"></li>
```

#### `n-on-<event>`
Runs statements when the event fires. The event is `e`, and the handler can `await`. Custom events and events from other libraries work too.

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
| `.debounce<ms>` | Runs only the last of events that come within `<ms>` |

```html
<form n-on-submit.prevent="$post('/save', e)">…</form>
<input n-on-input.debounce300="$get('/search', { q: this.value })">
```

#### `n-ref`
Puts the element in its scope's `$refs` under the given name.

```html
<div n-scope>
  <button n-on-click="$refs.dialog.showModal()">Open</button>
  <dialog n-ref="dialog">…</dialog>
</div>
```

#### `n-form`
Copies each named field inside it into the scope, and updates it on `input` and `change`. A checkbox gives a boolean, a number or range field a number, a file field its `FileList`, and a radio group the value of the checked one. Submit buttons inside it are disabled while the scope has a request out.

```html
<form n-scope n-form n-on-submit.prevent="$post('/signup', e)">
  <input name="email" type="email">
  <button>Sign up</button>
  <p n-bind-hidden="!email">We will write to <span n-bind-textcontent="email"></span>.</p>
</form>
```

#### `n-ignore`
Nagi leaves the element and everything inside it alone.

### Helpers

Every scope has these names. Elements outside any scope can use them too.

| Helper | Description |
|---|---|
| `$get(url, data, options)` | Sends a GET request. `$post`, `$put`, `$patch` and `$delete` send the other methods |
| `$fetch(url, method, data, options)` | Sends a request with any method |
| `$abort()` | Aborts every request of the scope |
| `$fetching` | `true` while the scope has a request out |
| `$refs` | The elements named by `n-ref` |
| `$dataset()` | The `data-*` of the element and its ancestors up to the scope, the nearest first |
| `$dispatch(name, detail, options)` | Dispatches a bubbling event from the element |
| `$watch(fn)` | Runs `fn`, and runs it again when what it read changes |
| `$debounce(fn, ms, abortable)` | Runs `fn` after `ms`, only the last of calls that come within it. With `abortable`, a new request of the scope drops it |
| `$persist(name, key)` | Restores a name of the scope from `localStorage`, and saves it there as it changes |

### Requests

A request sends only the data it is given. The data can be:

- An object. Arrays repeat the key, and files make it `FormData`
- A form, an element inside a form, or a submit event. Its fields are sent, with the button that submitted it
- `FormData`, `URLSearchParams`, or a query string

GET, HEAD and DELETE put the data in the query string. Other methods send it as the body. Every request has the `n-request: true` header.

```html
<button n-on-click="$delete(`/items/${id}`)">Delete</button>
<button n-on-click="$get('/items', $dataset())" data-page="2">More</button>
```

`options` can hold:

- `timeout`: aborts the request after this many milliseconds
- `dedupe: false`: sends a write even while the same one is out

Within a scope, a new request aborts a read (GET, HEAD, OPTIONS) that is still out, so the newest answer wins. A write is not aborted by a read. A write that is the same as one still out is skipped, and `fetchskip` is dispatched.

### Responses

The answer is HTML. Each top-level element with an `id` replaces the element of the same `id` on the page. `n-swap` on the answer's element picks how:

| `n-swap` | Effect |
|---|---|
| `outer` (default) | Replaces the target |
| `inner` | Replaces the target's children |
| `before` / `after` | Puts the children before or after the target |
| `prepend` / `append` | Puts the children at the start or end of the target |

```html
<div id="cart-count">3</div>
<ul id="items" n-swap="append">
  <li>New item</li>
</ul>
```

What is swapped in is set up as if it had been on the page. `style`, `class`, `width` and `height` of an element that keeps its `id` start from their old values and move to the new ones in the next frame, so CSS transitions run. An error answer is swapped only when one of its elements matches an `id` on the page.

These response headers change what happens:

| Header | Effect |
|---|---|
| `n-redirect: <url>` | Goes to the URL instead of swapping |
| `n-replace-url: <url>` | Replaces the URL in the address bar |

### Events

| Event | Sent to | When |
|---|---|---|
| `init` | An element with `n-bind-*` or `n-on-*` | After its binds and handlers are set up. Does not bubble |
| `destroy` | An element with `n-bind-*` or `n-on-*` | Before a swap removes it. Does not bubble |
| `fetcherr` | The element that made the request | When the request fails or the answer is not 2xx. `detail` has `err`, `url`, `status`, `text` and `swapped` |
| `fetchskip` | The element that made the request | When a write is skipped as a duplicate. `detail` has `method` and `url` |
| `fetchredirect` | The element that made the request | Before `n-redirect` is followed. Cancel it to stay. `detail` has `url` |

`fetcherr`, `fetchskip` and `fetchredirect` bubble, so one handler on an outer element can catch them all. They go to `document` when the element is no longer on the page.

```html
<body n-on-fetcherr="alert(`Failed: ${e.detail.status ?? e.detail.err}`)">
```

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
