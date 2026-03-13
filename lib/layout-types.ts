export const DEVICE_TYPES = [
  { value: 'wifi-point', label: 'WiFi point', poe: true },
  { value: 'security-camera', label: 'Security camera', poe: true },
  { value: 'rj45-outlet', label: 'RJ45 outlet', poe: true },
  { value: 'lutron-recessed-fitting', label: 'Lutron recessed fitting', poe: false },
  { value: 'lighting-gang-box-control', label: 'Lighting gang box control', poe: false },
  { value: 'lutron-keypad', label: 'Lutron keypad', poe: false },
  { value: 'audio-control', label: 'Audio control', poe: true },
  { value: 'lutron-processor', label: 'Lutron processor', poe: false },
  { value: 'network-switch', label: 'Network switch', poe: false }
] as const;

export type DeviceType = (typeof DEVICE_TYPES)[number]['value'];

export type Device = {
  id: string;
  floorId: string;
  name: string;
  notes: string;
  type: DeviceType;
  x: number;
  y: number;
  linkedDeviceIds: string[];
};

export type Floor = {
  id: string;
  name: string;
  imageDataUrl: string;
};

export type AppState = {
  floors: Floor[];
  devices: Device[];
  selectedFloorId?: string;
  selectedDeviceId?: string;
};

export const DEFAULT_DEVICE_TYPE: DeviceType = 'wifi-point';

export const emptyState: AppState = {
  floors: [],
  devices: []
};

export const poeDeviceTypes = new Set<DeviceType>(DEVICE_TYPES.filter((type) => type.poe).map((type) => type.value));
