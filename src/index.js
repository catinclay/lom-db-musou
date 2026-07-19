import Phaser from 'phaser';
import { BaseScene } from './scenes/BaseScene.js';
import { RunMapScene } from './scenes/RunMapScene.js';
import { BattleScene } from './scenes/BattleScene.js';
import { ShopScene } from './scenes/ShopScene.js';
import { SlotScene } from './scenes/SlotScene.js';
import { EventScene } from './scenes/EventScene.js';

// 執行期錯誤（Phaser 場景裡 throw 不會冒到 build，只會在 console）浮到畫面上，
// 開發時一眼看到，而不是對著半殘的畫面猜。
window.addEventListener('error', (e) => {
  document.title = 'ERR: ' + (e.error?.message || e.message);
  const box = document.getElementById('err') || document.body.appendChild(document.createElement('pre'));
  box.id = 'err';
  box.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99;margin:0;padding:8px;background:#3a0f0f;color:#ffb3a0;font:12px monospace;white-space:pre-wrap;';
  box.textContent = (e.error?.stack || e.message || 'unknown error').slice(0, 800);
});
window.addEventListener('unhandledrejection', (e) => {
  document.title = 'REJECT: ' + (e.reason?.message || e.reason);
});

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#14100e',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1600,
    height: 900,
  },
  scene: [BaseScene, RunMapScene, BattleScene, ShopScene, SlotScene, EventScene],
};

new Phaser.Game(config);
