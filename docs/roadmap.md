# 里程碑進度與下一步

> 機制細節見 [systems/](systems/)。數值全在 `src/config/tuning.js`。

## 里程碑狀態

| 里程碑 | 內容 | 狀態 |
|--------|------|------|
| 1 | 連鎖合成 ＋ 劇本/動畫分層基礎（含已停用的木樁 `ui/Dummy.js`） | ✅ 成形 |
| 2 | 割草無雙：格狀敵陣、招式鎖定、擊退、異常狀態 DoT、附魔 | ✅ 成形 |
| 3 | 「江湖遠征」run 結構，Phase 1–5 | ✅ 全上線 |

## 里程碑 3「江湖遠征」— Phase 1–5 全上線

一天一輪輪「三選一」抽事件、入夜打尾王，殺戮尖塔式節奏推進到最終魔王；一局結束回門派據點花威望做永久升級。

- **Phase 1**：骨架 run loop（`RunState`＋`RunMapScene`＋有限戰鬥）。
- **Phase 2**：拉霸（`core/slot.js`＋`SlotScene`）、客棧商店（`ShopScene`）、奇遇（`EventLibrary`＋`EventScene`）。
- **Phase 3**：遺物·秘籍（`RelicLibrary`）。
- **Phase 4**：主角屬性·境界上限（`RunState.attrs`）。
- **Phase 5**：跨 run 門派據點 meta（`MetaState`＋`ui/metaStore.js`＋`BaseScene`）。

詳細分層與流程見 [systems/run.md](systems/run.md)。

## 接下來

**內容擴充與平衡**，非新架構：更多卡 / 敵 / 遺物 / 奇遇 / 據點升級，以及整體試玩調平衡。數值都在 `tuning`。
