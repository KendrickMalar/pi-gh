# pi-gh — issueflowのPi拡張移管 設計

## 状態と目的
設計レビュー用。文書保存のみ承認済み。製品コード、Git初期化、依存導入、外部repo作成、公開、Development導入は未実施。
Piの会話から共通YAMLに沿ったIssue案とラベル変更を検証・プレビューし、人間が画面で承認した内容だけGitHubへ送る。旧CLIを必要としない独立したPiパッケージとして配布する。

## 固定条件
- ローカルrepo予定地: ~/Documents/Github/pi-gh
- 公開GitHub repo: KendrickMalar/pi-gh
- npm: pi-gh@0.1.0、MIT、pi-package keyword、公開binなし。
- 元の ~/Code/gh-issueflow は変更・削除しない。旧Git履歴、認証、業務データを持ち込まない。
- 移管基準: gh-issueflow SHA 99acc816e653a4b945d62a2d8fbfca745bcdcf5d。コピー時に内容を比較し、CLI以外のコアとテストを移す。
- Node.js >=22.19.0、Pi 1.0.4。Pi/TypeBox/TUIはホスト提供peerで、runtime dependenciesへ実体を追加しない。Pi本体は変更しない。
- 通常の認証済みghを使う。モデル・認証・MCP・他拡張の設定を変更しない。

## 構成と配布
extensions/index.tsを明示的なpi.extensions entryとする。TypeScript entryでホスト提供APIを読み、コンパイル済みのホスト非依存コアを呼ぶ。
- src/core/: 検証、入力読込、YAML/policy、render、digest、秘密情報マスク、gh process、Issue/ラベル処理。
- src/service.ts: preview、承認前後の再読込、コア呼出し。UIは注入してテストする。
- extensions/: ツール登録、結果変換、確認UI、runtime/session単位の停止・直列化。
- templates/: parent/task YAMLとモデルpolicy。モデル表は利用可能性・課金承認を証明しない例。
- examples/: 架空repo example/demoの入力のみ。
- test/とscripts/: 元の回帰テストと、拡張・配布・実Piの隔離検証。
npmのfiles許可リストはentry、compiled core、templates、架空examples、README、LICENSEのみ。設計・計画、テストfixture、証拠、設定、認証はtgzへ入れない。旧CLIは移植・内部起動とも行わない。

## ツールと利用フロー
| ツール | 入力 | 結果/効果 |
|---|---|---|
| gh_issue_validate | draftPath、template/templatePath | 構造・policy検証 |
| gh_issue_preview | 同上 | マスク済みrepo/title/body/agents/labels/digest |
| gh_issue_submit | 同上 | 画面確認後にIssue作成 |
| gh_labels_validate | changePath | 構造検証 |
| gh_labels_preview | changePath | 対象、before/after、affected、digest |
| gh_labels_apply | changePath | 画面確認後に作成/編集/削除/Issueラベル変更 |
| gh_issue_form | template/templatePath | フォームYAML文字列。ファイル書込なし |
パスはctx.cwd基準。templateはparent/task、既定task。独自templatePathとtemplateの同時指定は拒否する。標準templatesはインストール先から解決し、cwdへ依存させない。
通常はvalidate → preview → submit/apply。外部変更ツールは自身でもpreviewを作り、送信対象・本文・担当・ラベル、またはbefore/afterと影響対象を完全に閲覧できるスクロール画面で提示する。承認ボタンの既定は取消。
キーボード取消、signal取消、表示失敗は無承認として終了する。モデルからapprovedDigest・承認フラグ・UI bypassを受け付けない。
プレビューと結果は秘密情報マスク後に表示する。大きいモデル向け出力は省略を明示するが、確認画面で承認対象の全内容を閲覧できなければ変更を許可しない。

## 承認・並行実行・session寿命
初版の外部変更はTUIのみ。RPC/print/JSON/非対話・サブエージェントなど、ローカル人間確認画面を持たない経路は変更を拒否する。検証・preview・フォーム文字列生成はUIなしでも動作する。
外部変更ツールはmodel-only exposure。factoryでプロセスや通信を開始しない。同じruntimeの外部変更を直列化し、確認画面を同時に開かない。
確認前にruntime世代、session/branch、入力bytesとpreviewを捕捉する。承認後に最新入力を再読込してdigestを照合する。ラベル付きIssue/ラベル変更は既存コアのrepo identity・remote state・affected再検査も維持する。
停止条件はUI終了時だけでなく、remote再検査を挟んだ実際のgh書込起動直前にも確認する。待機キューに入れた承認やcontextを次の操作に再利用しない。
差異、session/branch切替、reload/shutdown、signal取消では送信しない。承認は一回の操作限定。保存・resume・fork・別sessionへ引き継がない。
GitHub APIだけで検査と書込の間のremote競合を完全に防げるとは主張しない。gh起動後の異常・取消・タイムアウト・検証不能はunknownとして扱い、自動再試行・自動取消しない。

## 維持する安全境界
- 未知・重複JSON/YAMLキー、独自tag/alias、32段超階層、入力1MiB超を拒否。
- policy参照のcontainment、descriptor identity、symlink race検査を維持。
- raw bytesだけでなくdecoded文字列・object key・remote metadataを秘密情報検査し、候補があれば変更を拒否。raw parser例外やgh stderrをそのまま表示しない。
- GH_HOST=github.comと対象repo/URL/identityを固定。shellなし、固定argvとstdinでghを実行。
- 60秒期限、stdout/stderr各1MiB、100ms cleanup猶予、POSIX所有process group終了を維持。AbortSignalを追加して所有gh処理を止める。
- ラベルの暗黙作成・指定外変更・一括変更なし。remote一覧は1一覧100ページ/合計1MiB、超過なら変更しない。
- Windowsの子孫process全体終了を保証しない。初版の実機検証対象はmacOS、他環境の保証範囲を明記する。
- created/applied/noop/rejected/not-started/unknownを区別し、書込後確認を省かない。
- スキルやhashは真正なユーザー承認・自由なbashからのgh実行制限の証明ではない。

## 検証と完了条件
1. 基準SHAの元コア回帰テストを確認し、移管後も全件実行。偽ghを使い、実Issue/ラベルを変更しない。
2. 承認yes/no/escape、UIなし/RPC、parallel、input/template/policy変更、remote identity/state変更、session/branch/reload/shutdown、signal取消を検証。無承認・古い承認からのwriteゼロをfake-ghログで確認。
3. host/enum/symlink/decoded secret/retained-pipe/timeout回帰を維持。追加変更はRED→GREENで確認。
4. build/typecheck/test、npm pack、公開許可リストと秘密情報検査、synthetic prefixへ実tgz導入、Pi 1.0.4のTUIと非対話で登録・確認UI・拒否経路を実測。
5. 独立読み取りレビューと親検証。標準Pi・他拡張・元gh-issueflowを保護。
6. 公開候補commit/tgz/内容を提示して実行直前に承認を得る。公開後はversion metadataとtarballで確認。

## 公開・導入の段階
Git初期化後、git worktree addによるfeature worktreeで実装する。GitHub repo KendrickMalar/pi-ghは現認証から参照できなかった。npm名pi-ghは404だが取得を保証しない。
npm whoamiは401で、公開は本人の再認証待ち。token/OTPを文書・ログ・チャットへ要求/保存せず、本人のnpm標準ログインで解決する。MFA・CAPTCHA・想定外権限要求では停止する。
認証不足でもローカル実装・隔離検証・公開候補tgzまで進められる。GitHub作成/push、npm公開、Development packages.jsonへの追加・取得は別々に対象と影響を示して確認する。共通packagesへ追加しない。実アカウントの書込試験は含めない。

## 非対象
既存Issue本文/タイトル編集、sub-issue、assignee/Project、新しい一括操作、CI自動publish/trusted publisher設定、旧CLI削除、新CLI、他Profileへの導入、実業務データでの投稿試験。

## 調査根拠
- gh-issueflow README、src/approval.ts、submit.ts、labels-apply.ts、gh-process.tsと上記SHA。
- Pi 1.0.4ローカルdocs/extensions.mdとpackages.md: host peers、lifecycle、model-only exposure、TUI/RPC/非対話の差。
- npm公式 https://docs.npmjs.com/cli/v12/commands/npm-publish/ および https://docs.npmjs.com/requiring-2fa-for-package-publishing-and-settings-modification/
