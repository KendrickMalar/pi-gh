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
      // 件数: src 57、test 34（元の数。どちらも 30 件超。ルールごと・ディレクトリごとに数えた）。
      files: [`src/**/*.${ts}`, `test/**/*.${ts}`],
      rules: { "typescript/no-non-null-assertion": "off" },
    },
    {
      // type を interface に替えると、添字シグネチャを持つ型からの as が型エラーになる。既存の書き方（type）を保つ。
      // 件数: src 34（extensions は 1 件で 30 以下のため直した）。
      files: [`src/**/*.${ts}`],
      rules: { "typescript/consistent-type-definitions": "off" },
    },
    {
      // テストは node:test。トップレベルの test() は Promise を返すが await しない作法。
      // JSON.parse などの any のメンバーを直接読む。
      // 件数: no-floating-promises 100、no-unsafe-member-access 109（どちらも test。30 件超）。
      // no-unsafe-assignment・call・argument・return は型の注釈で直したので有効。
      files: [`test/**/*.${ts}`],
      rules: {
        "typescript/no-floating-promises": "off",
        "typescript/no-unsafe-member-access": "off",
      },
    },
  ],
});
