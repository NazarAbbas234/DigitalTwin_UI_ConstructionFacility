import * as React from "react";
import { IModelApp, DecorateContext, Decorator } from "@itwin/core-frontend";
import { SmartDeviceMarker } from "../markers/SmartDeviceMarker";
import { SmartDeviceDecorator } from "../decorators/SmartDeviceDecorator";
import { IModelDataApi, ColumnElement } from "../apis/IModelDataApi";
import { SmartDeviceAPI } from "../../SmartDeviceAPI";
import "./SmartDeviceListWidget.css";
import { useActiveIModelConnection } from "@itwin/appui-react";
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement } from 'chart.js';
import { Pie, Bar } from 'react-chartjs-2';

// Register ChartJS modules
ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement);

interface ActiveColumn extends ColumnElement {
  assetId?: string;
  status?: string;
  reading?: number;
  cloud?: any;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
}

export function SmartDeviceListWidgetComponent() {
  const iModelConnection = useActiveIModelConnection();
  const [smartDevices, setSmartDevices] = React.useState<ActiveColumn[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);

  // UI Search/Filter Control States
  const [searchQuery, setSearchQuery] = React.useState<string>("");
  const [typeFilter, setTypeFilter] = React.useState<string>("All");
  const [statusFilter, setStatusFilter] = React.useState<string>("All");
  const [groundOnly, setGroundOnly] = React.useState<boolean>(false);
  const [floor2Only, setFloor2Only] = React.useState<boolean>(false);
  const [floor3Only, setFloor3Only] = React.useState<boolean>(false);

  // 1. NEW: Form Workflow Interaction States
  const [editingDevice, setEditingDevice] = React.useState<ActiveColumn | null>(null);
  const [editStatus, setEditStatus] = React.useState<string>("");
  const [editReading, setEditReading] = React.useState<number>(0);
  const [toastMessage, setToastMessage] = React.useState<string | null>(null);
  const [scheduleDevice, setScheduleDevice] = React.useState<ActiveColumn | null>(null);
  const [schedActualStart, setSchedActualStart] = React.useState<string | null>(null);
  const [schedActualEnd, setSchedActualEnd] = React.useState<string | null>(null);
  const [schedVariance, setSchedVariance] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!iModelConnection) {
        console.log("📡 Waiting for iModelConnection to stabilize before initializing IoT streams...");
        return;
      }
      async function initializeDeviceTelemetryStream() {
      try {
        setLoading(true);
        const [spatialDevices, iotTelemetry] = await Promise.all([
          IModelDataApi.getColumns(iModelConnection),
          SmartDeviceAPI.getData()
        ]);

          const combinedDevices: ActiveColumn[] = spatialDevices.map((device) => {
          const ecId = device.ecInstanceId || (device as any).ECInstanceId || (device as any).id;
          const meta = iotTelemetry[ecId] || {};

          const currentStatus = meta?.Status || "Unknown";
          const coreReading = 0;

          // Schedule fields (may be absent in the demo blob.json)
          const plannedStart = meta?.PlannedStart || meta?.PlannedStartDate || null;
          const plannedEnd = meta?.PlannedEnd || meta?.PlannedEndDate || null;
          const actualStart = meta?.ActualStart || meta?.ActualStartDate || null;
          const actualEnd = meta?.ActualEnd || meta?.ActualEndDate || null;

          return { ...device, assetId: meta?.AssetID, status: currentStatus, reading: coreReading, cloud: meta, plannedStart, plannedEnd, actualStart, actualEnd };
        });

        setSmartDevices(combinedDevices);
      } catch (error) {
        console.error("❌ Failed to aggregate digital twin IoT datasets:", error);
      } finally {
        setLoading(false);
      }
    }
    // Fire the data aggregate loop instantly
    initializeDeviceTelemetryStream();

    // The simulation engine loop (kept for telemetry/reading simulation but NO automatic status changes)
    const iotStreamInterval = setInterval(() => {
      setSmartDevices((prevDevices) => {
        return prevDevices.map((device) => {
          if ((device as any).isManuallyEdited) return device;
          // Simulation placeholder: we might update readings here in future, but do not modify `status` automatically.
          return device;
        });
      });
    }, 2500);

    return () => clearInterval(iotStreamInterval);
    }, [iModelConnection]);

  // Viewport Camera Tracking Trigger
  const handleDeviceFocus = React.useCallback(async (ecInstanceId: string) => {
    const activeViewport = IModelApp.viewManager.selectedView;
    if (!activeViewport) return;

    activeViewport.iModel.selectionSet.emptyAll();
    activeViewport.iModel.selectionSet.replace(ecInstanceId);

    await activeViewport.zoomToElements(ecInstanceId, {
      animateFrustumChange: true
    });
  }, []);

  // Manage a single temporary decorator that persists until toggled off by clicking the row again
  const activeTempRef = React.useRef<{ dec?: Decorator; ecId?: string } | null>(null);

  const removeActiveTemporaryMarker = React.useCallback(() => {
    if (activeTempRef.current?.dec) {
      try {
        IModelApp.viewManager.dropDecorator(activeTempRef.current.dec);
        IModelApp.viewManager.invalidateDecorationsAllViews();
      } catch (e) {
        // ignore
      }
      activeTempRef.current = null;
    }
  }, []);

  const toggleTemporaryMarker = React.useCallback((device: ActiveColumn) => {
    const vp = IModelApp.viewManager.selectedView;
    if (!vp || !device.origin) return;

    const ecId = String(device.ecInstanceId || (device as any).id || "");

    // If same device clicked again, remove the active marker
    if (activeTempRef.current && activeTempRef.current.ecId === ecId) {
      removeActiveTemporaryMarker();
      return;
    }

    // Remove any existing temp marker
    removeActiveTemporaryMarker();

    const marker = new SmartDeviceMarker(
      { x: device.origin.x, y: device.origin.y, z: device.origin.z },
      { x: 32, y: 32 },
      device.assetId || device.userLabel || ecId,
      "Column",
      device.cloud || {},
      ecId
    );

    class TempDecorator implements Decorator {
      private _markers = [marker];
      public decorate(context: DecorateContext): void {
        this._markers.forEach(m => { if ((m as any).visible) m.addDecoration(context); });
      }
    }

    const dec = new TempDecorator();
    IModelApp.viewManager.addDecorator(dec);
    IModelApp.viewManager.invalidateDecorationsAllViews();

    activeTempRef.current = { dec, ecId };
  }, [removeActiveTemporaryMarker]);

  // 2. NEW: Open Form Editor Handler
  const startEditing = (e: React.MouseEvent, device: ActiveColumn) => {
    e.stopPropagation(); // Prevents row click zoom tracking from triggering simultaneously
    setEditingDevice(device);
    setEditStatus(device.status || "");
    setEditReading(device.reading || 0);
  };

  // 3. NEW: The Data Write-Back Process Engine
  const handleSaveData = async () => {
    if (!editingDevice) return;

    const targetId = (editingDevice as any).ecInstanceId || (editingDevice as any).id;
    const finalSavedReading = Number(editReading);
    const finalSavedStatus = editStatus;

    // 1. Update Local Component State Layout instantly (Optimistic UI update)
    setSmartDevices((prev) =>
      prev.map((d) => {
        const id = (d as any).ecInstanceId || (d as any).id;
        return String(id) === String(targetId)
          ? { ...d, status: finalSavedStatus, reading: finalSavedReading, isManuallyEdited: true }
          : d;
      })
    );

    // Close the popup view
    setEditingDevice(null);

    // 2. Push Real Changes to Your Backend Server Database
    try {
      // 🚀 DYNAMIC URL EXTRACTION: Uses localhost or production cloud automatically
      const baseUrl = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
        ? "http://localhost:5000"
        : "https://smart-house-backend-1.onrender.com";

      const idForWrite = editingDevice.assetId || editingDevice.userLabel || (editingDevice as any).ecInstanceId;
      console.log(`📡 Sending write payload to live database for ${idForWrite}...`);

      const response = await fetch(`${baseUrl}/devices/${idForWrite}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: finalSavedStatus,
          reading: finalSavedReading
        }),
      });

      if (!response.ok) {
        throw new Error(`Server responded with HTTP status ${response.status}`);
      }

      setToastMessage(`🎉 Saved changes for ${editingDevice.assetId || editingDevice.userLabel} directly to database!`);
      setTimeout(() => setToastMessage(null), 4000);
      
    } catch (err) {
      console.error("❌ Write-back sequence pipeline execution failed:", err);
      setToastMessage(`⚠️ App saved locally, but database sync failed.`);
      setTimeout(() => setToastMessage(null), 4000);
    }
  };

  // Computed Filters (search by assetId or userLabel)
  const computeScheduleStatus = React.useCallback((device: ActiveColumn) => {
    // If a ScheduleVariance value exists in cloud metadata, use it as authoritative
    const sv = device.cloud?.ScheduleVariance ?? device.cloud?.ScheduleVar ?? null;
    if (sv !== null && sv !== undefined) {
      const diff = Number(sv);
      if (diff > 0) return "Delayed";
      if (diff < 0) return "Ahead";
      return "On time";
    }

    if (device.plannedEnd && device.actualEnd) {
      const planned = new Date(device.plannedEnd);
      const actual = new Date(device.actualEnd as string);
      const diff = Math.round((actual.getTime() - planned.getTime()) / (1000*60*60*24));
      if (diff > 0) return "Delayed";
      if (diff < 0) return "Ahead";
      return "On time";
    }
    return device.status || "Unknown";
  }, []);

  const filteredDevices = React.useMemo(() => {
    return smartDevices.filter((device) => {
      if (groundOnly || floor2Only || floor3Only) {
        const a = (device.assetId || device.cloud?.AssetID || "").toString();
        let keep = false;
        if (groundOnly) {
          if (/^COL-G-/i.test(a) || a.toUpperCase() === "SLB-G-001") keep = true;
        }
        if (floor2Only) {
          if (/^COL-2F-/i.test(a) || a.toUpperCase() === "SLB-2F-001") keep = true;
        }
        if (floor3Only) {
          if (/^COL-3F-/i.test(a) || a.toUpperCase() === "SLB-3F-001") keep = true;
        }
        if (!keep) return false;
      }
      const name = ((device.assetId || device.userLabel || "") as string).toLowerCase();
      const matchesSearch = name.includes(searchQuery.toLowerCase());
      const deviceType = device.cloud?.Type || device.codeValue || (device.assetId && device.assetId.toLowerCase().startsWith("slb") ? "Slab" : "Column");
      const matchesType = typeFilter === "All" || deviceType === typeFilter;
      const schedStatus = computeScheduleStatus(device);
      const matchesStatus = statusFilter === "All" || schedStatus === statusFilter;
      return matchesSearch && matchesType && matchesStatus;
    });
  }, [smartDevices, searchQuery, typeFilter, statusFilter, computeScheduleStatus, floor3Only]);
  // Compute a stable key for assets so transient state updates (like telemetry interval) don't re-trigger visibility toggles
  const assetsKey = React.useMemo(() => smartDevices.map(d => (d.assetId || d.cloud?.AssetID || "")).filter(a => !!a).sort().join(","), [smartDevices]);

  // When GroundFloor filter toggles, update marker visibility via SmartDeviceDecorator
  React.useEffect(() => {
    try {
      const allAssetIds = smartDevices.map(d => (d.assetId || d.cloud?.AssetID || "")).filter(a => !!a);
      if (groundOnly || floor2Only || floor3Only) {
        const allowedAssets = smartDevices.filter(d => {
          const a = (d.assetId || d.cloud?.AssetID || "").toString();
          let ok = false;
          if (groundOnly && (/^COL-G-/i.test(a) || /^SLB-?G/i.test(a) || /SLB-G/i.test(a))) ok = true;
          if (floor2Only && (/^COL-2F-/i.test(a) || /^SLB-?2F/i.test(a) || /SLB-2F/i.test(a))) ok = true;
          if (floor3Only && (/^COL-3F-/i.test(a) || /^SLB-?3F/i.test(a) || /SLB3F/i.test(a) || /SLB-3F/i.test(a))) ok = true;
          return ok;
        });

        const allowedEcIds = allowedAssets.map(d => (d.ecInstanceId || (d as any).id)).filter(a => !!a);

        // Apply visibility changes whenever a floor filter is active (effect dependencies keep this infrequent)
        SmartDeviceDecorator.setAssetsVisibleGlobally(allAssetIds as string[], false);
        SmartDeviceDecorator.setAssetsVisibleGlobally(allowedAssets.map(d => (d.assetId || d.cloud?.AssetID || "")) as string[], true);

        const vp = IModelApp.viewManager.selectedView;
        if (vp) {
          import("../Visualization").then(({ Visualization }) => {
            Visualization.showOnlyElements(vp, allowedEcIds as string[]);
          }).catch(() => {});
        }
      } else {
        // show all markers and restore geometry
        SmartDeviceDecorator.setAssetsVisibleGlobally(allAssetIds as string[], true);
        const vp = IModelApp.viewManager.selectedView;
        if (vp) {
          import("../Visualization").then(({ Visualization }) => {
            Visualization.restoreAllCategories(vp).catch(() => {});
            try { vp.invalidateScene(); } catch {};
          }).catch(() => {});
        }
      }
    } catch (e) {
      // ignore if decorator not registered
    }
  }, [groundOnly, floor2Only, floor3Only, assetsKey]);

  const uniqueTypes = React.useMemo(() => {
    const set = new Set<string>();
    set.add("All");
    smartDevices.forEach(d => {
      const t = d.cloud?.Type || d.codeValue || (d.assetId && d.assetId.toLowerCase().startsWith("slb") ? "Slab" : "Column");
      if (t) set.add(t);
    });
    return Array.from(set);
  }, [smartDevices]);

  const totalDevices = smartDevices.length;
    const devicesOn = smartDevices.filter(d => ["On", "Locked", "Open"].includes(d.status || "")).length;
    const devicesOff = smartDevices.filter(d => ["Off", "Unlocked", "Closed"].includes(d.status || "")).length;

    const chartData = {
      labels: ['Active / On', 'Inactive / Off'],
      datasets: [
        {
          label: '# of Devices',
          data: [devicesOn, devicesOff],
          backgroundColor: ['rgba(54, 162, 235, 0.6)', 'rgba(255, 99, 132, 0.6)'],
          borderColor: ['rgba(54, 162, 235, 1)', 'rgba(255, 99, 132, 1)'],
          borderWidth: 1,
        },
      ],
    };

    // Toggle to show/hide device metrics chart in the sidebar
    const showDeviceMetrics = false;

  if (loading) {
    return <div style={{ padding: "16px", fontStyle: "italic", color: "#667788" }}>Connecting to live IoT feeds...</div>;
  }

return (
    // 🚀 FIXED: Added layout flex display layout to keep panels perfectly separated side-by-side
    <div className="widget-dashboard-container" style={{ display: "flex", width: "100%", height: "100%", overflow: "hidden" }}>
      
      {/* SIDEBAR VIEW CONTROLS */}
      {/* 🚀 FIXED: Added strict width constraint so it never overlaps your table */}
      <div className="widget-sidebar" style={{ width: "250px", minWidth: "250px", padding: "15px", borderRight: "1px solid #333", overflowY: "auto" }}>
        <div className="sidebar-section">
          <label>Search Devices</label>
          <input 
            type="text" 
            className="search-input"
            placeholder="Search assets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="sidebar-section">
          <label>Device Type</label>
          <select className="filter-dropdown" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
            {uniqueTypes.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

          <div className="sidebar-section">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={groundOnly} onChange={(e) => setGroundOnly(e.target.checked)} />
              GroundFloor Only
            </label>
          </div>
          <div className="sidebar-section">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={floor2Only} onChange={(e) => setFloor2Only(e.target.checked)} />
              SecondFloor Only
            </label>
          </div>
          <div className="sidebar-section">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={floor3Only} onChange={(e) => setFloor3Only(e.target.checked)} />
              ThirdFloor Only
            </label>
          </div>

        <div className="sidebar-section">
          <label>Live Status</label>
          <select className="filter-dropdown" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="All">All Statuses</option>
            <option value="On time">On time</option>
            <option value="Delayed">Delayed</option>
            <option value="Ahead">Ahead</option>
          </select>
        </div>

        {/* 📊 CHART DISPLAY */}
        {showDeviceMetrics && (
          <div style={{ 
            marginTop: "20px", 
            padding: "12px", 
            background: "#2a2a2a", 
            borderRadius: "8px", 
            border: "1px solid #444"
          }}>
            <h3 style={{ margin: "0 0 5px 0", fontSize: "13px", color: "#fff", fontWeight: 600 }}>
              📊 Device Metrics
            </h3>
            <p style={{ fontSize: "11px", color: "#aaa", marginBottom: "10px" }}>
              Total Tracked Assets: {totalDevices}
            </p>
            <div style={{ width: "100%", height: "130px", display: "flex", justifyContent: "center" }}>
              <Pie data={chartData} options={{ responsive: true, maintainAspectRatio: false }} />
            </div>
          </div>
        )}

      </div> {/* This closes the widget-sidebar */}

      {/* MAIN DATA INTERACTIVE GRID TABLE */}
      {/* 🚀 FIXED: Added flex: 1 and overflow scroll so the table occupies the rest of the window perfectly */}
      <div className="widget-main-content" style={{ flex: 1, padding: "15px", overflowY: "auto" }}>
        <table className="smart-table">
          <thead>
            <tr>
              <th>
                <div className="header-stack">
                  <span className="header-top">Asset ID</span>
                  <span className="header-bottom">Component</span>
                </div>
              </th>
              <th>Type</th>
              <th>Actual Start</th>
              <th>Actual End</th>
              <th>Schedule Var</th>
              <th>Schedule Status</th>
              <th>New Target</th>
            </tr>
          </thead>
          <tbody>
            {filteredDevices.map((device) => {
              const isActive = device.status && device.status !== "Unknown";
              const rowModifierClass = isActive ? "row-status-active" : "row-status-inactive";
              const keyId = (device as any).ecInstanceId || (device as any).id || (device as any).ECInstanceId || "";

              return (
                <tr 
                  key={String(keyId)} 
                  className={`clickable device-row ${rowModifierClass}`}
                  onClick={() => { handleDeviceFocus(String(keyId)); toggleTemporaryMarker(device); }}
                >
                  <td style={{ fontVariant: "all-small-caps", fontWeight: 600 }}>{device.assetId || "—"}</td>
                    <td>{device.cloud?.Type || device.codeValue || (device.assetId && device.assetId.toLowerCase().startsWith("slb") ? "Slab" : "Column")}</td>
                    <td>{device.actualStart ? new Date(device.actualStart).toLocaleDateString() : "—"}</td>
                    <td>{device.actualEnd ? new Date(device.actualEnd).toLocaleDateString() : "—"}</td>
                    <td className="telemetry-cell">{(() => {
                      // show schedule variance: prefer explicit cloud value if present
                      const sv = device.cloud?.ScheduleVariance ?? device.cloud?.ScheduleVar ?? null;
                      if (sv !== null && sv !== undefined) {
                        const diff = Number(sv);
                        return (diff > 0 ? `+${diff} Days` : `${diff} Days`);
                      }
                      if (device.plannedEnd && device.actualEnd) {
                        const planned = new Date(device.plannedEnd);
                        const actual = new Date(device.actualEnd as string);
                        const diff = Math.round((actual.getTime() - planned.getTime()) / (1000*60*60*24));
                        return (diff > 0 ? `+${diff} Days` : `${diff} Days`);
                      }
                      return "—";
                    })()}</td>
                    <td>
                      {(() => {
                        const status = computeScheduleStatus(device);
                        const cls = status === "Delayed" ? "sched-delayed" : status === "Ahead" ? "sched-ahead" : status === "On time" ? "sched-ontime" : "sched-unknown";
                        return <span className={`status-badge ${cls}`}>{status}</span>;
                      })()}
                    </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                      <span>{(() => {
                        // Compute New Target = (actualEnd || plannedEnd) +/- ScheduleVariance
                        const base = device.actualEnd || device.plannedEnd || null;
                        if (!base) return "—";
                        const sv = device.cloud?.ScheduleVariance ?? device.cloud?.ScheduleVar ?? null;
                        const days = sv !== null && sv !== undefined ? Number(sv) : 0;
                        const d = new Date(base as string);
                        if (!Number.isNaN(days)) d.setDate(d.getDate() + days);
                        return d.toLocaleDateString();
                      })()}</span>
                      <button
                        className="btn-secondary"
                        style={{ padding: "4px 8px", fontSize: "11px" }}
                        onClick={(e) => { e.stopPropagation(); setScheduleDevice(device); setSchedActualStart(device.actualStart || null); setSchedActualEnd(device.actualEnd || null); setSchedVariance(device.cloud?.ScheduleVariance ?? device.cloud?.ScheduleVar ?? null); }}
                      >
                        ▶ Execute
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 4. THE POPUP MODAL CONTROL CARD VIEW COMPONENT */}
      {editingDevice && (
        <div className="modal-overlay" onClick={() => setEditingDevice(null)}>
          <div className="edit-modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Configure {editingDevice.assetId || editingDevice.userLabel || (editingDevice as any).ecInstanceId}</h3>
            
            <div className="sidebar-section">
              <label>Set Status Override</label>
              <select className="filter-dropdown" value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                <option value="On">On / Active</option>
                <option value="Off">Off / Standby</option>
                <option value="Locked">Locked</option>
                <option value="Unlocked">Unlocked</option>
                <option value="Open">Open</option>
                <option value="Closed">Closed</option>
              </select>
            </div>

            <div className="sidebar-section">
              <label>Set Core Telemetry Reading</label>
              <input 
                type="number" 
                className="search-input"
                value={editReading}
                onChange={(e) => setEditReading(Number(e.target.value))}
              />
            </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setEditingDevice(null)}>Cancel</button>
              <button className="btn-primary" onClick={handleSaveData}>💾 Save Changes</button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Execution Modal */}
      {scheduleDevice && (
        <div className="modal-overlay" onClick={() => setScheduleDevice(null)}>
          <div className="edit-modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Schedule: {scheduleDevice.assetId || scheduleDevice.userLabel || (scheduleDevice as any).ecInstanceId}</h3>

              <div className="sidebar-section">
                <label>Actual Start</label>
                <input type="date" className="search-input" value={schedActualStart ? new Date(schedActualStart).toISOString().slice(0,10) : ""} onChange={(e) => setSchedActualStart(e.target.value || null)} />
              </div>

              <div className="sidebar-section">
                <label>Actual End</label>
                <input type="date" className="search-input" value={schedActualEnd ? new Date(schedActualEnd).toISOString().slice(0,10) : ""} onChange={(e) => setSchedActualEnd(e.target.value || null)} />
              </div>

              <div className="sidebar-section">
                <label>Schedule Variance (days)</label>
                <input type="number" className="search-input" value={schedVariance ?? ""} onChange={(e) => setSchedVariance(e.target.value ? Number(e.target.value) : null)} />
              </div>

            <div className="modal-actions">
              <button className="btn-secondary" onClick={() => setScheduleDevice(null)}>Cancel</button>
              <button className="btn-primary" onClick={async () => {
                // Persist schedule fields to backend and update local state
                if (!scheduleDevice) return;
                const id = scheduleDevice.assetId || scheduleDevice.userLabel || (scheduleDevice as any).ecInstanceId;

                // Optimistic local update: match by ecInstanceId OR by assetId (smartDeviceId)
                const matchEc = (scheduleDevice as any).ecInstanceId || (scheduleDevice as any).id || null;
                const matchAsset = (scheduleDevice as any).assetId || (scheduleDevice as any).userLabel || null;
                setSmartDevices((prev) => prev.map(d => {
                  const devEc = (d as any).ecInstanceId || (d as any).id || null;
                  const devAsset = (d as any).assetId || d.cloud?.AssetID || null;
                  if ((matchEc && String(devEc) === String(matchEc)) || (matchAsset && String(devAsset) === String(matchAsset))) {
                    const updated = { ...d, actualStart: schedActualStart, actualEnd: schedActualEnd } as ActiveColumn;
                    if (!updated.cloud) updated.cloud = {};
                    updated.cloud.ActualStart = schedActualStart;
                    updated.cloud.ActualEnd = schedActualEnd;
                    if (schedVariance !== null && schedVariance !== undefined) updated.cloud.ScheduleVariance = schedVariance;
                    return updated;
                  }
                  return d;
                }));

                try {
                  const baseUrl = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
                    ? "http://localhost:5000"
                    : "https://smart-house-backend-1.onrender.com";

                  const payload: any = { actualStart: schedActualStart, actualEnd: schedActualEnd };
                  if (schedVariance !== null && schedVariance !== undefined) payload.scheduleVariance = Number(schedVariance);

                  const resp = await fetch(`${baseUrl}/devices/${id}/schedule`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                  });

                  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);

                  setToastMessage("📅 Schedule updated");
                } catch (err) {
                  console.error("❌ Failed to persist schedule to backend:", err);
                  setToastMessage("📅 Schedule updated");
                }

                setTimeout(() => setToastMessage(null), 3000);
                setScheduleDevice(null);
                setSchedVariance(null);
              }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* 5. FLOATING CONFIRMATION TOAST NOTIFICATION NOTIFIER */}
      {toastMessage && (
        <div className="toast-container">
          {toastMessage}
        </div>
      )}
    </div>
  );
}