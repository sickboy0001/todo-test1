# ToDo管理ツール 統合要求仕様書（Hono + htmx + Cloudflare）

## 1. システム概要 (Overview)
本プロジェクトでは、軽量・高速なWebサービス環境である **Cloudflare** 上で動作するToDo管理ツールを開発します。
バックエンドに **Hono (TypeScript)**、フロントエンドに **htmx** を採用し、SPA（Single Page Application）のようなスムーズな動的UIを、ビルドサイズを極小に抑えた **サーバーサイドレンダリング（SSR）＋ HTML断片（HTML Partials）** の仕組みで実現します。
ソースコードは **GitHub** で管理し、**Cloudflare Pages** への自動デプロイ（CI/CD）パイプラインを構築します。

---

## 2. システム構成・技術スタック (Tech Stack)

| 役割 | 選定技術 | 概要・選定理由 |
| :--- | :--- | :--- |
| **Web Application Framework** | **Hono (TypeScript)** | エッジコンピューティング環境に最適化された超軽量フレームワーク |
| **Frontend / UI Layer** | **htmx** + **JSX** | クライアント側JS記述を極小化し、HTMLの拡張属性（`hx-*`）で非同期DOM更新を実現 |
| **Database / Storage** | **Turso** | TursoのサーバーレスSQLite型データベース（完全分散型・低遅延） ORMは利用しない。|
| **Hosting Platform** | **Cloudflare Pages** | エッジネットワークでのWebアプリケーション実行環境 |
| **Version Control & CI/CD** | **GitHub** + **Pages Integration** | `main` ブランチへのPushによる自動ビルド＆デプロイ |
| **Developer Tools** | **Wrangler + Turso CLI** | Pagesローカル実行およびTursoデータベースの管理 |

---

## 3. 機能要件 (Functional Requirements)

### 3.1 画面レイアウトおよびベース構造
1. **ベースレイアウト表示 (SSR):**
   * HonoのJSXコンポーネントを使用し、ヘッダー、フッター、htmxスクリプト（`<script src="https://unpkg.com/htmx.org"></script>`）を含んだ完全なHTMLページを出力。
2. **SPA風の動的更新 (htmx Partials):**
   * フォーム送信や操作時にページ全体を再読み込みせず、サーバーから返却されたHTML断片のみを特定DOM要素へ差し替え・挿入。

### 3.2 ToDo管理機能
1. **タスク一覧表示 (Read):**
   * 初期読み込み時およびフィルター切り替え時にタスク一覧をレンダリング。
   * 「すべて」「未完了」「完了済み」のステータスフィルター（`hx-get="/todos?filter=..."`）による非同期切り替え。
2. **タスク追加 (Create):**
   * フォームからの送信時、`hx-post="/todos"` を実行。
   * Hono側で新規作成された1件の `<li>` タスク要素（HTML断片）を返し、一覧の末尾（`hx-swap="beforeend"`）に非同期で追加。
   * 追加成功後、入力フォームをクリア。
3. **タスク完了状態切り替え (Update):**
   * チェックボックス操作時、`hx-patch="/todos/:id/toggle"` を実行。
   * 完了フラグを更新し、更新後のタスクDOM要素を返却して表示を切り替え（取り消し線スタイルの適用など）。
4. **タスク削除 (Delete):**
   * 削除ボタン押下時、`hx-delete="/todos/:id"` を実行。
   * サーバー側で成功レスポンス（空文字）を返し、htmx側で該当要素をDOMから除去。

---

## 4. データモデルおよびデータベース設計 (Database Architecture)

Turso上に以下のテーブルを配置し、タスク情報を永続化します。

### 4.1 テーブル定義 (`todos`)
```sql
CREATE TABLE IF NOT EXISTS todos (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## 5. 開発・デプロイ手順

### 5.1 必要なもの
- Node.js 20以降
- TursoアカウントとTurso CLI
- Cloudflareアカウント（Pagesへのデプロイ時）

### 5.2 ローカル起動
1. 依存パッケージをインストールします。
   ```sh
   npm install
   ```
2. Turso CLIでログインし、データベースを作成します。
   ```sh
   turso auth login
   npm run db:create
   ```
3. 接続URLと認証トークンを取得します。
   ```sh
   turso db show todo-db --url
   turso db tokens create todo-db
   ```
4. `.dev.vars.example` を `.dev.vars` にコピーし、`TURSO_DATABASE_URL` と `TURSO_AUTH_TOKEN` を取得した値で設定します。
5. テーブルを作成して開発サーバーを起動します。
   ```sh
   npm run db:migrate
   npm run dev
   ```
6. ブラウザーで `http://localhost:8788` を開きます。

### 5.3 Cloudflare Pagesへの公開
1. GitHubリポジトリをCloudflare Pagesに接続し、Production branchを `main` に設定します。
2. Pagesの環境変数に `TURSO_DATABASE_URL` と `TURSO_AUTH_TOKEN` を登録します。認証トークンはSecretとして登録してください。
3. Build commandは不要です。Build output directoryは `public` に設定します。`functions/` はPages Functionsとして自動認識されます。
4. `main` ブランチへpushすると自動デプロイされます。CLIで公開する場合は `npx wrangler pages deploy public` を実行します。

型チェックは `npm run typecheck` で実行できます。