import { DEFAULT_DEVICE_TYPE, Device } from '@/lib/layout-types';

export type Point = { x: number; y: number };

export type RectLike = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function toCanvasPercent(
  clientPoint: Point,
  rect: RectLike,
  panOffset: Point,
  zoomLevel: number
): Point {
  const zoomSafe = zoomLevel <= 0 ? 1 : zoomLevel;
  const x = ((clientPoint.x - rect.left - panOffset.x) / zoomSafe / rect.width) * 100;
  const y = ((clientPoint.y - rect.top - panOffset.y) / zoomSafe / rect.height) * 100;

  return {
    x: clamp(x, 0, 100),
    y: clamp(y, 0, 100)
  };
}

export function createDeviceDraft(params: {
  id: string;
  floorId: string;
  existingDeviceCountOnFloor: number;
  point: Point;
}): Device {
  return {
    id: params.id,
    floorId: params.floorId,
    name: `Device ${params.existingDeviceCountOnFloor + 1}`,
    notes: '',
    type: DEFAULT_DEVICE_TYPE,
    x: clamp(params.point.x, 0, 100),
    y: clamp(params.point.y, 0, 100),
    linkedDeviceIds: []
  };
}
