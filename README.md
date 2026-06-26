# AUREATE Gastro Lounge 立地人口調査アプリ

住所・プリセット地点・緯度経度を中心に、半径別の推計人口を表示する静的Webアプリです。  
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
```

## 使い方

1. `index.html` をWebサーバー上で開きます。
2. スマホでは `data/` の人口データを自動読み込みします。
3. プリセット地点、住所検索、または緯度経度入力で中心地点を指定します。
4. 1km、3km、5kmの人口が標準表示されます。
5. 詳細半径を開くと、125m、250m、500m、750m、8km、10kmも選択できます。

PCでは、画面左の「人口CSV/TXTを手動読込」から別の e-Stat メッシュファイルを読み込むこともできます。

## 集計仕様

- 出典: e-Stat 国勢調査 2020年 500m地域メッシュ
- 集計方法: 500mメッシュ人口を半径圏との重なり面積に応じて按分集計した推計値
- 対応列: `KEY_CODE` と `T001101001`
- `T001101001` は人口総数として扱います。
- `*` や空欄は集計対象外です。

## GitHub Pagesで公開

1. GitHubで新しいリポジトリを作成します。
2. このフォルダ内の `index.html`, `style.css`, `app.js`, `data/` をリポジトリ直下に配置します。
3. GitHubのリポジトリ画面で `Settings` を開きます。
4. `Pages` を開きます。
5. `Build and deployment` の `Source` で `Deploy from a branch` を選びます。
6. Branchを `main`、Folderを `/root` にして保存します。
7. 数分後に表示される GitHub Pages URL を開きます。

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
