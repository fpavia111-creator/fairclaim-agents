# Fairclaim 医療請求エージェント

*Claude による翻訳です。ネイティブスピーカーによる確認は未了です。英語の [README](README.md) が正本です。*

医療請求（米国の医療制度におけるレベニューサイクル）のための 30 個の小さな MCP エージェントです。各エージェントは**一つの業務**だけを担当します。たとえば送信前の請求チェック、835 ファイルの支払拒否の仕分け、過少支払い行の発見、患者の過払い残高の処理などで、担当外の操作はできません。診療管理システム、クリアリングハウス、支払者ポータルからすでに書き出しているファイル（837、835、999、277CA、271、278、またはスプレッドシート）を読み、結果が AI モデルに届く前に患者識別子をマスクし、作業リストをお使いのコンピューターに書き出します。送信、返金、計上、支払いの前には、名前のある担当者を必ず待ちます。

MIT ライセンス · Node 20 以降 · ローカルファイルのみ · 認証情報不要 · 依存パッケージなし · テストデータはすべて架空

## 試してみる

```bash
npx -y fairclaim-claim-scrubber demo          # 架空データで請求チェック
npx -y fairclaim-denial-worklist demo       # 架空の 835 から支払拒否の作業リスト
```

各エージェントには、架空ファイルで動く `demo`、独自のテストケースで確認する `eval`、そして Claude Desktop、Claude Code、Cursor などの MCP ホスト向けの MCP サーバー（`npx -y <agent> mcp --root <フォルダー>`）があります。列名は日本語でも認識され、HTML レポートは `--lang ja` で日本語になります。

## エージェント一覧

**請求を送る前：** `fairclaim-patient-registration`（患者登録と保険情報）、`fairclaim-eligibility-checks`（271 資格確認応答）、`fairclaim-prior-authorizations`（事前承認と 278）、`fairclaim-good-faith-estimates`（無保険患者向けの誠実見積り）、`fairclaim-charge-capture`（請求漏れの診療）、`fairclaim-claim-scrubber`（請求チェック）、`fairclaim-modifier-checks`（修飾子）、`fairclaim-ncci-edits`（CMS 公開の NCCI エディット）、`fairclaim-dental-claims`（歯科）、`fairclaim-anesthesia-claims`（麻酔単位）、`fairclaim-dme-claims`（医療機器とレンタル）、`fairclaim-lab-claims`（検査、CLIA）、`fairclaim-telehealth-claims`（遠隔診療）、`fairclaim-coding-audits`（コーディング監査）。

**請求を送った後：** `fairclaim-claim-rejections`（999 と 277CA の差し戻し）、`fairclaim-ar-aging`（未収金と提出期限）、`fairclaim-remit-deposits`（835 と銀行入金の照合）、`fairclaim-denial-worklist`（原因別の支払拒否）、`fairclaim-denial-appeals`（不服申立ての下書き）、`fairclaim-underpayments`（契約に対する過少支払い）、`fairclaim-credit-balances`（過払い残高と返金）、`fairclaim-patient-statements`（患者向け請求書）、`fairclaim-payment-plans`（分割払い計画）。

**診療所の運営：** `fairclaim-fee-schedule`（料金表と Medicare の比較）、`fairclaim-payer-contract-rates`（支払者との契約）、`fairclaim-payer-scorecards`（支払者別スコアカード）、`fairclaim-provider-credentialing`（資格認定と期限）、`fairclaim-price-transparency`（病院の価格透明性ファイル）、`fairclaim-revenue-kpis`（自院の目標に対する指標）、`fairclaim-practice-go-live`（新規診療所の稼働準備）。

## 患者データ

結果は AI モデルに送られるため、各エージェントは先に患者識別子をマスクします（`--phi mask`、既定）。氏名、加入者番号、カルテ番号は安定した仮名（`PT-3f9a1c2e`）に、生年月日は生年に置き換わり、住所、電話番号、メールアドレス、社会保障番号は自由記述の中も含めて削除されます。ディスク上のレポートファイルには実名が残ります。これは PHI をモデルから遠ざける設計であり、HIPAA 準拠の判定ではありません。業務提携契約（BAA）や社内規程は引き続き適用されます。

## 安全の仕組み

- **エージェントごとの許可リスト。** 各エージェントは自分のツールしか呼び出せません。
- **拒否されるツール。** 請求の送信、支払いの計上、返金の実行、支払者ポータルへのログインは名前を挙げて遮断されています。
- **名前のある 1 クリック。** 請求書、不服申立て、返金依頼、学習したルールの採用は、Auto モードでも名前のある担当者を待ちます。
- **厳しくする方向にだけ働く記憶。** 学習したルールは担当者が承認してから適用され、チェックを追加することしかできません。
- **監査ログ**は `.remedy/` に保存され、ハッシュで連結され、設定すれば Ed25519 で署名されます。**緊急停止：** `<agent> kill`。

## テスト方法

各エージェントには独自のテスト、全エージェント共通の契約テスト（テストデータの患者識別子がどの結果にも含まれないことを含む）、架空ファイルによる 8〜13 件のテストケースがあります。スプレッドシートを使うケースはすべて、ドイツ、フランス、スペイン、ブラジル、イタリア、日本、中国、韓国の書き出し形式でも再実行し、各エージェントのファイルには悪意あるデータも混入させて検査します。[REVIEW-ver1.md](REVIEW-ver1.md)（英語）にすべての確認項目があります。

## 制限

- 各エージェントは渡されたファイルだけで動作し、支払者、クリアリングハウス、診療管理システム、銀行にはログインしません。
- コード表、支払者ルール、料金表は読み込んだものと同じだけ新しい状態です。内蔵のサンプルルールはどの支払者の方針でもありません。
- コーディング、法務、コンプライアンス、医療に関する助言ではありません。判断し行動するのは人です。
