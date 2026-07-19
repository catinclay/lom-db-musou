import Phaser from 'phaser';

/**
 * 木樁。不會反擊、不會死，只負責把傷害數字飄出來。
 * 里程碑 1 不做敵人 —— 這裡只是給傷害一個著陸點。
 */
export class Dummy extends Phaser.GameObjects.Container {
  constructor(scene, x, y) {
    super(scene, x, y);
    this.scene = scene;
    this.totalTaken = 0;

    const g = scene.add.graphics();
    g.fillStyle(0x4a3b2a, 1);
    g.fillRoundedRect(-70, -110, 140, 220, 8);
    g.lineStyle(3, 0x7a6248, 1);
    g.strokeRoundedRect(-70, -110, 140, 220, 8);
    this.add(g);

    this.add(
      scene.add
        .text(0, 0, '木\n樁', {
          fontFamily: 'sans-serif',
          fontSize: '32px',
          color: '#b09878',
          align: 'center',
        })
        .setOrigin(0.5)
    );

    this.totalText = scene.add
      .text(0, 140, '累計 0', { fontFamily: 'sans-serif', fontSize: '22px', color: '#8d7a5e' })
      .setOrigin(0.5);
    this.add(this.totalText);

    scene.add.existing(this);
  }

  /**
   * @param effect     resolveEffect 的產物：{ hits, damage, totalDamage }
   * @param multiplier 連段倍率，決定數字的大小與顏色
   *
   * 多發的牌（暗器）每一發都各飄一個數字，而不是合併成一個總和 ——
   * 「連段讓發數變多」必須用眼睛就看得出來，看到的是更多顆數字而非更大顆。
   */
  takeHit(effect, multiplier = 1, speed = 1) {
    this.totalTaken += effect.totalDamage;
    this.totalText.setText(`累計 ${this.totalTaken}`);

    const d = (ms) => Math.max(1, ms / speed);
    const size = 30 + Math.min(multiplier, 6) * 7;
    const color = multiplier >= 4 ? '#ffd75e' : multiplier >= 2 ? '#ff9d4d' : '#f0d5c0';

    for (let i = 0; i < effect.hits; i++) {
      this.scene.time.delayedCall(d(i * 70), () => this.popNumber(effect.damage, size, color, d));
    }

    if (multiplier > 1) this.popMultiplier(multiplier, size, d);

    this.scene.tweens.add({
      targets: this,
      x: this.x + Phaser.Math.Between(-8, 8),
      duration: d(60),
      yoyo: true,
      repeat: 2,
    });
  }

  popNumber(value, size, color, d) {
    const label = this.scene.add
      .text(this.x + Phaser.Math.Between(-52, 52), this.y - 40, `${value}`, {
        fontFamily: 'sans-serif',
        fontSize: `${size}px`,
        color,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(6000);

    this.scene.tweens.add({
      targets: label,
      y: label.y - 110,
      alpha: 0,
      duration: d(950),
      ease: 'Quad.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  popMultiplier(multiplier, size, d) {
    const mult = this.scene.add
      .text(this.x + 84, this.y - 62, `×${multiplier}`, {
        fontFamily: 'sans-serif',
        fontSize: `${Math.round(size * 0.72)}px`,
        color: '#ffe9a8',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(6000);

    this.scene.tweens.add({
      targets: mult,
      y: mult.y - 90,
      alpha: 0,
      duration: d(900),
      ease: 'Quad.easeOut',
      onComplete: () => mult.destroy(),
    });
  }

  reset() {
    this.totalTaken = 0;
    this.totalText.setText('累計 0');
  }
}
