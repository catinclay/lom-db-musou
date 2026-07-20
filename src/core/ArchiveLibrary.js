/**
 * 據點內的成就與畫廊目錄。解鎖條件只讀 MetaState，不碰 Phaser／localStorage。
 * 首批條件刻意對應已存在的跨局行為，不另外發明一套進度系統。
 */

const hasUpgrade = (meta) => Object.values(meta.levels ?? {}).some((level) => level > 0);

export const ACHIEVEMENT_DEFS = [
  {
    id: 'firstJourney',
    name: '江湖初歸',
    desc: '完成第一局江湖遠征。',
    hint: '完成任意一局挑戰',
    unlocked: (meta) => (meta.stats?.runs ?? 0) > 0,
  },
  {
    id: 'firstVictory',
    name: '名震江湖',
    desc: '擊敗最終魔王，完成一次遠征。',
    hint: '通關一次江湖遠征',
    unlocked: (meta) => (meta.stats?.wins ?? 0) > 0,
  },
  {
    id: 'firstUpgrade',
    name: '薪火相傳',
    desc: '完成第一次跨局強化。',
    hint: '在演武堂購買任一升級',
    unlocked: hasUpgrade,
  },
];

export const GALLERY_DEFS = [
  {
    id: 'mistGate',
    name: '山門晨霧',
    caption: '第一次遠征歸來時的山門。',
    hint: '完成任意一局挑戰',
    palette: [0x9fb7b9, 0x263c42, 0xd9b45c],
    unlocked: (meta) => (meta.stats?.runs ?? 0) > 0,
  },
  {
    id: 'victoryMoon',
    name: '江湖凱歌',
    caption: '月下收刀，群魔俱寂。',
    hint: '通關一次江湖遠征',
    palette: [0xd8d0ae, 0x492733, 0xc4583f],
    unlocked: (meta) => (meta.stats?.wins ?? 0) > 0,
  },
  {
    id: 'trainingFire',
    name: '傳功燈火',
    caption: '演武堂中，一盞不滅的燈。',
    hint: '在演武堂購買任一升級',
    palette: [0xf0dda0, 0x3b251d, 0xff7a3c],
    unlocked: hasUpgrade,
  },
];

export function unlockedEntries(defs, meta) {
  return defs.filter((def) => def.unlocked(meta));
}
