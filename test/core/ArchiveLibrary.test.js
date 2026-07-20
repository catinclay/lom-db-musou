import { describe, expect, it } from 'vitest';
import { ACHIEVEMENT_DEFS, GALLERY_DEFS, unlockedEntries } from '../../src/core/ArchiveLibrary.js';
import { MetaState } from '../../src/core/MetaState.js';

describe('據點成就與畫廊解鎖', () => {
  it('新存檔沒有已解鎖項目', () => {
    const meta = new MetaState();
    expect(unlockedEntries(ACHIEVEMENT_DEFS, meta)).toEqual([]);
    expect(unlockedEntries(GALLERY_DEFS, meta)).toEqual([]);
  });

  it('完成一局、通關與購買升級會各自解鎖對應內容', () => {
    const meta = new MetaState({ stats: { runs: 1, wins: 1, bestDay: 10 }, levels: { funds: 1 } });
    expect(unlockedEntries(ACHIEVEMENT_DEFS, meta).map((x) => x.id)).toEqual([
      'firstJourney',
      'firstVictory',
      'firstUpgrade',
    ]);
    expect(unlockedEntries(GALLERY_DEFS, meta)).toHaveLength(3);
  });
});
