import { describe, expect, it, vi } from 'vitest';
import { TUNING } from '../../src/config/tuning.js';
import { transitionIn, transitionTo } from '../../src/ui/sceneTransitions.js';

function mockScene() {
  let fadeComplete;
  const camera = {
    once: vi.fn((event, callback) => { fadeComplete = callback; }),
    fadeIn: vi.fn(),
    fadeOut: vi.fn(),
  };
  const scene = {
    cameras: { main: camera },
    input: { enabled: true },
    scene: { start: vi.fn() },
  };
  return { scene, camera, completeFade: () => fadeComplete?.() };
}

describe('Scene 轉場', () => {
  it('進場會重設離場旗標與輸入，再由墨色淡入', () => {
    const { scene, camera } = mockScene();
    scene.__sceneTransitioning = true;
    scene.input.enabled = false;

    transitionIn(scene);

    expect(scene.__sceneTransitioning).toBe(false);
    expect(scene.input.enabled).toBe(true);
    expect(camera.fadeIn).toHaveBeenCalledWith(
      TUNING.anim.sceneTransition.fadeIn,
      0x10,
      0x0c,
      0x09
    );
  });

  it('先鎖輸入並淡出，淡出完成後才切換 Scene', () => {
    const { scene, camera, completeFade } = mockScene();
    const data = { run: 'same-instance' };

    expect(transitionTo(scene, 'Battle', data)).toBe(true);
    expect(scene.input.enabled).toBe(false);
    expect(scene.scene.start).not.toHaveBeenCalled();
    expect(camera.once).toHaveBeenCalledWith('camerafadeoutcomplete', expect.any(Function));
    expect(camera.fadeOut).toHaveBeenCalledWith(
      TUNING.anim.sceneTransition.fadeOut,
      0x10,
      0x0c,
      0x09
    );

    completeFade();
    expect(scene.scene.start).toHaveBeenCalledWith('Battle', data);
  });

  it('轉場中的重複點擊不會再排第二次切換', () => {
    const { scene, camera } = mockScene();

    expect(transitionTo(scene, 'Base')).toBe(true);
    expect(transitionTo(scene, 'Title')).toBe(false);
    expect(camera.fadeOut).toHaveBeenCalledTimes(1);
  });
});
