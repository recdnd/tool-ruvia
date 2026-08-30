# Root JSON Schema (Ruvia)

Root = 一份完整 Ruvia document JSON。

## 檔案副檔名

- `.root` is a Ruvia Root file.
- It is JSON content with the `.root` extension.
- A `.root` file contains the full root: document, menus, knots, edges, layout, and metadata.

## 必要欄位

- `spec: "ruvia-doc/0.1"`
- `document`
- `hierarchy`
- `menus`
- `roots`
- `knots`
- `edges`
- `ui`
- `files`

## 語義

- `menus` = 左下 menu list 的 tree graphs
- `menu.knotIds` = 該 tree 使用的 knots
- `menu.edgeIds` = 該 tree 使用的 edges
- `ui.activeMenuId` = 初始顯示的 tree

## 相容性

- 舊資料仍可能出現 `packs`，Ruvia 匯入時會自動轉為 `roots`。
