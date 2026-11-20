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

export default defineConfig({
  ...base,
  overrides: [
    ...base.overrides,
    // 既存コードに対して切るルールと理由（PR 本文・台帳にも記録）。
    {
      files: ["**/*.{ts,mts,cts,js,mjs,cjs}"],
      rules: {
        // 承認・秘密マスクの経路で、構造の分割は振る舞いを変えうる。リファクタは別の作業で行う（41 件）。
        complexity: "off",
        "max-depth": "off",
        "max-lines-per-function": "off",
        // noUncheckedIndexedAccess の下で、直前の検査済みの添字・Map 参照に付けている（91 件）。
        "typescript/no-non-null-assertion": "off",
        // 文字列と数値・null の連結でメッセージを組み立てている。テンプレートへの置換は件数が多い（36 件）。
        "typescript/restrict-plus-operands": "off",
        // 自動修正が型を狭める代入・as を外して tsrs の型エラーになった（12 件）。tsrs-lint の型情報と tsrs の食い違いが解消するまで切る。
        "typescript/no-unnecessary-type-assertion": "off",
        // type を interface に替えると、添字シグネチャを持つ型からの as が型エラーになる（35 件）。既存の書き方（type）を保つ。
        "typescript/consistent-type-definitions": "off",
        // 制御文字の拒否が目的の正規表現。ルールの指摘そのものが仕様（7 件）。
        "no-control-regex": "off",
        // 秘密の検出・入力検証の正規表現。書き換えると一致範囲が変わりうる（prefer-w など 21 件）。
        "regexp/prefer-w": "off",
        "regexp/use-ignore-case": "off",
        "regexp/no-dupe-characters-character-class": "off",
        "regexp/no-super-linear-backtracking": "off",
        "regexp/no-unused-capturing-group": "off",
      },
    },
    {
      // テストは node:test。トップレベルの test() は Promise を返すが await しない作法（100 件）。
      // JSON.parse などの any を直接扱う（unsafe-* 計 178 件）。
      files: ["test/**/*.{ts,mts,mjs,js}"],
      rules: {
        "typescript/no-floating-promises": "off",
        "typescript/no-unsafe-member-access": "off",
        "typescript/no-unsafe-assignment": "off",
        "typescript/no-unsafe-call": "off",
        "typescript/no-unsafe-argument": "off",
        "typescript/no-unsafe-return": "off",
        "typescript/require-await": "off",
        "typescript/no-dynamic-delete": "off",
        "typescript/restrict-template-expressions": "off",
      },
    },
  ],
});
