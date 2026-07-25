// vitest 用の `server-only` スタブ。
// 本物のパッケージは Node（react-server 条件なし）で import すると throw するため、
// サーバ専用モジュール（app/lib/reports.ts 等）を単体テストできるよう空実装に差し替える。
export {};
