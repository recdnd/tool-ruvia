# Ruvia AI Tree JSON Schema Guide

請把文件內容轉換成 **Ruvia 可直接 import 的 JSON**，並遵守以下規範。

## 1) 基本格式

- `spec` 必須是 `"ruvia-doc/0.1"`。
- 一份文件對應一張 tree graph，且在 JSON 中對應一個 `menu`。
- 請輸出完整 document（包含 `document`、`hierarchy`、`menus`、`roots`、`knots`、`edges`、`ui`、`files`）。

## 2) Tree 與 menu 對應

- `menu.name` = 文件標題或簡短主題。
- `menu.knotIds` = 這張樹包含的所有 knot id。
- `menu.edgeIds` = 這張樹包含的所有 edge id。
- `ui.activeMenuId` 指向該 `menu.id`。

## 3) 節點（knots）規則

- 文件主要概念生成 `knots`。
- `knot.title` 控制在 12 字內。
- `knot.content.text` 放 1-3 行摘要。
- 每個 knot 需有唯一 `id`（建議 `k1`, `k2`, `k3`...）。

## 4) 邊（edges）規則

- 層級/因果/包含關係都可用 `edges` 表示。
- `edge.relation` 一律使用 `"link"`。
- `edge.from`、`edge.to` 必須引用既有 knot id。

## 5) 版面（layout）規則

`ui.layout.knots[<knotId>]` 每個 knot 都必須存在，且至少包含：

- `x`
- `y`
- `width`
- `height`
- `zone`
- `zIndex`

預設建議：

- `zone` = `"canvas"`
- 橫向排版：root `x = 80`、第二層 `x = 280`、第三層 `x = 480`
- 同層節點 `y` 間距 `72`
- `width` 可用 `132`
- `height` 可用 `42`
- `zIndex` 由 1 遞增

## 6) 最小可用輸出範例（結構示意）

```json
{
  "spec": "ruvia-doc/0.1",
  "document": { "id": "doc_1", "title": "Demo", "createdAt": "2026-01-01T00:00:00.000Z", "updatedAt": "2026-01-01T00:00:00.000Z", "meta": {} },
  "hierarchy": { "folders": [{ "id": "f1", "name": "root", "menuIds": ["m1"] }] },
  "menus": [{ "id": "m1", "name": "文件主題", "knotIds": ["k1", "k2"], "edgeIds": ["e1"], "meta": {} }],
  "roots": [],
  "knots": [
    { "id": "k1", "title": "主題", "content": { "text": "摘要 1" }, "meta": {} },
    { "id": "k2", "title": "子概念", "content": { "text": "摘要 2" }, "meta": {} }
  ],
  "edges": [
    { "id": "e1", "from": "k1", "to": "k2", "relation": "link", "meta": {} }
  ],
  "ui": {
    "activeMenuId": "m1",
    "layout": {
      "knots": {
        "k1": { "x": 80, "y": 80, "width": 132, "height": 42, "zone": "canvas", "zIndex": 1 },
        "k2": { "x": 280, "y": 152, "width": 132, "height": 42, "zone": "canvas", "zIndex": 2 }
      }
    }
  },
  "files": { "menuText": "", "structureText": "" }
}
```

## 7) 注意事項

- 只要符合 Ruvia schema 與上述欄位規範，即可被現有 Import 流程載入。
- 若你不確定欄位，優先保持欄位完整，不要省略 `ui.layout.knots`。
