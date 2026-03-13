'use client';

import { ChangeEvent, FormEvent, MouseEvent, useEffect, useMemo, useRef, useState } from 'react';

type Device = {
  id: string;
  floorId: string;
  name: string;
  notes: string;
  x: number;
  y: number;
  linkedDeviceIds: string[];
};

type Floor = {
  id: string;
  name: string;
  imageDataUrl: string;
};

type AppState = {
  floors: Floor[];
  devices: Device[];
  selectedFloorId?: string;
  selectedDeviceId?: string;
};

const STORAGE_KEY = 'homecontrol-layout-state-v1';

const emptyState: AppState = {
  floors: [],
  devices: []
};

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export default function Home() {
  const [state, setState] = useState<AppState>(emptyState);
  const [newFloorName, setNewFloorName] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as AppState;
        setState(parsed);
      }
    } catch {
      setError('Failed to load saved layout from local storage.');
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, isLoaded]);

  const selectedFloor = useMemo(
    () => state.floors.find((floor) => floor.id === state.selectedFloorId),
    [state.floors, state.selectedFloorId]
  );

  const floorDevices = useMemo(
    () => state.devices.filter((device) => device.floorId === state.selectedFloorId),
    [state.devices, state.selectedFloorId]
  );

  const selectedDevice = useMemo(
    () => state.devices.find((device) => device.id === state.selectedDeviceId),
    [state.devices, state.selectedDeviceId]
  );

  const onUploadFloorPlan = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    if (!newFloorName.trim()) {
      setError('Please enter a floor name before uploading a floor plan.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const imageDataUrl = reader.result;
      if (typeof imageDataUrl !== 'string') {
        setError('Unsupported file format.');
        return;
      }

      const newFloor: Floor = {
        id: uid('floor'),
        name: newFloorName.trim(),
        imageDataUrl
      };

      setState((prev) => ({
        ...prev,
        floors: [...prev.floors, newFloor],
        selectedFloorId: newFloor.id,
        selectedDeviceId: undefined
      }));
      setNewFloorName('');
      setError(null);
      event.target.value = '';
    };

    reader.readAsDataURL(file);
  };

  const onFloorClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!selectedFloor || !imageContainerRef.current) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.dataset.deviceMarker === 'true') {
      return;
    }

    const rect = imageContainerRef.current.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;

    const newDevice: Device = {
      id: uid('device'),
      floorId: selectedFloor.id,
      name: `Device ${floorDevices.length + 1}`,
      notes: '',
      x,
      y,
      linkedDeviceIds: []
    };

    setState((prev) => ({
      ...prev,
      devices: [...prev.devices, newDevice],
      selectedDeviceId: newDevice.id
    }));
  };

  const updateSelectedDevice = (updates: Partial<Device>) => {
    if (!selectedDevice) {
      return;
    }

    setState((prev) => ({
      ...prev,
      devices: prev.devices.map((device) =>
        device.id === selectedDevice.id ? { ...device, ...updates } : device
      )
    }));
  };

  const onLinkToggle = (otherDeviceId: string) => {
    if (!selectedDevice) {
      return;
    }

    const isLinked = selectedDevice.linkedDeviceIds.includes(otherDeviceId);
    const updatedLinks = isLinked
      ? selectedDevice.linkedDeviceIds.filter((id) => id !== otherDeviceId)
      : [...selectedDevice.linkedDeviceIds, otherDeviceId];

    setState((prev) => ({
      ...prev,
      devices: prev.devices.map((device) => {
        if (device.id === selectedDevice.id) {
          return { ...device, linkedDeviceIds: updatedLinks };
        }
        if (device.id === otherDeviceId) {
          const reciprocalLinked = device.linkedDeviceIds.includes(selectedDevice.id)
            ? device.linkedDeviceIds
            : [...device.linkedDeviceIds, selectedDevice.id];
          return isLinked
            ? {
                ...device,
                linkedDeviceIds: device.linkedDeviceIds.filter((id) => id !== selectedDevice.id)
              }
            : { ...device, linkedDeviceIds: reciprocalLinked };
        }
        return device;
      })
    }));
  };

  const onDeleteSelectedDevice = () => {
    if (!selectedDevice) {
      return;
    }

    setState((prev) => ({
      ...prev,
      devices: prev.devices
        .filter((device) => device.id !== selectedDevice.id)
        .map((device) => ({
          ...device,
          linkedDeviceIds: device.linkedDeviceIds.filter((id) => id !== selectedDevice.id)
        })),
      selectedDeviceId: undefined
    }));
  };

  const resetAll = (event: FormEvent) => {
    event.preventDefault();
    setState(emptyState);
    setError(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <main className="page">
      <section className="sidebar">
        <h1>Home Layout Planner</h1>
        <p className="muted">Upload floor plans, add devices by clicking the plan, and link related devices.</p>

        <label htmlFor="floor-name">Floor name</label>
        <input
          id="floor-name"
          value={newFloorName}
          onChange={(event) => setNewFloorName(event.target.value)}
          placeholder="Ground Floor"
        />

        <label htmlFor="floor-upload">Floor plan image</label>
        <input id="floor-upload" type="file" accept="image/*" onChange={onUploadFloorPlan} />

        <h2>Floors</h2>
        <div className="list">
          {state.floors.length === 0 && <p className="muted">No floors yet.</p>}
          {state.floors.map((floor) => (
            <button
              key={floor.id}
              className={floor.id === state.selectedFloorId ? 'listItem active' : 'listItem'}
              onClick={() => setState((prev) => ({ ...prev, selectedFloorId: floor.id, selectedDeviceId: undefined }))}
            >
              {floor.name}
            </button>
          ))}
        </div>

        <form onSubmit={resetAll}>
          <button className="danger" type="submit">
            Reset layout
          </button>
        </form>

        {error && <p className="error">{error}</p>}
      </section>

      <section className="canvasSection">
        {!selectedFloor ? (
          <div className="emptyState">Upload at least one floor plan to start placing devices.</div>
        ) : (
          <>
            <h2>{selectedFloor.name}</h2>
            <div className="floorCanvas" ref={imageContainerRef} onClick={onFloorClick}>
              <img src={selectedFloor.imageDataUrl} alt={`${selectedFloor.name} floor plan`} />
              <svg className="linkOverlay" viewBox="0 0 100 100" preserveAspectRatio="none">
                {floorDevices.flatMap((device) =>
                  device.linkedDeviceIds
                    .map((linkedId) => {
                      const linked = floorDevices.find((d) => d.id === linkedId);
                      if (!linked || linked.id < device.id) {
                        return null;
                      }
                      return (
                        <line
                          key={`${device.id}-${linked.id}`}
                          x1={device.x}
                          y1={device.y}
                          x2={linked.x}
                          y2={linked.y}
                        />
                      );
                    })
                    .filter(Boolean)
                )}
              </svg>
              {floorDevices.map((device) => (
                <button
                  key={device.id}
                  data-device-marker="true"
                  className={device.id === state.selectedDeviceId ? 'deviceMarker selected' : 'deviceMarker'}
                  style={{ left: `${device.x}%`, top: `${device.y}%` }}
                  onClick={() => setState((prev) => ({ ...prev, selectedDeviceId: device.id }))}
                  title={device.name}
                >
                  ●
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="details">
        <h2>Device details</h2>
        {!selectedDevice ? (
          <p className="muted">Select or create a device to edit details.</p>
        ) : (
          <>
            <label htmlFor="device-name">Name</label>
            <input
              id="device-name"
              value={selectedDevice.name}
              onChange={(event) => updateSelectedDevice({ name: event.target.value })}
            />

            <label htmlFor="device-notes">Notes</label>
            <textarea
              id="device-notes"
              value={selectedDevice.notes}
              onChange={(event) => updateSelectedDevice({ notes: event.target.value })}
              rows={4}
            />

            <h3>Linked devices</h3>
            <div className="list">
              {state.devices
                .filter((device) => device.id !== selectedDevice.id)
                .map((device) => {
                  const checked = selectedDevice.linkedDeviceIds.includes(device.id);
                  return (
                    <label key={device.id} className="checkboxRow">
                      <input type="checkbox" checked={checked} onChange={() => onLinkToggle(device.id)} />
                      <span>{device.name}</span>
                    </label>
                  );
                })}
              {state.devices.length <= 1 && <p className="muted">Create at least two devices to add links.</p>}
            </div>

            <button className="danger" onClick={onDeleteSelectedDevice}>
              Delete device
            </button>
          </>
        )}
      </section>
    </main>
  );
}
