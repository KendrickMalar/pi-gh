import { defineConfig, type OxlintConfig } from "oxlint";

type Overrides = NonNullable<OxlintConfig["overrides"]>;
// oxlint.base.mjs は型の宣言を持たないので、読み込んだ形をここで決める。
const { createConfig } = (await import(
  new URL("./oxlint.base.mjs", import.meta.url).href
)) as {
  createConfig: (options: {
    environment: "node" | "browser";
    testFiles?: string[];
  }) => OxlintConfig & { ignorePatterns: string[]; overrides: Overrides };
};

// テストは node:test なので vitest のルールは当てない（testFiles を空にする）。
const base = createConfig({ environment: "node", testFiles: [] });

const ts = "{ts,mts,cts,js,mjs,cjs}";

export default defineConfig({
  ...base,
  overrides: [
    ...base.overrides,
    // 既存コードに対して切るルールと理由（PR 本文・台帳にも記録）。対象は件数のあるディレクトリだけ。
    {
      // 基になる設定が complexity 系を当てる範囲（src）と同じ。承認・秘密マスクの経路で、
      // 構造の分割は振る舞いを変えうるため、リファクタは別の作業で行う。
      // 件数: complexity 27、max-depth 10、max-lines-per-function 4（すべて src）。
      files: [`src/**/*.${ts}`],
      rules: {
        complexity: "off",
        "max-depth": "off",
        "max-lines-per-function": "off",
      },
    },
    {
      // noUncheckedIndexedAccess の下で、直前の検査済みの添字・Map 参照に付けている。
      // 件数: src 57、test 34（計 91）。
      files: [`src/**/*.${ts}`, `test/**/*.${ts}`],
      rules: { "typescript/no-non-null-assertion": "off" },
    },
    {
      // 文字列と数値・null の連結でメッセージを組み立てている。テンプレートへの置換は件数が多い。
      // 件数: src 24、test 9、extensions 3（計 36）。
      files: [`src/**/*.${ts}`, `test/**/*.${ts}`, `extensions/**/*.${ts}`],
      rules: { "typescript/restrict-plus-operands": "off" },
    },
    {
      // type を interface に替えると、添字シグネチャを持つ型からの as が型エラーになる。既存の書き方（type）を保つ。
      // 件数: src 34、extensions 1（計 35）。
      files: [`src/**/*.${ts}`, `extensions/**/*.${ts}`],
      rules: { "typescript/consistent-type-definitions": "off" },
    },
    {
      // 制御文字の拒否が目的の正規表現。ルールの指摘そのものが仕様。
      // 件数: src 6、extensions 1（計 7）。
      files: [`src/**/*.${ts}`, `extensions/**/*.${ts}`],
      rules: { "no-control-regex": "off" },
    },
    {
      // テストは node:test。トップレベルの test() は Promise を返すが await しない作法。
      // JSON.parse などの any を直接扱う。
      // 件数: no-floating-promises 100、no-unsafe-member-access 109、no-unsafe-assignment 26、
      // no-unsafe-call 22、no-unsafe-argument 17、no-unsafe-return 4（すべて test）。
      files: [`test/**/*.${ts}`],
      rules: {
        "typescript/no-floating-promises": "off",
        "typescript/no-unsafe-member-access": "off",
        "typescript/no-unsafe-assignment": "off",
        "typescript/no-unsafe-call": "off",
        "typescript/no-unsafe-argument": "off",
        "typescript/no-unsafe-return": "off",
      },
    },
  ],
});
