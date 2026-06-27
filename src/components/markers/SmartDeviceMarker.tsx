
import { XAndY, XYAndZ } from "@itwin/core-geometry";
import { BeButtonEvent, IModelApp, Marker, NotifyMessageDetails, OutputMessagePriority, StandardViewId } from "@itwin/core-frontend";
import { DeviceData } from "../apis/DeviceStatusApi";
//import "./SmartDeviceMarker.css";

export class SmartDeviceMarker extends Marker {
    private _smartDeviceId: string;
    private _smartDeviceType: string;
    private _elementId: string;
    private _cloudData: any;
    public visible: boolean = true;

    constructor(location: XYAndZ, size: XAndY, smartDeviceId: string, 
        smartDeviceType: string, cloudData: any, elementId: string) 
    {
        super(location, size);
        this._smartDeviceId = smartDeviceId;
        this._smartDeviceType = smartDeviceType;
        this._elementId = elementId;
        this._cloudData = cloudData || {};
  
        // Use a single universal pin marker for all elements
        this.setImageUrl(`/pin.svg`);
        this.title = this.populateTitle(cloudData);
    }

    public setVisible(v: boolean) {
        this.visible = v;
    }

    public getAssetIdFromCloud(): string | undefined {
        return this._cloudData?.AssetID || this._cloudData?.assetId || undefined;
    }

    private populateTitle(cloudData: any) {
        // cloudData may be an object with flat properties (ECInstanceId, AssetID, Status, etc.)
        const assetId = cloudData?.AssetID || cloudData?.assetId || "—";
        const status = cloudData?.Status || cloudData?.status || "Unknown";
        const floor = cloudData?.Floor || cloudData?.floor || null;
        const concrete = cloudData?.ConcreteStrength || cloudData?.concreteStrength || null;
        const dims = cloudData?.Dimensions || cloudData?.dimensions || null;

        let rows = ``;
        if (assetId) rows += `<tr><th>Asset ID</th><td>${assetId}</td></tr>`;
        if (status) rows += `<tr><th>Status</th><td>${status}</td></tr>`;
        if (floor) rows += `<tr><th>Floor</th><td>${floor}</td></tr>`;
        if (dims) rows += `<tr><th>Dimensions</th><td>${dims}</td></tr>`;
        if (concrete) rows += `<tr><th>Concrete</th><td>${concrete}</td></tr>`;

        // include any remaining keys not shown above
        for (const [key, value] of Object.entries(cloudData || {})) {
            if (["AssetID", "assetId", "Status", "status", "Floor", "floor", "ConcreteStrength", "concreteStrength", "Dimensions", "dimensions"].includes(key))
                continue;
            rows += `<tr><th>${key}</th><td>${String((value === null || value === undefined) ? "" : value)}</td></tr>`;
        }

        const container = document.createElement("div");
        container.className = "smart-marker-popup";
        container.innerHTML = `
            <h3 style="margin:0 0 8px 0">${assetId !== "—" ? assetId : this._smartDeviceId}</h3>
            <table style="border-collapse: collapse; width: 100%;">
                ${rows}
            </table>
        `;

        return container;
    }

    public onMouseButton(_ev: BeButtonEvent): boolean {
    if (!_ev.isDown) return true;
    IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Info, "Element " + this._smartDeviceId + " was clicked on"));
    IModelApp.viewManager.selectedView!.zoomToElements(this._elementId, { animateFrustumChange: true, standardViewId: StandardViewId.RightIso });
    return true;
    }
}