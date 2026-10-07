# pi-gh

Piの会話から、共通YAMLに沿ったGitHub Issue案・ラベル変更を検証し、画面で承認した内容だけ実行するPi拡張です。MIT。CLIのbinは提供しません。既存gh-issueflowは削除・変更不要です。

## 要件と導入
- Node.js >=22.19.0、Pi 1.0.4、GitHub CLI gh。実機検証はmacOS。
- 変更には通常のgh認証が必要です。認証情報・tokenをこの拡張へ渡す設定はありません。
- 通常Piへ導入: `pi install npm:@papillon6814/pi-gh@0.1.1`。Profileを使わない通常の共通導入の例です。
- pi-profileのDevelopmentだけで使う: `pi-profile packages add --profile developer npm:@papillon6814/pi-gh@0.1.1`、`pi-profile packages install --profile developer`。共通settingsへは追加しません。
- ソース利用時は先に `npm install --ignore-scripts && npm run build`。Piホスト提供APIはpeerで、配布に本体を含めません。

## ツール
| 名前 | 主な入力 | 動作 |
|---|---|---|
| gh_issue_validate | draftPath、template/templatePath | オフラインの構造/policy検証 |
| gh_issue_preview | 同上 | マスク済みプレビューとdigest。ラベル付きはremote確認 |
| gh_issue_submit | 同上 | TUIで人間確認後にIssue作成 |
| gh_labels_validate | changePath | オフラインの構造検証 |
| gh_labels_preview | changePath | 対象・before/after・影響対象・digest |
| gh_labels_apply | changePath | TUI確認後にラベル変更 |
| gh_issue_form | template/templatePath | GitHub Issue FormのYAML文字列を返す。ファイル上書きなし |

パスは作業ディレクトリ基準。標準templateはtask（既定）/parent。独自templatePathと同時指定はできません。examplesは架空のexample/demoなので、実行前に対象repoと内容を直してください。

## 操作の流れ
1. 案JSONを用意しvalidate。
2. previewを読み、必要なら案・template・policyを直す。
3. submit/applyを呼び、Piの確認画面で対象と内容を確認。上下/Pageキーで全文を読めます。
4. 既定はCancel。左右でApproveを明示選択してEnter。Escape/Ctrl-Cは取消。

初版ではTUIのローカル人間確認が必要です。RPC、print/JSON、子エージェントは変更を拒否します。読み取りツールとフォーム生成はUIなしでも使えます。外部変更ツールはmodel-onlyで、codemodeスクリプトから呼べません。承認hashやapprovedフラグをモデルから渡す経路はありません。

入力bytes/template/policyとremote identity/stateを承認後にも再検査します。変更・取消・会話切替・tree移動・reload/shutdownで旧承認は使えません。承認は保存・再開・別sessionへ引き継ぎません。GitHub APIの検査とwriteの間の競合を完全には防げないため、同じ対象の並行編集は避けてください。

## 入力とモデルpolicy
templates/parent.yml、task.ymlが正本、formsは生成物です。fieldsのrequired/options/順序/制限とpolicies/models.ymlを読み直します。担当はmodel/thinking/reason、上位tierはupperTierApprovalを含めます。配布モデル表は例で、実際の利用可能性や予算承認を保証しません。upperTierApprovalの文字列だけで人間の真正な課金承認は証明できません。

Issue JSONはversion/template/repo/title/fields/agents、任意labelsとparentIssue。labelsは既存ラベルのみで、暗黙に作成しません。ラベル変更はversion:1とrepo、operationがissue-labels/label-create/label-edit/label-delete。詳しい例はexamples/labels-*.jsonです。指定外ラベルは維持し、PRへのissue-labelsは拒否します。

## 安全境界と結果
秘密情報検出はヒューリスティックです。raw inputだけでなくdecoded文字列・object key・remote metadataをマスクし、候補があれば変更を拒否します。秘密漏洩ゼロや自由なbashからの直接gh実行防止を保証するものではありません。

未知/重複JSON・YAMLキー、独自tag/alias、32段超階層、外部policy参照、入力1MiB超を拒否。policyのsymlink/descriptor検査を維持します。ghはshellなし、固定argv/stdin、GH_HOST=github.comで起動。60秒期限、各stdio1MiB、cleanup猶予100ms、POSIX所有process groupを停止します。Windowsの子孫全体停止は保証しません。

ラベル一覧・影響対象は各100ページ/合計1MiBまで。上限・権限不足・検査失敗では変更しません。改名・削除・説明/色編集の影響を確認します。

結果はvalidated/preview/generated/created/applied/noop/rejected/not-started/unknown。unknownは既に変更済みの可能性があるため、GitHubを手動確認し、再preview・再承認してください。自動再試行・自動取消はありません。既存コアのIssue URL検証と、ラベル付きIssue/ラベル変更の事後確認を維持しています。

既存Issue本文/タイトル編集、sub-issue、assignee/Project、一括操作は対象外です。

## 開発・検証
`npm run build`、`npm run typecheck`、`npm test`。元コアの回帰はtest/core、承認・lifecycleはservice tests、ツール/UIはextension testsです。
`python3 scripts/test-pi-gh-cli.py --pi /absolute/path/to/pi`は合成HOME、偽gh、loopbackモデルだけで実Piを検証します。実アカウントや実GitHubへ投稿しません。
`npm pack`にはentry、compiled core、templates、架空examples、README、LICENSEだけを含めます。docs/test/認証は含めません。
