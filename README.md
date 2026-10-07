# pi-gh

PiからGitHubを操作するTypeScript製の基盤拡張です。個別ツールを別のPi拡張から組み合わせられます。Scaffoldの工程・ウェーブ・専用テンプレートやHerdr操作は、利用側の拡張が担当します。MIT。CLIのbinは提供しません。既存gh-issueflowを削除・変更する必要はありません。

## 要件と導入
- Node.js >=22.19.0、Pi 1.0.4、認証済みGitHub CLI gh。実機検証はmacOS。
- 認証情報・tokenをpi-ghへ渡す設定はありません。Projectsには対象Projectへのアクセスと`project`相当の権限が必要です。権限不足時は停止し、自動再認証しません。
- **以下の新機能はソース版です。公開済みnpm 0.1.1には含まれません。** ソースは`npm install --ignore-scripts && npm run build`後、`pi -e /absolute/path/to/pi-gh`で使用できます。
- 既存npm版：`pi install npm:@papillon6814/pi-gh@0.1.1`。
- 既存npm版をDevelopmentだけで使う場合：`pi-profile packages add --profile developer npm:@papillon6814/pi-gh@0.1.1`、`pi-profile packages install --profile developer`。これも新機能の導入にはなりません。
- Piホスト提供APIはpeerで、本体を配布へ含めません。

## 個別ツール（契約バージョン1）

すべての結果に`outputSchema`とマスク済み`structuredContent`があります。対応版・機能は`gh_capabilities`で確認してください。変更ツールも`direct`で登録され、Piの通常のツール検証・hooksを経由して呼べます。

| 名前 | 入力 | 動作 |
|---|---|---|
| gh_capabilities | `{}` | contractVersionと対応操作。remoteアクセスなし |
| gh_issue_validate | draftPath、template/templatePath | オフラインの構造・モデルpolicy検証 |
| gh_issue_preview | 同上 | 投稿内容・digest。ラベル付きはremote確認 |
| gh_issue_submit | 同上 | 検証・許可・再確認を経てIssue作成 |
| gh_labels_validate | changePath | ラベル変更案のオフライン検証 |
| gh_labels_preview | changePath | 対象・before/after・影響対象・digest |
| gh_labels_apply | changePath | 検証・許可・再確認を経てラベル変更 |
| gh_issue_form | template/templatePath | Issue Form YAMLを返す。ファイル上書きなし |
| gh_issue_get | repo、issue | 指定Issueを取得。PRは拒否 |
| gh_issue_list | repo、任意state | Issue一覧。stateはopen/closed/all（既定all）。PRは除外 |
| gh_issue_edit | changePath | 既存Issueのtitle/body更新 |
| gh_issue_close | changePath | 既存Issueをclose |
| gh_subissues_list | repo、issue | native子Issue一覧 |
| gh_subissue_add | changePath | native親子関係の追加 |
| gh_dependencies_list | repo、issue | 指定Issueのblocked_by一覧 |
| gh_dependency_add | changePath | 指定Issueをブロックする先行Issueを追加 |
| gh_project_get | projectId | Projects V2のtitle・field一覧 |
| gh_project_items | projectId | Projectの項目・field値一覧 |
| gh_project_add_issue | changePath | 指定IssueをProjectへ登録 |
| gh_project_field_update | changePath | text/number/date/single-select field値更新 |

パスは実行時cwd基準。標準templateはtask（既定）/parent。独自templatePathと同時指定できません。Epic/Feature/Task専用テンプレートは利用側で用意します。examplesのexample/demoは架空です。

## 別拡張からの呼び出し

利用側は、pi-ghのロードと必要ツールの存在を確認し、不在・版不一致では停止してください。内部`dist/src/*`の直接importは公開SDK契約ではありません。

```typescript
// 利用側ツールのexecute内。信頼済みpi-ghが同じPiにロードされている前提。
const capabilities = await ctx.executeTool("gh_capabilities", {});
if (capabilities.isError) throw new Error("pi-gh unavailable");
const info = capabilities.result.structuredContent as {
  data?: { contractVersion?: number; operations?: string[] };
};
if (info.data?.contractVersion !== 1 ||
    !info.data.operations?.includes("gh_issue_get")) {
  throw new Error("Unsupported pi-gh contract");
}
const nested = await ctx.executeTool("gh_issue_get", {
  repo: "example/demo", issue: 10,
}, { signal });
return { ...nested.result, isError: nested.isError };
```

`ctx.executeTool()`の戻り値は結果そのものではなく`{ result, isError, toolCall }`です。結果をモデルへ返すのは呼び出し側の責務です。Piはネスト呼び出しをhooksへ通します。機能照会は登録が正しいことの保証ではないため、ロードする拡張は信頼済みのものに限ってください。

## 変更JSON

新規Issue・ラベル変更は従来の入力を維持します。新しい変更ツールは`{ changePath: "change.json" }`を受け、以下のJSONを読みます。未知・重複キーやツールとoperationの不一致は拒否します。

| operation | 必須フィールド（version:1、repo以外） | 任意フィールド |
|---|---|---|
| issue-edit | issue、title/bodyの少なくとも一方 | — |
| issue-close | issue | reason: completed（既定）/not_planned |
| subissue-add | issue（親）、relatedIssue（子） | — |
| dependency-add | issue（後続）、relatedIssue（先行） | — |
| project-add-issue | issue、projectId | — |
| project-field-update | projectId、itemId、fieldId、value | — |

```json
{"version":1,"repo":"example/demo","operation":"issue-edit","issue":10,"title":"Updated","body":"Revised specification"}
```

```json
{"version":1,"repo":"example/demo","operation":"project-field-update","projectId":"PVT_example","itemId":"PVTI_example","fieldId":"PVTSSF_example","value":{"singleSelectOptionId":"option_done"}}
```

valueは`text`、有限の`number`、実在するISO日付`date`、`singleSelectOptionId`のうち1つ。fieldの種類、Project所属、option所属、項目のIssue/repo所属を照合します。親子・依存追加は同一repo内のみ、自己参照は禁止。入力のIssue番号をGitHubのdatabase ID/node IDへ解決します。従来の`parentIssue`は本文リンクであり、native親子関係は`gh_subissue_add`で別途設定します。

## 人間承認と自動実行許可

既定は従来と同じローカルTUI承認です。全文を読んでApproveを明示選択してください。既定Cancel、Escape/Ctrl-Cは取消。RPC・print/JSON・子エージェントは、対応するローカル許可がなければ変更を拒否します。`approved`フラグやdigestをAIが渡して承認する入口はありません。

所有者が`~/.pi/agent/pi-gh-permissions.json`を配置した場合だけ、許可範囲内の操作を自動実行できます。PiのagentDir/Profileの設定とは独立した、HOME配下の固定パスです。リポジトリ内の設定は許可として読みません。

```json
{
  "version": 1,
  "grants": [{
    "repo": "example/demo",
    "operations": ["gh_issue_edit", "gh_issue_close", "gh_project_field_update"],
    "allowHeadless": true,
    "allowChild": true,
    "projectIds": ["PVT_example"]
  }]
}
```

- ファイルは現在のOSユーザー所有・mode 0600以下のregular file。ファイルと親ディレクトリのsymlinkは拒否します。未配置は通常の承認経路へ戻ります。壊れたJSON・権限不備は停止します。
- repo・operationは完全指定。ワイルドカード不可。Project変更にはprojectIdsの完全一致も必要です。
- 子にはallowChild、UIのない実行にはallowHeadlessがそれぞれ必要です。省略はfalse。
- 許可できる操作：`gh_issue_submit`、新しい変更ツール6種、`gh_label_create`、`gh_label_edit`、`gh_issue_labels`。最後の3種は`gh_labels_apply`の操作別許可名です。ラベル削除は自動許可できません。
- 許可ファイルの内容・inode・modeを固定し、変更前とghプロセス起動直前に再照合します。取り消された許可は再利用しません。許可ファイルは自動生成・変更しません。
- 許可はこのツール群の境界です。任意のshell/ファイル編集権限を持つAIや同じOSユーザーの悪意あるプロセスを隔離するサンドボックスではありません。

## 安全境界と制限

入力bytes・template・モデルpolicy・関連remote状態を固定し、承認後に再検査します。会話切り替え・tree移動・reload/shutdown・取消で保留中の処理は失効します。変更は同一拡張runtime内で直列化します。別Piプロセス間のロックやGitHub側のatomic compare-and-swapは提供しません。同じ対象の並行編集は避けてください。

秘密検出はヒューリスティックです。decoded文字列・object key・remote metadataもマスクし、秘密候補があれば変更を拒否します。秘密漏洩ゼロ、直接gh実行の防止、チェックと実write間の全競合防止は保証しません。

ghはshellなし・固定argv/stdin・github.com固定。RESTは明示methodとAPI version 2026-03-10、GraphQLは固定queryとJSON variablesを使い、任意endpoint/query入力はありません。各プロセス60秒、各stdio1MiB、cleanup猶予100ms。POSIX所有process groupを停止しますが、Windowsの子孫全体停止は保証しません。新規read操作は最大100ページ・合計1MiB、反復cursor・field値の切り捨てを拒否します。

結果はread/validated/preview/generated/created/applied/noop/rejected/not-started/unknown。`unknown`は変更済みの可能性があります。GitHubを確認するまで再実行しないでください。自動再試行・自動取消はありません。新変更操作は要求した状態を事後確認し、不一致・確認失敗はunknownにします。

Issue用YAMLはfieldsのrequired/options/順序/制限とmodels policyを正本にします。従来の上位tierにはupperTierApprovalが必要ですが、その文字列だけで真正な課金承認は証明できません。テンプレートと利用可能なモデルは別問題です。

対象外：assignee変更、コメント投稿、クロスrepo親子・依存、関係解除、Project作成/削除/field定義/view変更、iteration等のfield更新、一括write、Herdr/Scaffoldの工程判断。

## 開発・検証

`npm run build`、`npm run typecheck`、`npm test`。
`python3 scripts/test-pi-gh-cli.py --pi /absolute/path/to/pi`は合成HOME・偽gh・loopbackモデルで実PiのTUI/RPC/print・ネスト呼び出し・許可付き子実行・hooksを検証します。実アカウントや実GitHubへの試験投稿はしません。GitHubのライブ変更互換性は未実測です。
`npm pack`にはentry、compiled core、templates、架空examples、README、LICENSEだけを含め、docs/test/認証は含めません。

GitHub API参照：[sub-issues](https://docs.github.com/en/rest/issues/sub-issues)、[dependencies](https://docs.github.com/en/rest/issues/issue-dependencies)、[Projects V2](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects)。
