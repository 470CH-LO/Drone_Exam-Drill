# 遙控無人機線上刷題機

這是一個免安裝的靜態刷題網站，會直接讀取同資料夾內的題庫 Word 檔，自動轉成可練習的題庫資料。

## 功能

- 依章節練習
- 支援全部題目、錯題複習、未作答、曾答錯題目
- 作答後立即顯示正確答案
- 用瀏覽器 localStorage 保存作答紀錄與錯題
- 可重新執行轉檔腳本，更新題庫資料

## 專案註解

- `scripts/extract-question-bank.ps1`：將 `.docx` 題庫轉成 `data/question-bank.js`。
- `app.js`：前端刷題邏輯，包含章節篩選、錯題模式、作答判定、localStorage 紀錄。
- `index.html` + `styles.css`：頁面結構與樣式。

## 使用方式

1. 在專案根目錄執行 PowerShell：

   ```powershell
   .\scripts\extract-question-bank.ps1
   ```

2. 成功後會產生 data/question-bank.js。

3. 直接用瀏覽器開啟 index.html 即可開始刷題。

## 題庫來源

- 目前會自動抓取專案根目錄中的第一個 .docx 檔案。
- 如果要指定檔案，可執行：

   ```powershell
   .\scripts\extract-question-bank.ps1 -SourcePath ".\你的題庫.docx"
   ```

## 注意

- 若你更新題庫 Word 檔，請重新執行一次轉檔腳本。
- 「只練錯題」模式是依最近一次作答結果判定。

## 在 GitHub Codespaces 執行

1. 將此專案推到 GitHub 倉庫。
2. 在 GitHub 點選 `Code` -> `Codespaces` -> `Create codespace on main`。
3. 在 Codespaces 終端機執行：

   ```bash
   pwsh -File ./scripts/extract-question-bank.ps1
   python3 -m http.server 8080
   ```

4. 開啟 Ports 面板，點選 `8080` 的 Open in Browser。