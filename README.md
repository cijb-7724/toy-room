# pj-mikke

おもちゃの部屋を歩き回って、かくれたおもちゃを探す 3D アプリの試作です。

## どんなもの？

- おもちゃでいっぱいの子ども部屋が、3D で作られています。
- あなたは身長 8cm のおもちゃの人形になって、部屋の中を歩いたり飛んだりできます。
- 部屋には 100 個以上のおもちゃが置かれています。
- 画面の「さがすもの」5 個をすべて見つけると、クリアの表示が出ます。

## 起動のしかた（Windows）

1. Python が入っていることを確認します。
2. `pj-mikke` フォルダの中で、次のコマンドを実行します。

```bash
python -m http.server 8123 --directory prototype
```

3. Chrome か Edge を開き、アドレスバーに次の URL を入力して Enter を押します。

   http://localhost:8123

4. 終わるときは、コマンドを実行していた画面で `Ctrl + C` を押します。

## 操作

| キー | 動作 |
|---|---|
| クリック | 画面をつかむ（マウスで視点操作）／さがしものを選ぶ |
| W A S D | 移動 |
| Space | ジャンプ（歩く）／上昇（飛ぶ） |
| Shift | 下降（飛ぶ） |
| Tab | 歩く ⇔ 飛ぶ の切り替え |
| 1〜5 | ページ視点へ移動（1: 部屋全体、2: ナイトテーブルの上、3: いすのまわり、4: 床すれすれ、5: おもちゃ箱） |
| Ctrl | はやく動く（W A S D と一緒に押す） |
| Esc | マウスを放す |

## ファイルの場所

```
pj-mikke/
  docs/requirements.md        仕様書（くわしい説明）
  .claude/agents/             モデル別の担当エージェント定義
  prototype/
    index.html
    vendor/three.module.js
    src/
      main.js        起動・描画ループ
      scale.js       寸法・縮尺の定数
      textures.js    木目・水玉などの模様
      room.js        部屋と家具
      toys.js        おもちゃの形を作る関数
      scatter.js     おもちゃの自動配置
      controls.js    歩く・飛ぶ・ページ視点
      hunt.js        さがしもの
```

## くわしい仕様

くわしいことは [docs/requirements.md](docs/requirements.md) を見てください。
