export class SmartDeviceAPI {

    public static async getData() {

        // Fetch local blob that maps element ECInstanceId => metadata (AssetID, Status, etc.)
        const response = await fetch('/blob.json');
        const deviceData = await response.json();

        // Normalize to a lookup keyed by ecInstanceId (supports array or already-keyed object)
        const lookup: Record<string, any> = {};
        if (Array.isArray(deviceData)) {
            for (const item of deviceData) {
                const key = item.ECInstanceId || item.ecInstanceId || item.id || item.ECINSTANCEID;
                if (key) lookup[String(key)] = item;
            }
        } else if (deviceData && typeof deviceData === 'object') {
            // assume already keyed by ECInstanceId
            Object.keys(deviceData).forEach(k => { lookup[String(k)] = deviceData[k]; });
        }

        // Attempt to merge persisted schedule values from backend if available
        try {
            const baseUrl = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
                ? "http://localhost:5000"
                : "https://smart-house-backend-1.onrender.com";
            const resp = await fetch(`${baseUrl}/devices/full`);
            if (resp.ok) {
                const rows = await resp.json();
                // Rows include ecInstanceId and schedule columns; merge into lookup keyed by ecInstanceId.
                // If ecInstanceId doesn't match, try to find the blob entry by AssetID (smartDeviceId) and merge there.
                for (const r of rows) {
                    let targetKey: string | null = null;
                    if (r.ecInstanceId) {
                        const candidate = String(r.ecInstanceId);
                        if (lookup[candidate]) targetKey = candidate;
                        else targetKey = candidate; // still allow creating a slot if needed
                    }

                    // If targetKey not present in lookup, try to match by AssetID
                    if ((!targetKey || !lookup[targetKey]) && r.smartDeviceId) {
                        const match = Object.keys(lookup).find(k => {
                            const entry = lookup[k] || {};
                            const a = (entry.AssetID || entry.AssetId || entry.assetId || entry.AssetID)?.toString?.() || "";
                            return a.toLowerCase() === String(r.smartDeviceId).toLowerCase();
                        });
                        if (match) targetKey = match;
                    }

                    // If still no matching key, but we have ecInstanceId, create an entry under that key
                    if (!targetKey && r.ecInstanceId) targetKey = String(r.ecInstanceId);

                    if (targetKey) {
                        if (!lookup[targetKey]) lookup[targetKey] = {};
                        if (r.actualStart) lookup[targetKey].ActualStart = r.actualStart;
                        if (r.actualEnd) lookup[targetKey].ActualEnd = r.actualEnd;
                        if (r.scheduleVariance !== undefined && r.scheduleVariance !== null) lookup[targetKey].ScheduleVariance = r.scheduleVariance;
                        if (r.smartDeviceId) lookup[targetKey].AssetID = r.smartDeviceId;
                    }
                }
            }
        } catch (e) {
            // ignore backend merge errors; return blob.json as-is
        }

        return lookup;
    }

}