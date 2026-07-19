import Phaser from 'phaser';
import { getEnemyDef } from '../core/EnemyLibrary.js';
import { STATUS_DEFS, STATUS_IDS, activeStatuses } from '../core/StatusLibrary.js';
import { ENEMY_TEX } from './enemyTextures.js';

/**
 * 一個敵人的視覺：剪影（origin 在腳底，好站在透視的地面點上）＋ 頭上血條。
 * 縮放交給外層 container scale（透視）；死了由 FormationView 演出倒地。
 */
export class EnemySprite extends Phaser.GameObjects.Container {
  constructor(scene, enemy) {
    super(scene, 0, 0);
    this.enemy = enemy;
    this.dying = false;
    const def = getEnemyDef(enemy.defId);

    this.tint = def.tint;
    this.body = scene.add.image(0, 0, ENEMY_TEX).setOrigin(0.5, 1).setTint(def.tint);
    this.add(this.body);

    // 攻擊準備提示（telegraph）：備戰中的接觸敵人頭上亮起紅色驚嘆號
    this.warn = scene.add
      .text(0, -196, '！', { fontFamily: 'sans-serif', fontSize: '40px', color: '#ff5a3c', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setVisible(false);
    this.add(this.warn);

    this.hpBg = scene.add.rectangle(0, -162, 72, 9, 0x000000, 0.55).setOrigin(0.5);
    this.hpFill = scene.add.rectangle(-35, -162, 70, 7, 0x8fd06a).setOrigin(0, 0.5);
    this.add(this.hpBg);
    this.add(this.hpFill);

    // debuff 小點：每種狀態一顆，血條上方一排；層數 > 1 時在點上疊層數
    this.statusPips = STATUS_IDS.map(() => {
      const box = scene.add.rectangle(0, -178, 14, 14, 0xffffff).setVisible(false);
      const txt = scene.add
        .text(0, -178, '', { fontFamily: 'sans-serif', fontSize: '10px', color: '#14100c', fontStyle: 'bold' })
        .setOrigin(0.5)
        .setVisible(false);
      this.add(box);
      this.add(txt);
      return { box, txt };
    });

    this.setSize(80, 150);
    scene.add.existing(this);
    this.refresh();
  }

  refresh() {
    const r = Math.max(0, this.enemy.hp / this.enemy.maxHp);
    this.hpFill.setSize(Math.max(0.001, 70 * r), 7); // setSize 才會重建幾何
    this.hpFill.fillColor = r > 0.5 ? 0x8fd06a : r > 0.25 ? 0xd9b45c : 0xc4583f;
    this.hpFill.setVisible(r > 0 && r < 1);
    this.hpBg.setVisible(r > 0 && r < 1);

    // 備戰：亮紅驚嘆號、身體轉紅熱
    const prep = this.enemy.prepared;
    this.warn.setVisible(prep);
    this.body.setTint(prep ? 0xff5a3c : this.tint);

    const active = activeStatuses(this.enemy);
    this.statusPips.forEach((pip, i) => {
      if (i < active.length) {
        const id = active[i];
        const stacks = this.enemy.statuses[id] ?? 0;
        const x = (i - (active.length - 1) / 2) * 18; // 置中排列
        pip.box.fillColor = STATUS_DEFS[id].color;
        pip.box.x = x;
        pip.box.setVisible(true);
        pip.txt.x = x;
        pip.txt.setText(stacks > 1 ? `${stacks}` : '');
        pip.txt.setVisible(stacks > 1);
      } else {
        pip.box.setVisible(false);
        pip.txt.setVisible(false);
      }
    });
  }
}
