# AUREATE Gastro Lounge 立地人口調査アプリ

住所・プリセット地点・緯度経度を中心に、半径別の推計人口・推計世帯数を表示する静的Webアプリです。  
データは `data/` フォルダ内の e-Stat 国勢調査 2020年 500m地域メッシュを自動読み込みします。

## ファイル構成

```text
index.html
style.css
app.js
data/
  tblT001101H4930.txt
  tblT001101H5030.txt
  tblT001101H5031.txt
  tblT001101H5130.txt
  income-reference.json
```

## 使い方

1. `index.html` をWebサーバー上で開きます。
2. スマホでは `data/` の人口データを自動読み込みします。
3. プリセット地点、住所検索、または緯度経度入力で中心地点を指定します。
4. 1km、3km、5kmの人口・世帯数が標準表示されます。
5. 詳細半径を開くと、125m、250m、500m、750m、8km、10kmも選択できます。
6. `資料用表示` を押すと、スクリーンショット向けの簡易レイアウトに切り替わります。

PCでは、画面左の「人口CSV/TXTを手動読込」から別の e-Stat メッシュファイルを読み込むこともできます。

## 集計仕様

- 出典: e-Stat 国勢調査 2020年 500m地域メッシュ
- 集計方法: 500mメッシュの人口・世帯数を半径圏との重なり面積に応じて按分集計した推計値
- 対応列: `KEY_CODE`, `T001101001`, `T001101034`
- `T001101001` は人口総数として扱います。
- `T001101034` は世帯総数として扱います。
- `*` や空欄は集計対象外です。

## 世帯収入参考値

国勢調査500m地域メッシュには世帯収入が含まれません。  
このアプリでは、世帯収入を人口・世帯数とは別枠の参考値として `data/income-reference.json` から読み込みます。

`income-reference.json` の例:

```json
[
  {
    "areaName": "宗像市",
    "averageHouseholdIncome": null,
    "medianHouseholdIncome": null,
    "source": "",
    "note": "未登録"
  }
]
```

編集方法:

- `areaName`: プリセット地点に設定した地域名と一致させます。
- `averageHouseholdIncome`: 平均世帯収入を万円単位の数値で入力します。未登録は `null`。
- `medianHouseholdIncome`: 中央世帯収入を万円単位の数値で入力します。未登録は `null`。
- `source`: 出典名やURLを入力します。空欄の場合は「出典未登録」と表示します。
- `note`: 補足を入力します。未登録の場合は「未登録」と表示します。

世帯収入は国勢調査メッシュから直接算出した値ではありません。必ず参考値として扱ってください。

## GitHub Pagesで公開

1. GitHubで新しいリポジトリを作成します。
2. このフォルダ内の `index.html`, `style.css`, `app.js`, `data/` をリポジトリ直下に配置します。
3. GitHubのリポジトリ画面で `Settings` を開きます。
4. `Pages` を開きます。
5. `Build and deployment` の `Source` で `Deploy from a branch` を選びます。
6. Branchを `main`、Folderを `/root` にして保存します。
7. 数分後に表示される GitHub Pages URL を開きます。

公開後の確認:

1. GitHub Pages の公開URLをPCで開きます。
2. スマホで同じURLを開きます。
3. プリセット地点を切り替え、1km/3km/5kmの人口・世帯数が表示されることを確認します。
4. `資料用表示` を押し、地点名・地図・人口・世帯数・所得水準参考・出典・集計方法が見えることを確認します。
5. `data/income-reference.json` を編集した場合は、GitHubへpush後にページを再読み込みして反映を確認します。

## Netlifyで公開

1. Netlifyにログインします。
2. `Add new site` から `Deploy manually` を選びます。
3. このフォルダをドラッグ&ドロップします。
4. 発行されたURLを開きます。

## Vercelで公開

1. Vercelにログインします。
2. 新しいプロジェクトを作成します。
3. このフォルダを含むリポジトリを連携します。
4. Framework Presetは `Other` または静的サイトとして設定します。
5. Build commandは空、Output directoryは `.` にします。

## 注意

- `file://` で直接開くと、ブラウザの制限で `data/` の自動読み込みが失敗することがあります。
- GitHub Pages、Netlify、VercelなどのWeb公開環境では自動読み込みできます。
- 地図タイルやLeaflet CDNが読み込めない場合でも、人口集計結果は表示されます。
- Leafletをローカル運用したい場合は、`vendor/leaflet/leaflet.js` と `vendor/leaflet/leaflet.css` を配置してください。
