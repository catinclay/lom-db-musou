# CLAUDE.md — 專案指南索引

> 這是 index。真正的內容都在 `docs/`——一處真相，所有 agent 共用。
> **`AGENTS.md` 是這份檔的逐字副本**（給會自動載入 `AGENTS.md` 的其他 agent CLI）；改這裡時兩份要一起改。

活俠傳同人遊戲 — Roguelike 牌組構築 ＋ 割草無雙。核心戰鬥（階級合成、境界／連擊、忘形雙模式、割草敵陣）已成形；
**里程碑 3「江湖遠征」run 結構 Phase 1–5 全上線**（run loop、拉霸、拆分服務設施、遺物、奇遇、主角屬性、跨 run 據點 meta）。
一天分成數個時辰，由選項導演編排保有安穩去處的「三選一」，入夜打尾王並推進到最終魔王；一局結束回門派據點花威望做永久升級。
開機先進主題首頁，再進七設施據點；戰鬥已有逐波連段、敵人攻擊準備／特殊意圖、不動與可選叫陣補充波。
整局流程由純 JavaScript `GameSession` 統一驅動，Phaser Scene 只呈現結果，也可在 Node 中無頭高速遊玩。

---

## 鐵律（動 code 前先記住，細節見 `docs/conventions.md`）

1. **`src/core/` 零 Phaser 依賴**——可在 Node 測試裡跑；對外只發 `EVENT.*` 事件或回傳 transcript（劇本）。
2. **卡牌實例不可變**（合成產出新 uid）；**邏輯一次算完、UI 只重播**，別讓動畫回頭改 core 狀態。
3. **tween 一律走 `ui/tweens.js` 的 `tweenTo`/`stopTweensOf`**——別用 Phaser 原生 `killTweensOf`（會鎖死畫面）。
4. **所有平衡/手感數值的唯一來源是 `src/config/tuning.js`**，禁止把數字散落到別處。
5. **整局流程只走 `core/GameSession.js` 的 action**——Scene 不直接串規則或決定下一個流程；UI 只讀狀態、送 action、重播結果。

---

## 文件索引

| 文件 | 何時開它 |
|------|---------|
| [docs/architecture.md](docs/architecture.md) | 先讀。core/UI 分層 ＋ 劇本（transcript）骨架、一次合成的資料流。 |
| [docs/file-map.md](docs/file-map.md) | 「我想改的東西在哪個檔案」——目錄地圖 ＋ 每個檔的責任速查表。 |
| [docs/changing-things.md](docs/changing-things.md) | 「我想改 X，去哪裡」對照表（改某件具體事情的入口）。 |
| [docs/conventions.md](docs/conventions.md) | 關鍵不變量與慣例（改動別踩的雷）＋ 指令與測試。 |
| [docs/glossary.md](docs/glossary.md) | 術語表（劇本、境界、連段、忘形、附魔、run、meta…）。 |
| [docs/roadmap.md](docs/roadmap.md) | 里程碑進度與下一步。 |
| [docs/systems/merge.md](docs/systems/merge.md) | 階級合成 ＋ 忘形雙模式（含卡自身狀態效果）。 |
| [docs/systems/combat.md](docs/systems/combat.md) | 割草戰鬥：敵陣、招式鎖定、擊退、回合流程。 |
| [docs/systems/combo.md](docs/systems/combo.md) | 境界／連擊怎麼累積與加成（所有牌共用連擊＝施放次數）。 |
| [docs/systems/status.md](docs/systems/status.md) | 異常狀態（中毒/燃燒 DoT）。 |
| [docs/systems/run.md](docs/systems/run.md) | 江湖遠征 run 結構（RunState/MetaState、三選一、尾王、遺物、屬性）。 |
| [docs/systems/headless.md](docs/systems/headless.md) | GameSession action API、無頭 AI 遊玩、phase 與同步結算邊界。 |

---

## 維護慣例

- 動到架構或慣例，順手更新對應的 `docs/` 檔——別讓 index 與內容脫節。
- 這份 `CLAUDE.md` 與 `AGENTS.md` 是同一份 index 的兩個副本，改一份就同步另一份（內容恆等）。
- 平衡/手感數字只動 `src/config/tuning.js`。
