'use client';

import { FormEvent, MouseEvent, useEffect, useMemo, useRef, useState } from 'react';

import {
  AppState,
  DEFAULT_DEVICE_TYPE,
  DEVICE_TYPES,
  Device,
  DeviceType,
  emptyState,
  poeDeviceTypes
} from '@/lib/layout-types';

type FloorLink = {
  a: Device;
  b: Device;
  order: number;
};

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function linkPath(a: Device, b: Device, order: number): string {
  const offset = ((order % 5) - 2) * 2.2;
  const horizontalFirst = Math.abs(a.x - b.x) >= Math.abs(a.y - b.y);

  if (horizontalFirst) {
    const midX = (a.x + b.x) / 2 + offset;
    return `M ${a.x} ${a.y} L ${midX} ${a.y} L ${midX} ${b.y} L ${b.x} ${b.y}`;
  }

  const midY = (a.y + b.y) / 2 + offset;
  return `M ${a.x} ${a.y} L ${a.x} ${midY} L ${b.x} ${midY} L ${b.x} ${b.y}`;
}

function getLinkIcon(type: DeviceType): string {
  return type === 'wifi-point' ? '🛜' : '🔌';
}

export default function Home() {
  const [state, setState] = useState<AppState>(emptyState);
  const [newFloorName, setNewFloorName] = useState('');
  const [newFloorFile, setNewFloorFile] = useState<File | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [showLinks, setShowLinks] = useState(true);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const dragDeviceIdRef = useRef<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const loadState = async () => {
      try {
        const response = await fetch('/api/layout');
        const nextState = (await response.json()) as AppState;

        if (!response.ok) {
          throw new Error('Failed to load layout from Postgres.');
        }

        setState(nextState);
      } catch {
        setError('Failed to load saved layout from Postgres.');
      } finally {
        setIsLoaded(true);
      }
    };

    loadState();
  }, []);

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsSaving(true);
      try {
        const response = await fetch('/api/layout', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(state)
        });

        if (!response.ok) {
          throw new Error('save failed');
        }

        setError(null);
      } catch {
        setError('Failed to save layout to Postgres.');
      } finally {
        setIsSaving(false);
      }
    }, 250);

    return () => clearTimeout(timeoutId);
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

  useEffect(() => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
  }, [state.selectedFloorId]);

  const floorLinks = useMemo<FloorLink[]>(() => {
    const links: FloorLink[] = [];
    floorDevices.forEach((device) => {
      device.linkedDeviceIds.forEach((linkedId) => {
        const linked = state.devices.find((candidate) => candidate.id === linkedId);
        if (!linked || linked.id < device.id) {
          return;
        }

        const mappedLinked =
          linked.floorId === state.selectedFloorId
            ? linked
            : {
                ...linked,
                x: linked.x > 50 ? 99 : 1,
                y: linked.y > 50 ? 99 : 1
              };

        links.push({ a: device, b: mappedLinked, order: links.length });
      });
    });
    return links;
  }, [floorDevices, state.devices, state.selectedFloorId]);

  const onCreateFloor = () => {
    if (!newFloorFile) {
      setError('Please choose a floor plan image before creating a floor.');
      return;
    }

    if (!newFloorName.trim()) {
      setError('Please enter a floor name before creating a floor.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const imageDataUrl = reader.result;
      if (typeof imageDataUrl !== 'string') {
        setError('Unsupported file format.');
        return;
      }

      const newFloor = {
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
      setNewFloorFile(null);
      setError(null);
      const floorUploadInput = document.getElementById('floor-upload') as HTMLInputElement | null;
      if (floorUploadInput) {
        floorUploadInput.value = '';
      }
    };

    reader.readAsDataURL(newFloorFile);
  };

  const onDeleteFloor = (floorId: string) => {
    const floor = state.floors.find((candidate) => candidate.id === floorId);
    if (!floor) {
      return;
    }

    const shouldDelete = window.confirm(
      `Delete "${floor.name}" and all devices on this floor? This cannot be undone.`
    );
    if (!shouldDelete) {
      return;
    }

    setState((prev) => {
      const removedDeviceIds = new Set(
        prev.devices.filter((device) => device.floorId === floorId).map((device) => device.id)
      );
      const nextFloors = prev.floors.filter((candidate) => candidate.id !== floorId);
      const filteredDevices = prev.devices
        .filter((device) => device.floorId !== floorId)
        .map((device) => ({
          ...device,
          linkedDeviceIds: device.linkedDeviceIds.filter((id) => !removedDeviceIds.has(id))
        }));

      const selectedFloorId =
        prev.selectedFloorId === floorId ? nextFloors[0]?.id : prev.selectedFloorId;
      const selectedDeviceId = removedDeviceIds.has(prev.selectedDeviceId ?? '')
        ? undefined
        : prev.selectedDeviceId;

      return {
        ...prev,
        floors: nextFloors,
        devices: filteredDevices,
        selectedFloorId,
        selectedDeviceId
      };
    });
  };

  const onFloorClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!selectedFloor || !imageContainerRef.current) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest('[data-device-marker="true"]')) {
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
      type: DEFAULT_DEVICE_TYPE,
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

  const moveDeviceToPointer = (deviceId: string, clientX: number, clientY: number) => {
    if (!imageContainerRef.current) {
      return;
    }

    const rect = imageContainerRef.current.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;

    setState((prev) => ({
      ...prev,
      devices: prev.devices.map((device) =>
        device.id === deviceId
          ? {
              ...device,
              x: Math.min(100, Math.max(0, x)),
              y: Math.min(100, Math.max(0, y))
            }
          : device
      )
    }));
  };

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const draggingDeviceId = dragDeviceIdRef.current;
      if (!draggingDeviceId) {
        return;
      }

      moveDeviceToPointer(draggingDeviceId, event.clientX, event.clientY);
    };

    const stopDragging = () => {
      dragDeviceIdRef.current = null;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopDragging);
    window.addEventListener('pointercancel', stopDragging);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', stopDragging);
      window.removeEventListener('pointercancel', stopDragging);
    };
  }, []);

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
  };

  const updateZoom = (direction: 'in' | 'out') => {
    setZoomLevel((prev) => {
      if (direction === 'in') {
        return Math.min(3, Number((prev + 0.2).toFixed(2)));
      }
      return Math.max(0.6, Number((prev - 0.2).toFixed(2)));
    });
  };

  const panBy = (x: number, y: number) => {
    setPanOffset((prev) => ({ x: prev.x + x, y: prev.y + y }));
  };

  const resetView = () => {
    setZoomLevel(1);
    setPanOffset({ x: 0, y: 0 });
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
        <input
          id="floor-upload"
          type="file"
          accept="image/*"
          onChange={(event) => {
            setNewFloorFile(event.target.files?.[0] ?? null);
            setError(null);
          }}
        />

        <button type="button" onClick={onCreateFloor}>
          + Add floor
        </button>

        <h2>Floors</h2>
        <div className="list">
          {state.floors.length === 0 && <p className="muted">No floors yet.</p>}
          {state.floors.map((floor) => (
            <div key={floor.id} className="listRow">
              <button
                className={floor.id === state.selectedFloorId ? 'listItem active' : 'listItem'}
                onClick={() =>
                  setState((prev) => ({ ...prev, selectedFloorId: floor.id, selectedDeviceId: undefined }))
                }
                type="button"
              >
                {floor.name}
              </button>
              <button className="danger floorDelete" onClick={() => onDeleteFloor(floor.id)} type="button">
                Delete
              </button>
            </div>
          ))}
        </div>

        <form onSubmit={resetAll}>
          <button className="danger" type="submit">
            Reset layout
          </button>
        </form>

        <p className="muted">Storage: PostgreSQL {isSaving ? '(saving...)' : ''}</p>
        {error && <p className="error">{error}</p>}
      </section>

      <section className="canvasSection">
        {!selectedFloor ? (
          <div className="emptyState">Upload at least one floor plan to start placing devices.</div>
        ) : (
          <>
            <div className="canvasHeader">
              <h2>{selectedFloor.name}</h2>
              <div className="canvasControls">
                <button className="toggleLinks" onClick={() => setShowLinks((prev) => !prev)} type="button">
                  {showLinks ? 'Hide links' : 'Show links'} ({floorLinks.length})
                </button>
                <button className="toggleLinks" onClick={() => updateZoom('in')} type="button">
                  Zoom +
                </button>
                <button className="toggleLinks" onClick={() => updateZoom('out')} type="button">
                  Zoom -
                </button>
                <button className="toggleLinks" onClick={() => panBy(0, -25)} type="button">
                  ↑
                </button>
                <button className="toggleLinks" onClick={() => panBy(-25, 0)} type="button">
                  ←
                </button>
                <button className="toggleLinks" onClick={() => panBy(25, 0)} type="button">
                  →
                </button>
                <button className="toggleLinks" onClick={() => panBy(0, 25)} type="button">
                  ↓
                </button>
                <button className="toggleLinks" onClick={resetView} type="button">
                  Reset view
                </button>
              </div>
            </div>
            <div className="floorCanvas" onClick={onFloorClick}>
              <div
                className="floorCanvasStage"
                ref={imageContainerRef}
                style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoomLevel})` }}
              >
                <img src={selectedFloor.imageDataUrl} alt={`${selectedFloor.name} floor plan`} />
                {showLinks && (
                  <svg className="linkOverlay" viewBox="0 0 100 100" preserveAspectRatio="none">
                    {floorLinks.map((link) => (
                      <path
                        key={`${link.a.id}-${link.b.id}`}
                        d={linkPath(link.a, link.b, link.order)}
                        className="routedLink"
                      />
                    ))}
                  </svg>
                )}
                {floorDevices.map((device) => (
                  <div
                    key={device.id}
                    className="deviceWithLabel"
                    data-device-marker="true"
                    style={{ left: `${device.x}%`, top: `${device.y}%` }}
                  >
                    <button
                      type="button"
                      data-device-marker="true"
                      className={device.id === state.selectedDeviceId ? 'deviceMarker selected' : 'deviceMarker'}
                      data-poe={poeDeviceTypes.has(device.type) ? 'true' : 'false'}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        dragDeviceIdRef.current = device.id;
                        moveDeviceToPointer(device.id, event.clientX, event.clientY);
                        setState((prev) => ({ ...prev, selectedDeviceId: device.id }));
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        setState((prev) => ({ ...prev, selectedDeviceId: device.id }));
                      }}
                      title={device.name}
                    />
                    <span className="deviceLabel">{device.name}</span>
                  </div>
                ))}
              </div>
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

            <label htmlFor="device-type">Type</label>
            <select
              id="device-type"
              value={selectedDevice.type}
              onChange={(event) => updateSelectedDevice({ type: event.target.value as DeviceType })}
            >
              {DEVICE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                  {type.poe ? ' [PoE]' : ''}
                </option>
              ))}
            </select>

            <label htmlFor="device-notes">Notes</label>
            <textarea
              id="device-notes"
              value={selectedDevice.notes}
              onChange={(event) => updateSelectedDevice({ notes: event.target.value })}
              rows={4}
            />

            <h3>
              Linked devices ({selectedDevice.linkedDeviceIds.length})
              {selectedDevice.type === 'network-switch' ? ' • switch uplinks + edge links visible' : ''}
            </h3>
            <div className="list">
              {state.devices
                .filter((device) => device.id !== selectedDevice.id)
                .sort((a, b) => {
                  const aLinked = selectedDevice.linkedDeviceIds.includes(a.id);
                  const bLinked = selectedDevice.linkedDeviceIds.includes(b.id);

                  if (aLinked !== bLinked) {
                    return aLinked ? -1 : 1;
                  }

                  return a.name.localeCompare(b.name);
                })
                .map((device) => {
                  const linked = selectedDevice.linkedDeviceIds.includes(device.id);
                  return (
                    <div key={device.id} className="linkActionRow">
                      <span className="linkDeviceName">
                        {getLinkIcon(device.type)} {device.name}
                      </span>
                      <button type="button" className="linkActionButton" onClick={() => onLinkToggle(device.id)}>
                        {linked ? '➖ Remove link' : '➕ Add link'}
                      </button>
                    </div>
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
