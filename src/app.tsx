import { Hono } from "hono";
import { createClient, type Client, type Row } from "@libsql/client/web";

type Bindings = {
  TURSO_DATABASE_URL: string;
  TURSO_AUTH_TOKEN: string;
};

type Todo = {
  id: string;
  title: string;
  completed: number;
  created_at: string;
};

type Filter = "all" | "active" | "completed";

export const app = new Hono<{
  Bindings: Bindings;
  Variables: { db: Client };
}>();

function mapTodo(row: Row): Todo {
  return {
    id: String(row.id),
    title: String(row.title),
    completed: Number(row.completed),
    created_at: String(row.created_at),
  };
}

async function getTodos(db: Client, filter: Filter): Promise<Todo[]> {
  const condition =
    filter === "active"
      ? "WHERE completed = 0"
      : filter === "completed"
        ? "WHERE completed = 1"
        : "";
  const result = await db.execute(
    `SELECT id, title, completed, created_at FROM todos ${condition} ORDER BY created_at DESC, rowid DESC`,
  );
  return result.rows.map(mapTodo);
}

function parseFilter(value: string | undefined): Filter {
  if (value === "active" || value === "completed") return value;
  return "all";
}

app.use("*", async (c, next) => {
  const db = createClient({
    url: c.env.TURSO_DATABASE_URL,
    authToken: c.env.TURSO_AUTH_TOKEN,
  });
  c.set("db", db);
  try {
    await next();
  } finally {
    await db.close();
  }
});

function Layout({ children }: { children: any }) {
  return (
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#f4f5f0" />
        <title>ToDo | Daily Ledger</title>
        <link rel="stylesheet" href="/style.css" />
        <script src="https://unpkg.com/htmx.org@2.0.4"></script>
      </head>
      <body>
        <div class="page-shell">
          <header class="topbar">
            <a class="wordmark" href="/" aria-label="Daily Ledger ホーム">
              <span class="mark" aria-hidden="true">
                D
              </span>
              <span>daily ledger</span>
            </a>
            <span class="topbar-note">PERSONAL WORKSPACE</span>
          </header>
          <main>{children}</main>
          <footer class="footer">
            <span>ひとつずつ、片づける。</span>
            <span>DAILY LEDGER · TO-DO</span>
          </footer>
        </div>
      </body>
    </html>
  );
}

function TodoItem({ todo }: { todo: Todo }) {
  const completed = Boolean(todo.completed);
  return (
    <li
      class={`todo-item${completed ? " is-complete" : ""}`}
      id={`todo-${todo.id}`}
    >
      <label class="todo-check">
        <input
          type="checkbox"
          checked={completed}
          aria-label={`${todo.title}を${completed ? "未完了に戻す" : "完了にする"}`}
          hx-patch={`/todos/${todo.id}/toggle`}
          hx-target="closest li"
          hx-swap="outerHTML"
        />
        <span class="checkmark" aria-hidden="true"></span>
      </label>
      <span class="todo-title">{todo.title}</span>
      <button
        class="delete-button"
        type="button"
        aria-label={`${todo.title}を削除`}
        hx-delete={`/todos/${todo.id}`}
        hx-target="closest li"
        hx-swap="outerHTML"
        hx-confirm="このタスクを削除しますか？"
      >
        削除
      </button>
    </li>
  );
}

function TodoCollection({ todos, filter }: { todos: Todo[]; filter: Filter }) {
  const filters: { key: Filter; label: string }[] = [
    { key: "all", label: "すべて" },
    { key: "active", label: "未完了" },
    { key: "completed", label: "完了済み" },
  ];

  return (
    <section class="todo-content" id="todo-content" aria-live="polite">
      <nav class="filters" aria-label="タスクの絞り込み">
        {filters.map(({ key, label }) => (
          <button
            type="button"
            class={`filter-button${filter === key ? " is-current" : ""}`}
            aria-pressed={filter === key}
            hx-get={`/todos?filter=${key}`}
            hx-target="#todo-content"
            hx-swap="outerHTML"
          >
            {label}
          </button>
        ))}
      </nav>
      <ul
        class="todo-list"
        id="todo-list"
        data-empty="ここはすっきり。タスクを追加しましょう。"
      >
        {todos.map((todo) => (
          <TodoItem todo={todo} />
        ))}
      </ul>
    </section>
  );
}

app.get("/", async (c) => {
  const todos = await getTodos(c.get("db"), "all");
  return c.html(
    <Layout>
      <section class="intro">
        <p class="eyebrow">DAILY LEDGER / TODAY</p>
        <h1>今日のタスク</h1>
      </section>
      <section class="task-board" aria-label="ToDoリスト">
        <form
          class="todo-form"
          hx-post="/todos"
          hx-target="#todo-list"
          hx-swap="beforeend"
          hx-on--after-request="if (event.detail.successful) this.reset()"
        >
          <label class="visually-hidden" for="todo-title">
            新しいタスク
          </label>
          <input
            id="todo-title"
            name="title"
            type="text"
            maxlength={160}
            placeholder="次にやることは？"
            autocomplete="off"
            required
          />
          <button class="add-button" type="submit">
            <span aria-hidden="true">+</span> 追加
          </button>
        </form>
        <TodoCollection todos={todos} filter="all" />
      </section>
    </Layout>,
  );
});

app.get("/todos", async (c) => {
  const filter = parseFilter(c.req.query("filter"));
  const todos = await getTodos(c.get("db"), filter);
  return c.html(<TodoCollection todos={todos} filter={filter} />);
});

app.post("/todos", async (c) => {
  const form = await c.req.parseBody();
  const title = typeof form.title === "string" ? form.title.trim() : "";
  if (!title || title.length > 160)
    return c.body("入力内容を確認してください。", 400);

  const id = crypto.randomUUID();
  const db = c.get("db");
  await db.execute({
    sql: "INSERT INTO todos (id, title) VALUES (?, ?)",
    args: [id, title],
  });
  const result = await db.execute({
    sql: "SELECT id, title, completed, created_at FROM todos WHERE id = ?",
    args: [id],
  });
  const todo = result.rows[0] ? mapTodo(result.rows[0]) : null;
  if (!todo) return c.body("タスクを作成できませんでした。", 500);
  return c.html(<TodoItem todo={todo} />);
});

app.patch("/todos/:id/toggle", async (c) => {
  const { id } = c.req.param();
  const db = c.get("db");
  await db.execute({
    sql: "UPDATE todos SET completed = 1 - completed WHERE id = ?",
    args: [id],
  });
  const result = await db.execute({
    sql: "SELECT id, title, completed, created_at FROM todos WHERE id = ?",
    args: [id],
  });
  const todo = result.rows[0] ? mapTodo(result.rows[0]) : null;
  if (!todo) return c.notFound();
  return c.html(<TodoItem todo={todo} />);
});

app.delete("/todos/:id", async (c) => {
  await c.get("db").execute({
    sql: "DELETE FROM todos WHERE id = ?",
    args: [c.req.param("id")],
  });
  return c.body(null, 200);
});
