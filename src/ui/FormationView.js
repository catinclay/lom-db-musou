import Phaser from 'phaser';
import { project, depthFor } from './perspective.js';
import { EnemySprite } from './EnemySprite.js';
import { STATUS_DEFS } from '../core/StatusLibrary.js';

/**
 * 敵陣的視覺層：把 core 的 Formation 投影成肩後視角的一群 sprite。
 *
 * 兩個入口：
 *   sync()      全量對齊到透視位置（生成缺的、補間活的、清掉沒了的）—— 前進時用。
 *   flashAndPop() 播一次攻擊的命中：閃光、跳傷害數字、把被打死的演出倒地。
 *
 * 職責分工：位置由 sync 管，命中/死亡的「演出」由 flashAndPop 管，兩者都不碰 core 狀態。
 */
export class FormationView {
  constructor(scene) {
    this.scene = scene;
    this.sprites = new Map(); // uid -> EnemySprite
    this.speed = 1; // 跟手牌共用的動畫速度倍率（由場景設定）
  }

  d(ms) {
    return Math.max(1, ms / this.speed);
  }

  /** 全量對齊：活敵人補間到透視位置（rank/lane），死掉/清場的移除 */
  sync(formation, { animate = true, duration = 300 } = {}) {
    const want = new Set();

    for (const e of formation.enemies) {
      if (!e.alive) continue;
      want.add(e.uid);
      const p = project(e.rank, e.lane, formation.lanes);

      let s = this.sprites.get(e.uid);
      if (!s) {
        s = new EnemySprite(this.scene, e);
        s.setPosition(p.x, p.y);
        s.setScale(p.scale);
        s.setAlpha(0);
        this.sprites.set(e.uid, s);
      }
      s.enemy = e;
      s.refresh();
      s.setDepth(depthFor(e.rank) + e.lane * 0.1);

      if (animate) {
        this.scene.tweens.add({
          targets: s,
          x: p.x,
          y: p.y,
          scaleX: p.scale,
          scaleY: p.scale,
          alpha: 1,
          duration: this.d(duration),
          ease: 'Cubic.easeOut',
        });
      } else {
        s.setPosition(p.x, p.y);
        s.setScale(p.scale);
        s.setAlpha(1);
      }
    }

    // 不在陣中的（被清掉的殘留）淡出
    for (const uid of [...this.sprites.keys()]) {
      if (!want.has(uid)) this.remove(uid);
    }
  }

  /**
   * 播一次攻擊命中：閃光 + 傷害數字；被打死的倒地。
   * 連段會分多波（h.wave），每波整體錯開，波內再逐一錯開 ——
   * 與 playHitFlourish 的分波劈痕對齊，讀起來就是「劈砍兩次」。
   */
  flashAndPop(hits) {
    const within = {}; // 每波內已排了幾個，用來錯開波內時序
    hits.forEach((h) => {
      const s = this.sprites.get(h.uid);
      if (!s) return;
      const w = h.wave ?? 0;
      const idx = (within[w] = (within[w] ?? -1) + 1);
      const delay = w * 150 + idx * 45;

      this.scene.time.delayedCall(this.d(delay), () => {
        if (!s.active) return;
        this.scene.tweens.add({
          targets: s.body,
          alpha: 0.35,
          duration: this.d(70),
          yoyo: true,
        });
        this.popDamage(s, h.damage);
        s.enemy.alive ? s.refresh() : this.fall(h.uid);
      });
    });
  }

  /**
   * 演一次異常狀態的跳動（中毒滴傷、燃燒引爆/疊層）。
   * hits 依狀態上色跳傷害數字；changed 是只變層數沒受傷的（燃燒疊層/衰減），只刷狀態點。
   * 跟攻擊命中共用 popDamage/fall，但顏色與節奏不同，讀起來是「毒/火在慢慢發作」。
   */
  playStatusTick(result) {
    result.hits.forEach((h, i) => {
      const s = this.sprites.get(h.uid);
      if (!s) return;
      const color = STATUS_DEFS[h.status]?.color ?? 0xffffff;
      this.scene.time.delayedCall(this.d(i * 70), () => {
        if (!s.active) return;
        this.popDamage(s, h.damage, color);
        if (!s.enemy.alive) {
          this.fall(h.uid);
          return;
        }
        // 染上狀態色一下，再 refresh 還原（也順便更新血條/層數）
        s.body.setTint(color);
        this.scene.time.delayedCall(this.d(110), () => s.active && s.refresh());
      });
    });

    // 只變層數、沒受傷的（燃燒越燒越旺 / 衰減）：刷新狀態點讓層數數字更新
    for (const uid of result.changed) {
      const s = this.sprites.get(uid);
      if (s && s.active && !s.dying) s.refresh();
    }
  }

  popDamage(s, value, color = 0xffe1b0) {
    if (!(value > 0)) return; // 純狀態卡（毒霧/火藥）直傷為 0 —— 別跳「0」擾亂畫面
    const t = this.scene.add
      .text(s.x + Phaser.Math.Between(-14, 14), s.y - 150 * s.scaleY, `${value}`, {
        fontFamily: 'sans-serif',
        fontSize: `${Math.round(26 * Math.min(1, s.scaleY + 0.3))}px`,
        color: `#${color.toString(16).padStart(6, '0')}`,
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(6000);

    this.scene.tweens.add({
      targets: t,
      y: t.y - 70,
      alpha: 0,
      duration: this.d(750),
      ease: 'Quad.easeOut',
      onComplete: () => t.destroy(),
    });
  }

  /** 倒地：翻倒、下沉、淡出後銷毀 */
  fall(uid) {
    const s = this.sprites.get(uid);
    if (!s || s.dying) return;
    s.dying = true;
    this.sprites.delete(uid);
    this.scene.tweens.add({
      targets: s,
      y: s.y + 30 * s.scaleY,
      angle: Phaser.Math.Between(-70, 70),
      alpha: 0,
      duration: this.d(280),
      ease: 'Cubic.easeIn',
      onComplete: () => s.destroy(),
    });
  }

  remove(uid) {
    const s = this.sprites.get(uid);
    if (!s || s.dying) return;
    this.sprites.delete(uid);
    this.scene.tweens.add({
      targets: s,
      alpha: 0,
      duration: this.d(200),
      onComplete: () => s.destroy(),
    });
  }

  /**
   * 依招式種類播一道打擊特效：
   *   近戰（lane/row/single）—— 一道劈痕連過所有命中點（貫是縱、橫劈是橫，天然對）。
   *   遠程（scatter/multi/random）—— 暗器由主角方向逐一飛向命中的敵人。
   */
  playHitFlourish(target, hits) {
    const toPts = (arr) =>
      arr
        .map((h) => this.sprites.get(h.uid))
        .filter(Boolean)
        .map((s) => ({ x: s.x, y: s.y - 70 * s.scaleY }));

    // 遠程（暗器）：一根一根飛，不分波
    if (target === 'scatter' || target === 'multi' || target === 'random') {
      toPts(hits).forEach((p, i) => this.scene.time.delayedCall(this.d(i * 45), () => this.dart(p)));
      return;
    }

    // 範圍型（毒霧/火藥）：不是一道劈痕，而是一片壟罩範圍的爆/霧
    const area = target === 'blast' || target === 'nearRows';

    // 連段會多波（h.wave），每波各演一次、依序錯開
    const waves = new Map();
    for (const h of hits) {
      const w = h.wave ?? 0;
      if (!waves.has(w)) waves.set(w, []);
      waves.get(w).push(h);
    }
    [...waves.keys()]
      .sort((a, b) => a - b)
      .forEach((w, idx) => {
        const pts = toPts(waves.get(w));
        if (!pts.length) return;
        this.scene.time.delayedCall(this.d(idx * 150), () => {
          if (target === 'blast') this.areaBurst(pts, 0xffa040, true);
          else if (target === 'nearRows') this.areaBurst(pts, 0x8fd06a, false);
          else this.slash(pts);
        });
      });
  }

  /**
   * 範圍招式的壟罩特效：火藥＝中心炸開一圈擴張的環；毒霧＝一片瀰漫的霧淡入淡出。
   * @param explode true＝爆破環（火藥），false＝壟罩霧（毒霧）
   */
  areaBurst(pts, color, explode) {
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const minY = Math.min(...pts.map((p) => p.y));
    const maxY = Math.max(...pts.map((p) => p.y));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    if (explode) {
      const r = Math.max(40, Math.hypot(maxX - minX, maxY - minY) / 2);
      const g = this.scene.add.graphics().setDepth(6500).setPosition(cx, cy);
      g.fillStyle(color, 0.4);
      g.fillCircle(0, 0, r * 0.45);
      g.lineStyle(7, 0xfff0d6, 0.95);
      g.strokeCircle(0, 0, r * 0.45);
      this.scene.tweens.add({
        targets: g,
        scaleX: 2.4,
        scaleY: 2.4,
        alpha: 0,
        duration: this.d(340),
        ease: 'Cubic.easeOut',
        onComplete: () => g.destroy(),
      });
    } else {
      const pad = 46;
      const g = this.scene.add.graphics().setDepth(6400).setAlpha(0);
      g.fillStyle(color, 0.3);
      g.fillRoundedRect(minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2, 34);
      this.scene.tweens.add({
        targets: g,
        alpha: 1,
        duration: this.d(180),
        yoyo: true,
        hold: this.d(160),
        ease: 'Sine.easeOut',
        onComplete: () => g.destroy(),
      });
    }
  }

  /**
   * 崩山（擊退）的分波演出：打一波 → 推一波 → 再打 → 再推。
   * waveLayouts[w] 是該波擊退後的全體位置快照，逐波 slide 過去，跟傷害交錯，
   * 不像一般攻擊那樣「全部打完才一次推」。
   */
  playKnockbackWaves(hits, waveLayouts, formation) {
    const WAVE = 300; // 每波間隔拉大，看得清「砸下→震退」
    const byWave = new Map();
    for (const h of hits) {
      const w = h.wave ?? 0;
      if (!byWave.has(w)) byWave.set(w, []);
      byWave.get(w).push(h);
    }
    const order = [...byWave.keys()].sort((a, b) => a - b);

    order.forEach((w, idx) => {
      const group = byWave.get(w);
      const t = idx * WAVE;

      // 砸下：衝擊弧 + 閃光 + 傷害數字
      this.scene.time.delayedCall(this.d(t), () => {
        const pts = group
          .map((h) => this.sprites.get(h.uid))
          .filter(Boolean)
          .map((s) => ({ x: s.x, y: s.y - 70 * s.scaleY }));
        if (pts.length) this.shockwave(pts);
        group.forEach((h, i) =>
          this.scene.time.delayedCall(this.d(i * 40), () => {
            const s = this.sprites.get(h.uid);
            if (!s || !s.active) return;
            this.scene.tweens.add({ targets: s.body, alpha: 0.35, duration: this.d(70), yoyo: true });
            this.popDamage(s, h.damage);
            s.enemy.alive ? s.refresh() : this.fall(h.uid);
          })
        );
      });

      // 震退：這波推完的位置快照，稍晚於傷害 slide 過去（帶一點過衝＝被撞飛）
      const layout = waveLayouts[w];
      if (layout) {
        this.scene.time.delayedCall(this.d(t + 120), () => this.applyLayout(layout, formation.lanes));
      }
    });

    // 收尾：全量對齊（移除死者、補位對齊到 core 權威狀態）
    this.scene.time.delayedCall(this.d(order.length * WAVE + 160), () => this.sync(formation));
  }

  /** 把一張位置快照 [{uid,rank,lane}] slide 到透視位置（不碰 core 狀態） */
  applyLayout(snapshot, lanes) {
    for (const { uid, rank, lane } of snapshot) {
      const s = this.sprites.get(uid);
      if (!s || s.dying) continue;
      const p = project(rank, lane, lanes);
      s.setDepth(depthFor(rank) + lane * 0.1);
      this.scene.tweens.add({
        targets: s,
        x: p.x,
        y: p.y,
        scaleX: p.scale,
        scaleY: p.scale,
        duration: this.d(170),
        ease: 'Back.easeOut', // 過衝一下，像被撞得往後踉蹌
      });
    }
  }

  /** 擊退的衝擊特效：一道厚重的弧橫過命中點，往後（上）推開並淡出 */
  shockwave(pts) {
    const minX = Math.min(...pts.map((p) => p.x));
    const maxX = Math.max(...pts.map((p) => p.x));
    const y = Math.min(...pts.map((p) => p.y));
    const midX = (minX + maxX) / 2;

    const g = this.scene.add.graphics().setDepth(6500);
    // 厚重的橫向衝擊弧（往上拱＝往場景深處推）
    g.lineStyle(13, 0xffcf9a, 0.95);
    g.beginPath();
    g.moveTo(minX - 34, y + 16);
    g.lineTo(midX, y - 24);
    g.lineTo(maxX + 34, y + 16);
    g.strokePath();
    // 幾道往後的推力箭簇
    g.lineStyle(5, 0xfff0d6, 0.9);
    for (let x = minX; x <= maxX; x += Math.max(70, (maxX - minX) / 3 || 70)) {
      g.beginPath();
      g.moveTo(x - 16, y + 6);
      g.lineTo(x, y - 16);
      g.lineTo(x + 16, y + 6);
      g.strokePath();
    }

    this.scene.tweens.add({
      targets: g,
      y: g.y - 46, // 整體往後（上）衝
      alpha: 0,
      scaleY: 0.6,
      duration: this.d(300),
      ease: 'Cubic.easeOut',
      onComplete: () => g.destroy(),
    });
  }

  slash(pts) {
    const g = this.scene.add.graphics().setDepth(6500);
    g.lineStyle(7, 0xfff0d0, 0.95);
    g.beginPath();
    if (pts.length === 1) {
      const p = pts[0]; // 單點畫一道斜劈
      g.moveTo(p.x - 34, p.y - 26);
      g.lineTo(p.x + 34, p.y + 26);
    } else {
      g.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
    }
    g.strokePath();
    this.scene.tweens.add({
      targets: g,
      alpha: 0,
      duration: this.d(220),
      ease: 'Cubic.easeIn',
      onComplete: () => g.destroy(),
    });
  }

  dart(p) {
    const o = this.attackOrigin ?? { x: 250, y: 720 };
    const d = this.scene.add.rectangle(o.x, o.y, 18, 4, 0xf5e6c8).setDepth(6500);
    d.rotation = Math.atan2(p.y - o.y, p.x - o.x);
    this.scene.tweens.add({
      targets: d,
      x: p.x,
      y: p.y,
      duration: this.d(150),
      ease: 'Quad.easeIn',
      onComplete: () => d.destroy(),
    });
  }

  /** 只重畫每個敵人的血條/狀態，不動位置（施加 debuff 後刷新用） */
  refresh() {
    for (const s of this.sprites.values()) s.refresh();
  }

  clear() {
    for (const s of this.sprites.values()) s.destroy();
    this.sprites.clear();
  }
}
