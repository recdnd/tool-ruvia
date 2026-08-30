# Tray 模板按鈕規格（`+`）

對應選擇器：`.template-tray` 內的 `.template-btn`（內容由 `script.js` 的 `renderTemplates()` 產生，目前僅一顆 `+`）。

## Tray 欄整體

- 右欄寬度：`grid-template-columns` 第二欄為 **`calc(468px * 0.7)`**（在先前加寬後再縮至 70%）。
- 標題、內距、按鈕字級／邊框／圓角隨同一比例約 **0.7** 調整（見 `style.css` 中 `.tray-pane`、`.tray-title`、`.template-tray`、`.template-btn`）。

## 形狀與邊框（按鈕）

- **圓角矩形外框**：`border-radius: 3px`（緊貼字元外邊）。
- **邊線**：`1px solid var(--line-soft)`。
- **內距**：`padding: 0`（**上下左右皆為 0**）。
- **尺寸來源**：`width: auto; height: auto;`（不使用固定寬高）。

## 背景

- **無背景色**：`background: transparent`；hover／focus 仍透明，只改字色與邊框色。

## 字體

- `font-family: var(--font-ui)`。
- `font-size: 8px`。
- `line-height: 11px`（保持字元可讀，邊框仍貼近字元）。

## 禁止回歸項（防止再次被改壞）

- 不要設固定 `width/height`（例如 10px / 13px / 20px）。
- 不要加 `padding`。
- 不要改回厚邊框（`2px`）或大圓角卡片感。
- 不要把 `.template-btn` 與 tray knot 尺寸變數綁死。

## 實作檔案

- 樣式：`style.css`。
- 行為：`script.js` 中 `renderTemplates()`。
