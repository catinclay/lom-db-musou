/** 共用的主題選單背景與按鈕。只處理 Phaser 視覺，不承載遊戲狀態。 */

export function drawMenuBackdrop(scene, { moonX = 1240, moonY = 120, accent = 0xd9b45c } = {}) {
  scene.cameras.main.setBackgroundColor('#0d1115');
  scene.add.rectangle(800, 450, 1600, 900, 0x0d1115).setDepth(-20);
  scene.add.circle(moonX, moonY, 74, 0xe9dfbd, 0.88).setDepth(-18);
  scene.add.circle(moonX - 20, moonY - 12, 68, 0xc8c5aa, 0.18).setDepth(-17);

  const ink = scene.add.graphics().setDepth(-16);
  ink.fillStyle(0x18242a, 1);
  ink.fillPoints([
    { x: 0, y: 430 }, { x: 220, y: 250 }, { x: 390, y: 405 }, { x: 610, y: 210 },
    { x: 820, y: 410 }, { x: 1060, y: 265 }, { x: 1290, y: 405 }, { x: 1510, y: 250 },
    { x: 1600, y: 340 }, { x: 1600, y: 900 }, { x: 0, y: 900 },
  ], true);
  ink.fillStyle(0x11191d, 1);
  ink.fillPoints([
    { x: 0, y: 560 }, { x: 310, y: 390 }, { x: 520, y: 545 }, { x: 790, y: 350 },
    { x: 1050, y: 540 }, { x: 1330, y: 370 }, { x: 1600, y: 545 },
    { x: 1600, y: 900 }, { x: 0, y: 900 },
  ], true);
  ink.fillStyle(0x0a0e10, 1);
  ink.fillRect(0, 720, 1600, 180);

  scene.add.rectangle(800, 710, 1600, 2, accent, 0.2).setDepth(-14);
  scene.add.rectangle(800, 88, 1220, 1, accent, 0.25).setDepth(-14);
}

export function makeMenuButton(scene, {
  x,
  y,
  w,
  h,
  label,
  sub = '',
  fill = 0x22211e,
  border = 0xd9b45c,
  onClick,
  fontSize = 24,
}) {
  const rect = scene.add
    .rectangle(x, y, w, h, fill, 0.96)
    .setStrokeStyle(3, border)
    .setInteractive({ useHandCursor: true });
  const labelY = sub ? y - 15 : y;
  const txt = scene.add
    .text(x, labelY, label, { fontFamily: 'sans-serif', fontSize: `${fontSize}px`, color: '#f5e6c8', fontStyle: 'bold' })
    .setOrigin(0.5);
  const subTxt = sub
    ? scene.add
        .text(x, y + 25, sub, { fontFamily: 'sans-serif', fontSize: '14px', color: '#aa9b82', align: 'center' })
        .setOrigin(0.5)
    : null;

  rect.on('pointerover', () => {
    rect.setStrokeStyle(4, 0xffe1b0);
    rect.setFillStyle(fill, 1);
  });
  rect.on('pointerout', () => rect.setStrokeStyle(3, border));
  rect.on('pointerdown', onClick);
  rect.txt = txt;
  rect.subTxt = subTxt;
  return rect;
}

export function addMenuHeader(scene, title, subtitle = '') {
  scene.add
    .text(800, 54, title, { fontFamily: 'sans-serif', fontSize: '42px', color: '#f0dda0', fontStyle: 'bold' })
    .setOrigin(0.5);
  if (subtitle) {
    scene.add
      .text(800, 104, subtitle, { fontFamily: 'sans-serif', fontSize: '16px', color: '#a99b82' })
      .setOrigin(0.5);
  }
}
