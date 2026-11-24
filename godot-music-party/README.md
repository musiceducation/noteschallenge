# 🎪 Godot 4 糖豆人音樂派對世界（`godot-music-party`）

這個資料夾是為 **Godot 4.3+** 建立的標準 3D 專案骨架，已預先配置好 **GL Compatibility** 與 **Single-Threaded Web Export**（完全相容 GitHub Pages 與學校 iPad Safari，不需要 COOP/COEP Header）。

## 快速啟動
1. 打開 Mac 上的 **Godot 4** → 點選 **匯入（Import）** → 選取 `/Users/kenneth/Desktop/notes/godot-music-party/project.godot`。
2. 按右上角 **▶（或 `F5`）** 即可直接試玩：
   - `WASD` / 方向鍵跑動、`Space` 跳躍、`Shift` 飛撲、滑鼠拖曳 360° 旋轉視角。
   - 按右上角 **「🎪 開始地磚賽」** 啟動 3×3 音符地板生存戰。

## 換上你的 3D `.glb` 角色模型
1. 將 Tripo AI / Meshy 生成的 `shiba-skier.glb` 或 `shiba-pianist.glb` 直接拖入 `models/` 資料夾。
2. 打開 `scenes/MainWorld.tscn`，把 `.glb` 拖到 `PlayerBean/Visual` 底下，再把原本的佔位 `BeanMesh` 隱藏即可。

## 匯出到你的網站（GitHub Pages）
1. 在 Godot 選單按 **專案 → 匯出（Project → Export）**。
2. 選取已預先建好的 **`Web (GitHub Pages / iPad Safari)`**（已關閉 `Thread Support`）。
3. 點擊匯出至 `../godot-party/index.html`（若首次匯出，依提示下載 Godot Web Export Template 即可）。
4. 匯出後即可在大廳加一張卡片直接連到 `godot-party/index.html`，遊戲會自動透過 `JavaScriptBridge` 讀取 `localStorage` 的學生姓名並儲存最高分。
