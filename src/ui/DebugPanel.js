import { CARD_DEFS } from '../core/CardLibrary.js';
import { TAG } from '../core/Card.js';
import { STATUS_DEFS } from '../core/StatusLibrary.js';
import { drawChanceFor } from '../core/MergeEngine.js';

/**
 * Debug 面板。
 *
 * 刻意用原生 DOM 疊在 canvas 上，不用 Phaser 畫 —— 這是調校工具不是成品 UI，
 * 拿現成的 <input type=range> 遠比自己刻滑桿划算。
 *
 * 這東西不是裝飾：手感調校靠的就是「反覆重現同一個情境」，
 * 沒有它每次都得靠抽牌運氣去撞出想看的連鎖。
 */
const CSS = `
.dbg {
  position: fixed; top: 12px; left: 12px; z-index: 10;
  font: 13px/1.5 sans-serif; color: #d8c9a8;
  background: rgba(20,16,14,.92); border: 1px solid #4a3b2a; border-radius: 8px;
  padding: 10px 12px; width: 250px; user-select: none;
}
.dbg h3 { margin: 0 0 8px; font-size: 13px; color: #d9b45c; letter-spacing: .08em; }
.dbg hr { border: 0; border-top: 1px solid #3a2f22; margin: 9px 0; }
.dbg label { display: block; margin: 5px 0 2px; color: #9c8a70; font-size: 11px; }
.dbg select, .dbg input[type=number] {
  width: 100%; background: #2a221a; color: #d8c9a8;
  border: 1px solid #4a3b2a; border-radius: 4px; padding: 4px; font-size: 12px;
}
.dbg input[type=range] { width: 100%; }
.dbg button {
  width: 100%; margin-top: 6px; padding: 6px; cursor: pointer;
  background: #3a2f22; color: #d8c9a8; border: 1px solid #6a5540;
  border-radius: 4px; font-size: 12px;
}
.dbg button:hover { background: #4a3b2a; }
.dbg .row { display: flex; gap: 6px; }
.dbg .row > * { flex: 1; }
.dbg .chk { display: flex; align-items: center; gap: 6px; margin-top: 6px; font-size: 12px; }
.dbg .chk input { width: auto; }
.dbg .stats { font-family: monospace; font-size: 11px; color: #8d7a5e; white-space: pre; }
.dbg .hot { color: #d9b45c; }
`;

export class DebugPanel {
  constructor({ onSpawn, onDraw, onEndTurn, onRestart, onSpeed, onEnergy, onStatus }) {
    if (!document.getElementById('dbg-css')) {
      const style = document.createElement('style');
      style.id = 'dbg-css';
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    const typeMark = (t) =>
      t === 'attack' ? '攻' : t === 'defense' ? '防' : t === 'skill' ? '技' : '材';
    const options = Object.values(CARD_DEFS)
      .map((d) => `<option value="${d.defId}">${d.name}（${typeMark(d.type)}）</option>`)
      .join('');

    this.el = document.createElement('div');
    this.el.className = 'dbg';
    this.el.innerHTML = `
      <h3><span data-collapse style="cursor:pointer;user-select:none">▾</span> 沙盒工具</h3>
      <div data-body>
      <label>卡牌</label>
      <select data-def>${options}</select>
      <div class="row">
        <div>
          <label>境界</label>
          <input type="number" data-realm value="1" min="1" max="99">
        </div>
      </div>
      <div class="chk"><input type="checkbox" data-formless id="dbg-fl"><label for="dbg-fl" style="margin:0">忘形</label></div>
      <div class="row">
        <div>
          <label>附魔</label>
          <select data-ench>
            <option value="">無</option>
            ${Object.values(STATUS_DEFS)
              .map((s) => `<option value="${s.id}">${s.name}</option>`)
              .join('')}
          </select>
        </div>
        <div>
          <label>層</label>
          <input type="number" data-ench-stacks value="3" min="1" max="99">
        </div>
      </div>
      <button data-spawn>塞牌進手</button>
      <hr>
      <div class="row">
        <button data-draw>抽一張</button>
        <button data-endturn>結束回合</button>
      </div>
      <label>內力</label>
      <div class="row">
        <button data-energy-minus>− 內力</button>
        <button data-energy-plus>＋ 內力</button>
      </div>
      <label>debuff（施加 3 層到最前敵）</label>
      <div class="row">
        <select data-status>${Object.values(STATUS_DEFS)
          .map((s) => `<option value="${s.id}">${s.name}</option>`)
          .join('')}</select>
        <button data-apply-status>施加最前敵</button>
      </div>
      <button data-restart>重開戰鬥</button>
      <hr>
      <label>動畫速度 <span data-speedval>1.00×</span></label>
      <input type="range" data-speed min="0.25" max="4" step="0.05" value="1">
      <hr>
      <div class="stats" data-stats></div>
      </div>
    `;
    document.body.appendChild(this.el);

    // 收合/展開，方便看沒有工具時的整體佈局
    const body = this.el.querySelector('[data-body]');
    const arrow = this.el.querySelector('[data-collapse]');
    arrow.onclick = () => {
      const hidden = body.style.display === 'none';
      body.style.display = hidden ? '' : 'none';
      arrow.textContent = hidden ? '▾' : '▸';
      this.el.style.width = hidden ? '' : 'auto';
    };

    const $ = (sel) => this.el.querySelector(sel);
    this.defSel = $('[data-def]');
    this.realmIn = $('[data-realm]');
    this.formlessIn = $('[data-formless]');
    this.statsEl = $('[data-stats]');
    this.speedVal = $('[data-speedval]');

    $('[data-spawn]').onclick = () => {
      const enchId = $('[data-ench]').value;
      const enchStacks = Math.max(1, parseInt($('[data-ench-stacks]').value, 10) || 1);
      onSpawn(this.defSel.value, {
        realm: Math.max(1, parseInt(this.realmIn.value, 10) || 1),
        tags: this.formlessIn.checked ? [TAG.FORMLESS] : [],
        enchants: enchId ? { [enchId]: enchStacks } : {},
      });
    };
    $('[data-draw]').onclick = () => onDraw();
    $('[data-endturn]').onclick = () => onEndTurn();
    $('[data-energy-minus]').onclick = () => onEnergy(-1);
    $('[data-energy-plus]').onclick = () => onEnergy(1);
    $('[data-apply-status]').onclick = () => onStatus($('[data-status]').value);
    $('[data-restart]').onclick = () => onRestart();

    const speed = $('[data-speed]');
    speed.oninput = () => {
      const v = parseFloat(speed.value);
      this.speedVal.textContent = `${v.toFixed(2)}×`;
      onSpeed(v);
    };
  }

  update(battle) {
    const combo = battle.combo;
    const mult = combo.step > 0 ? battle.tuning.comboMultiplier(combo.step) : 0;
    // 下一次合成的補抽機率 —— 這是新的平衡樞紐，得看得到才調得動
    const nextChance = drawChanceFor(battle.mergesThisTurn + 1, battle.tuning);

    this.statsEl.innerHTML =
      `回合   ${battle.turn}\n` +
      `內力   ${battle.energy} / ${battle.tuning.energyPerTurn}\n` +
      `手牌   ${battle.hand.size}\n` +
      `牌庫   ${battle.deck.drawCount}\n` +
      `棄牌   ${battle.deck.discardCount}\n` +
      `護甲   ${battle.armor}\n` +
      `連段   ${combo.step === 0 ? '—' : `第 ${combo.step} 段`}` +
      `${mult > 1 ? ` <span class="hot">×${mult}</span>` : mult === 1 ? ' ×1' : ''}\n` +
      `前張境界 ${combo.lastRealm ?? '—'}\n` +
      `本回合合成 ${battle.mergesThisTurn} 次\n` +
      `下次補抽 <span class="hot">${Math.round(nextChance * 100)}%</span>\n` +
      `本回合傷害 ${battle.damageThisTurn}`;
  }

  destroy() {
    this.el.remove();
  }
}
