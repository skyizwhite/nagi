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

Copy `dist/nagi.min.js` into your project and load it with a normal or `defer` script tag (not `async`).

```html
<script defer src="/js/nagi.min.js"></script>
```

```html
<div n-scope="{ count: 0 }">
  <button n-on-click="count++">+1</button>
  <span n-bind-textcontent="count"></span>
</div>
```

The values of `n-let-*`, `n-bind-*` and `n-on-*` are plain JavaScript. In them, the names of the scope are variables, `this` is the scope, and `$el` is the element.

### Attributes

#### `n-scope`
Makes a reactive scope from an object. Elements inside it can read and write its names, and bindings update when a name they read changes.

```html
<div n-scope="{ first: 'Ada', last: 'Lovelace', full() { return `${this.first} ${this.last}` } }">
  <p n-bind-textcontent="full()"></p>
</div>
```

- The value can be any expression that gives an object, such as `n-scope="makeCart($el)"`. Write methods with method syntax (`inc() { this.n++ }`), not arrow functions.
- `n-scope` with no value makes an empty scope.
- Scopes nest. Inner elements can use the names of outer scopes too.

#### `n-let-<name>`
Adds one name to the scope from an expression, which can use the names of outer scopes. Write it on the element of `n-scope`; Nagi logs an error otherwise. Elements inside the scope read and write the name as any other.

```html
<div n-scope n-let-open="false" n-let-toggle="() => open = !open">
  <button n-on-click="toggle()">Menu</button>
  <nav n-bind-hidden="!open">…</nav>
</div>
```

- It wins over a key of the same name in the `n-scope` object.
- Names starting with `$` or `_nagi` are reserved for Nagi.

#### `n-bind-<property>`
Sets a property of the element to an expression, and keeps it up to date. `n-bind-textcontent` sets `textContent`, and so on. A promise sets the property when it resolves.

```html
<input n-bind-value="query" n-bind-disabled="$fetching">
```

| Attribute | Effect |
|---|---|
| `n-bind-class="…"` | Adds the classes of a string, an array, or an object's keys whose values are truthy. Classes written in the HTML stay |
| `n-bind-class.<name>="…"` | Toggles one class |
| `n-bind-style.<css-name>="…"` | Sets one style, `--custom` properties included. `null` or `false` removes it |
| `n-bind-dataset.<name>="…"` | Sets `data-<name>`. `null` or `false` removes it |

```html
<li n-bind-class="{ done: item.done, active: item.id === current }"
    n-bind-style.--progress="item.progress + '%'"></li>
```

#### `n-on-<event>`
Runs statements when the event fires. The event is `e`, and the handler can `await`. Any event works, custom ones included, as long as its name is lowercase.

```html
<button n-on-click="count++; $dispatch('changed', { count })">+1</button>
```

| Modifier | Effect |
|---|---|
| `.prevent` | Calls `e.preventDefault()` |
| `.stop` | Calls `e.stopPropagation()` |
| `.once` | Runs only the first time |
| `.window` | Listens on `window` |
| `.debounce<ms>` | Waits until the events stop for `<ms>`, then runs once |

```html
<form n-on-submit.prevent="$post('/save', e)">…</form>
<input n-on-input.debounce300="$get('/search', { q: $el.value })">
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
Copies the value of each named field inside it into the scope, as the user changes it, and disables the submit buttons while the scope has a request in flight.

```html
<form n-scope n-form n-on-submit.prevent="$post('/signup', e)">
  <input name="email" type="email">
  <button>Sign up</button>
  <p n-bind-hidden="!email">We will write to <span n-bind-textcontent="email"></span>.</p>
</form>
```

- Reads `input`, `select` and `textarea`. A checkbox gives `true` or `false`, a radio group the checked value, a number field a number (`undefined` when empty), a file field its `FileList`, a multiple select a list, and other fields a string.
- Values flow one way, from the fields to the scope. Write the first value in the field's HTML, and use `n-bind-value` to change a field from the scope.
- The form owns the names of its fields. Don't also define them in `n-scope` or `n-let-*`, and give each field its own name, except radios of one group. Nagi logs an error otherwise.
- A name like `first-name` is not a valid variable name; read it as `this['first-name']`, or use names like `firstName`.
- For custom elements, use `n-on-*`, as in `n-on-input="this.date = $el.value"`.

#### `n-ignore`
Nagi leaves the element and everything inside it alone.

### `data-*` attributes

Use `data-*` for constant values the server writes into the HTML. They are not names in the scope; read them with:

- `$el.dataset.<name>`: the element's own
- `$dataset()`: the element's and all its ancestors', the nearer ones winning

```html
<body data-csrf="…">
  <ul n-scope data-list="7">
    <li data-item="42">
      <button n-on-click="const { list, item, csrf } = $dataset(); $post('/move', { list, item, csrf })">Move</button>
    </li>
  </ul>
</body>
```

Pick the values a request needs from `$dataset()` rather than sending all of it.

### Helpers

| Helper | Description |
|---|---|
| `$get(url, data, options)` | Sends a GET request. `$post`, `$put`, `$patch` and `$delete` send the other methods |
| `$fetch(url, method, data, options)` | Sends a request with any method |
| `$abort()` | Aborts the scope's requests |
| `$fetching` | `true` while the scope has a request in flight |
| `$refs` | The elements named by `n-ref` |
| `$dataset()` | The `data-*` of the element and its ancestors |
| `$dispatch(name, detail, options)` | Dispatches a bubbling event from the element |
| `$watch(fn)` | Runs `fn`, and again whenever what it read changes |
| `$debounce(fn, ms)` | Runs `fn` once calls have stopped for `ms` |
| `$persist(name, key)` | Keeps a name of the scope in `localStorage`. Call it from `n-on-init` |

### Requests

A request sends only the data you pass:

- an object (arrays repeat the key; files are sent as `FormData`)
- a form, an element inside one, or a submit event, to send the form's fields
- `FormData`, `URLSearchParams` or a query string

GET, HEAD and DELETE put the data in the query string; other methods send it as the body. Every request has an `n-request: true` header, and the helpers return nothing: the response updates the page.

```html
<button n-on-click="$delete(`/items/${id}`)">Delete</button>
<button n-on-click="$get('/items', { page: $el.dataset.page })" data-page="2">More</button>
```

`options` can hold `timeout` (milliseconds) and `dedupe: false`.

- **Reads:** a scope runs one GET at a time. A new request aborts the GET in flight, so the newest wins. Put reads that should run side by side in separate scopes.
- **Writes:** POST and the other writes are never cut off. The same write is not sent again while one is in flight.

### Responses

The response is HTML. Each top-level element with an `id` updates the element with the same `id` on the page, as `n-swap` on the response's element says:

| `n-swap` | Effect |
|---|---|
| `outer` (default) | Replaces the element |
| `inner` | Replaces its children |
| `before` / `after` | Inserts the response's children before or after it |
| `prepend` / `append` | Inserts them at the start or end of it |

For example, the server responds with:

```html
<div id="cart-count">3</div>
<ul id="items" n-swap="append">
  <li>New item</li>
</ul>
```

What comes in works like the rest of the page, and CSS transitions run on elements that keep their `id`. An error response is used only if it has elements with `id`s on the page.

| Response header | Effect |
|---|---|
| `n-redirect: <url>` | Goes to the URL instead (send it with a 2xx status) |
| `n-replace-url: <url>` | Replaces the URL in the address bar |

### Events

| Event | When |
|---|---|
| `init` | An element with `n-bind-*` or `n-on-*` is set up |
| `destroy` | Such an element is about to be removed by a swap |
| `fetcherr` | A request fails or times out, or its response is not 2xx. `e.detail` has `status`, `text` and `err` |
| `fetchskip` | A write is skipped because the same one is in flight |
| `fetchredirect` | Nagi is about to follow `n-redirect`. Cancel it to stay |

The `fetch*` events bubble. Listen with `.window` to catch them all:

```html
<body n-on-fetcherr.window="alert(`Failed: ${e.detail.status ?? e.detail.err}`)">
```

### Things to know

- HTML lowercases attribute names, so `n-let-isOpen` defines `isopen`.
- Changes are tracked when a name is assigned: write `items = [...items, x]`, not `items.push(x)`, and `user = { ...user, name }`, not `user.name = name`.
- Declare the names you assign in a scope. Assigning an undeclared name makes a global variable.
- In a handler, call `$dispatch` and `$dataset()` before the first `await`; after it they act from the scope's element. `$el` stays the handler's element.
- Nagi sets up the page when it loads, and what responses bring in. Elements added by other scripts are not set up.

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
