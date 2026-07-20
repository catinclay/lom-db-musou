import Phaser from 'phaser';
import { ENEMY_BUFF_DEFS, activeEnemyBuffs, getEnemyDef } from '../core/EnemyLibrary.js';
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
    this.isBoss = def.isBoss === true;
    this.body = scene.add.image(0, 0, ENEMY_TEX).setOrigin(0.5, 1).setTint(def.tint);
    if (this.isBoss) this.body.setScale(1.6); // 精英/魔王剪影更大,凸顯是特殊敵人
    this.add(this.body);

    // 攻擊意圖：準備中黃！＋剩餘回合；完成後紅！，代表下回合攻擊。
    this.warn = scene.add
      .text(0, -214, '！', { fontFamily: 'sans-serif', fontSize: '38px', color: '#f0c94f', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setVisible(false);
    this.add(this.warn);
    this.warnCount = scene.add
      .text(21, -210, '', { fontFamily: 'sans-serif', fontSize: '20px', color: '#f0c94f', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setVisible(false);
    this.add(this.warnCount);

    // 距離外的特殊行動才顯示意圖；單純移動不畫，避免滿場箭頭。
    this.specialWarn = scene.add
      .text(0, -214, '◆', { fontFamily: 'sans-serif', fontSize: '30px', color: '#c9a8e0', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setVisible(false);
    this.add(this.specialWarn);
    this.specialLabel = scene.add
      .text(0, -190, '扎馬', { fontFamily: 'sans-serif', fontSize: '13px', color: '#dec9ed', fontStyle: 'bold' })
      .setOrigin(0.5)
      .setVisible(false);
    this.add(this.specialLabel);

    this.hpBg = scene.add.rectangle(0, -162, 72, 9, 0x000000, 0.55).setOrigin(0.5);
    this.hpFill = scene.add.rectangle(-35, -162, 70, 7, 0x8fd06a).setOrigin(0, 0.5);
    this.add(this.hpBg);
    this.add(this.hpFill);

    // buff/debuff 小點共用一排；層數 > 1 時在點上疊層數。
    this.statusPips = [...STATUS_IDS, ...Object.keys(ENEMY_BUFF_DEFS)].map(() => {
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
    // 王的血量看畫面正上方的大血條,頭頂小血條隱藏免得重複。
    this.hpFill.setVisible(!this.isBoss && r > 0 && r < 1);
    this.hpBg.setVisible(!this.isBoss && r > 0 && r < 1);

    const charging = this.enemy.attackState === 'charging';
    const ready = this.enemy.attackState === 'ready';
    this.warn.setColor(ready ? '#ff5a3c' : '#f0c94f').setVisible(charging || ready);
    this.warnCount
      .setColor('#f0c94f')
      .setText(charging ? `${this.enemy.prepareRemaining}` : '')
      .setVisible(charging);
    this.body.setTint(ready ? 0xff5a3c : this.tint);

    const intentId = this.enemy.rank > 0 ? this.enemy.intent?.id : null;
    const intentLabel = { brace: '扎馬', summon: '召喚', projectile: '施法', retreat: '後退' }[intentId];
    this.specialWarn.setVisible(Boolean(intentLabel));
    this.specialLabel.setText(intentLabel ?? '').setVisible(Boolean(intentLabel));

    const active = [
      ...activeStatuses(this.enemy).map((id) => ({ id, stacks: this.enemy.statuses[id], def: STATUS_DEFS[id] })),
      ...activeEnemyBuffs(this.enemy).map((id) => ({ id, stacks: this.enemy.buffs[id], def: ENEMY_BUFF_DEFS[id] })),
    ];
    this.statusPips.forEach((pip, i) => {
      if (i < active.length) {
        const { stacks, def } = active[i];
        const x = (i - (active.length - 1) / 2) * 18; // 置中排列
        pip.box.fillColor = def.color;
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
