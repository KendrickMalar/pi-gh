# gh_project_create 追加 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans（Native）または superpowers:subagent-driven-development。Steps は `- [ ]`。

**Goal:** pi-gh に Projects V2 を新規作成する write 操作 `gh_project_create` を足す。作成と同時に repo へ紐付ける。

**Context:** 0.7.0 は Project 作成が対象外。理由は `docs/superpowers/plans/composable-github-progress.md:19`「当面の接合部に不要なので後回し」。禁止ではない。ユーザー決定: repo 紐付け必須／同 owner に同名 Project があればエラー。

**Architecture:** 既存 write の流れ（validateChange → snapshot → 承認 → 再 snapshot → apply → verify snapshot）にそのまま乗せる。owner は change.repo の owner。許可は既存の repo キーの grant（`KendrickMalar/*` など）で判定し、grant の形は変えない。

**Tech Stack:** TypeScript、gh CLI、GitHub GraphQL（`createProjectV2` に `repositoryId` を渡すと、作成と紐付けが1回の mutation で済む。公式: docs.github.com/en/graphql/reference/projects）、node:test。

**作業場所:** `~/Code/pi-gh`（clone 済み、main=a372ffa）の worktree `feat/project-create`。worktree 作成後に `npm install`。

## Global Constraints
- change JSON: `{"version":1,"repo":"OWNER/REPO","operation":"project-create","title":"..."}`。キーはこれだけ
- title: trim 後に空でない、256文字以下、制御文字なし（issue-edit の title 規則と同じ）
- 重複判定: owner の全 Project（closed 含む）で、title を大文字小文字無視で比較。一致があれば `PROJECT_EXISTS` で書き込み前に停止
- 自動リトライなし。mutation 開始後の失敗は `unknown`（既存どおり）
- コミットに AI 帰属行を付けない

## Review Focus
1. owner が Organization の repo → User と同じく作れる（inline fragment 両方）
2. 同名 Project が closed で残っている → PROJECT_EXISTS
3. owner の Project が100件超 → ページングで全件見る。カーソル異常は GITHUB_LIMIT
4. 承認中に誰かが同名 Project を作った → 再 snapshot で PROJECT_EXISTS、書き込まない
5. 作成後に紐付けが見えない／同名が2件 → `unknown`（applied と言わない）

---

### Task 1: 入力検査と許可リスト

**Files:** Modify `src/operation-input.ts`（5, 9, 27-37, 42, 59 行付近）、`src/permissions.ts:11`。Test `test/operations.test.mjs`、`test/permissions.test.mjs`

- [ ] 失敗するテストを書く: 空 title・257文字・制御文字・余分キー（projectId 等）・issue 付きは `rejected`、書き込み0件。permissions に `gh_project_create` を含む grant が読めること、`allows('gh_project_create','KendrickMalar/x')` が `KendrickMalar/*` で true
- [ ] `npm run test:extension` で失敗を確認
- [ ] 実装:
  - `githubWrites` に `'gh_project_create'`
  - `changes` に `'project-create':{name:'gh_project_create',keys:['title']}`
  - 42行: `if(!['project-field-update','project-create'].includes(raw.operation))positive(raw.issue);`
  - 59行: `if(raw.operation.startsWith('project-')&&raw.operation!=='project-create')nodeId(...)`
  - title 検査: `if(raw.operation==='project-create'&&(typeof raw.title!=='string'||!raw.title.trim()||raw.title.length>256||/[\u0000-\u001f\u007f]/.test(raw.title)))fail('ARGUMENT','title','Invalid project title.');`
  - `permissions.ts` の `allowed` に `'gh_project_create'`
- [ ] テスト通過を確認 → commit `feat: gh_project_create の入力検査と許可`

### Task 2: GraphQL と snapshot / apply / 結果

**Files:** Modify `src/github-api.ts`、`src/operations.ts`（snapshot 111-147、apply 148-161、結果 193）。Test `test/github-fixture.mjs`、`test/operations.test.mjs`

**Interfaces（Produces）:**
- `projectOwnerQuery`: `repository(owner,name){id nameWithOwner owner{__typename id login ... on User{projectsV2(first:100,after:$cursor){nodes{id number title url closed} pageInfo{hasNextPage endCursor}}} ... on Organization{同じ}}}`
- `projectReposQuery`: `node(id){... on ProjectV2{id repositories(first:100){nodes{nameWithOwner}}}}`
- `createProjectMutation`: `mutation($ownerId:ID!,$repositoryId:ID!,$title:String!){createProjectV2(input:{ownerId:$ownerId,repositoryId:$repositoryId,title:$title}){projectV2{id number url title}}}`
- `GithubApi.ownerProjects(repo):Promise<{repositoryId,owner:{id,login},projects:JsonObject[]}>` — `project()` と同じページング・カーソル検査を流用
- `GithubApi.projectRepos(projectId):Promise<string[]>`

- [ ] fixture に分岐を足す: query に `projectsV2` → `s.projects` を返す（`s.ownerType` で User/Organization、`mode==='pages'` で hasNextPage）、`createProjectV2` → `s.projects` に追加し `repositories` に `example/demo`、`repositories(` → 該当 Project の repos
- [ ] 失敗するテスト（Review Focus 1-5 を含む）:
  - 正常: applied、mutation の variables が `{ownerId,repositoryId,title}`、結果 `data.project.id` あり
  - Organization owner でも applied
  - closed の `demo`（大小違い）があると `PROJECT_EXISTS`、書き込み0件
  - 承認 confirm 中に同名を state へ足す → 書き込み0件で rejected
  - 作成後に紐付けなし／同名2件 → `unknown`
  - headless: `permissions.allows` が gh_project_create を許すときだけ UI なしで applied
- [ ] `npm run test:extension` で失敗を確認
- [ ] 実装（snapshot の先頭、`c.issue` 読みの直後）:
  ```ts
  if(c.operation==='project-create'){
   const o=await api.ownerProjects(c.repo),key=c.title!.trim().toLowerCase();
   const hits=o.projects.filter(p=>typeof p.title==='string'&&p.title.trim().toLowerCase()===key);
   s.owner={id:o.owner.id,login:o.owner.login,repositoryId:o.repositoryId};
   if(!verify){if(hits.length)fail('PROJECT_EXISTS','title','A project with this title already exists for '+o.owner.login+'.');return s;}
   if(hits.length===1&&(await api.projectRepos(hits[0]!.id as string)).some(r=>r.toLowerCase()===c.repo.toLowerCase())){s.project={id:hits[0]!.id,number:hits[0]!.number,url:hits[0]!.url,title:hits[0]!.title};s.noop=true;}
   return s;
  }
  ```
  - `Snapshot` に `owner?:JsonObject` を追加。digest に入るのは owner/repositoryId のみ（全 Project 一覧は入れない）
  - apply: `case 'project-create':return api.mutateGraphql(createProjectMutation,{ownerId:before.owner!.id,repositoryId:before.owner!.repositoryId,title:c.title});`
  - 結果: `...(change.operation==='project-create'&&verified.project?{project:verified.project}:{})`
- [ ] `npm test` 全体通過 → commit `feat: gh_project_create で Project を作成し repo に紐付け`

### Task 3: ドキュメントと版

**Files:** `README.md`（17-45 ツール表、72-82 change 表、124 operation 一覧、140 対象外）、`examples/project-create.json`、`docs/superpowers/specs/composable-github.md:9`、`package.json` version

- [ ] README に `gh_project_create | changePath | Project を作成し repo に紐付け`、change 表に `project-create | title`、重複時 PROJECT_EXISTS と `project` scope 必須を記載。140行の対象外から「作成」を外す（削除・field 定義・view 変更は残す）
- [ ] example 追加、version を 0.8.0 に
- [ ] `npm test && npm run typecheck` → commit `docs: gh_project_create を記載し 0.8.0 に`

## 検証
- `npm test`、`npm run typecheck` の出力を提示
- 実 GitHub での確認は承認後に1回だけ: テスト用 repo で作成 → `gh project view` で紐付けを確認 → 作ったテスト Project の削除は別途確認

## 完了後（各々ユーザー確認が必要）
- `git fetch origin main && git merge origin/main` → PR 作成
- npm 公開と scaffold-profiles の依存更新
- `~/.pi/agent/pi-gh-permissions.json` の grant に `gh_project_create` を追加

## 未解決の質問
- 0.8.0 の npm 公開と、各 profile の更新まで今回やるか（PR 作成で止めるか）
- 自分の permissions に `gh_project_create` を足して headless で作れるようにするか（足さなければ毎回 TUI 承認）
