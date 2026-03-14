import { describe, expect, it } from 'vitest';

import { createDeviceDraft, toCanvasPercent } from '@/lib/canvas-utils';

describe('toCanvasPercent', () => {
  const rect = {
    left: 10,
    top: 20,
    width: 200,
    height: 100
  };

  it('maps client coordinates to normalized percentages', () => {
    const point = toCanvasPercent({ x: 110, y: 70 }, rect, { x: 0, y: 0 }, 1);

    expect(point).toEqual({ x: 50, y: 50 });
  });

  it('accounts for pan and zoom offsets while dragging', () => {
    const point = toCanvasPercent({ x: 180, y: 120 }, rect, { x: 20, y: 10 }, 2);

    expect(point).toEqual({ x: 37.5, y: 45 });
  });

  it('clamps points outside of the stage', () => {
    const point = toCanvasPercent({ x: -100, y: 900 }, rect, { x: 0, y: 0 }, 1);

    expect(point).toEqual({ x: 0, y: 100 });
  });

  it('guards against invalid zoom', () => {
    const point = toCanvasPercent({ x: 110, y: 70 }, rect, { x: 0, y: 0 }, 0);

    expect(point).toEqual({ x: 50, y: 50 });
  });
});

describe('createDeviceDraft', () => {
  it('creates a default device shape with sequential naming', () => {
    const draft = createDeviceDraft({
      id: 'device-123',
      floorId: 'floor-abc',
      existingDeviceCountOnFloor: 4,
      point: { x: 12.5, y: 89.1 }
    });

    expect(draft).toEqual({
      id: 'device-123',
      floorId: 'floor-abc',
      name: 'Device 5',
      notes: '',
      type: 'wifi-point',
      x: 12.5,
      y: 89.1,
      linkedDeviceIds: []
    });
  });

  it('clamps out-of-range coordinates', () => {
    const draft = createDeviceDraft({
      id: 'device-123',
      floorId: 'floor-abc',
      existingDeviceCountOnFloor: 0,
      point: { x: -5, y: 999 }
    });

    expect(draft.x).toBe(0);
    expect(draft.y).toBe(100);
  });
});
