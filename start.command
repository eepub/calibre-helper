#!/bin/bash
# eEPUB Calibre連携ヘルパー起動スクリプト(Mac)
# このファイルをダブルクリックすると、必要な準備をしてからヘルパーを起動します。
# ターミナルのウィンドウを閉じるとヘルパーは停止します
# (eEPUBからKFX/Kindle変換が使えなくなります)。

cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "[エラー] Node.js が見つかりませんでした。"
  echo "このツールを使うには、先にNode.jsをインストールしてください。"
  echo "  https://nodejs.org/ja/"
  echo "インストール後、もう一度このファイルをダブルクリックしてください。"
  echo ""
  read -r -p "Enterキーでこのウィンドウを閉じます..."
  exit 1
fi

if [ ! -d "node_modules" ]; then
  echo ""
  echo "初回起動の準備をしています(依存関係のインストール、少し時間がかかります)..."
  echo ""
  if ! npm install; then
    echo ""
    echo "[エラー] npm install に失敗しました。上のログを確認してください。"
    echo ""
    read -r -p "Enterキーでこのウィンドウを閉じます..."
    exit 1
  fi
fi

echo ""
echo "============================================================"
echo " eEPUB Calibre連携ヘルパーを起動します"
echo " このウィンドウは開いたままにしてください。"
echo " 閉じるとeEPUB側からのKFX/Kindle変換が使えなくなります。"
echo "============================================================"
echo ""

npm start

echo ""
echo "ヘルパーが終了しました。"
read -r -p "Enterキーでこのウィンドウを閉じます..."
