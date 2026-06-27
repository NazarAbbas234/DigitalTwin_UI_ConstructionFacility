import { IModelDataApi, ColumnElement } from "../apis/IModelDataApi";
import { XAndY, XYAndZ } from "@itwin/core-geometry";
import { DeviceData } from "../apis/DeviceStatusApi";
import { QueryRowFormat } from "@itwin/core-common";
import { DecorateContext, Decorator, IModelConnection, ScreenViewport } from "@itwin/core-frontend";
import { SmartDeviceMarker } from "../markers/SmartDeviceMarker";
import { SmartDeviceAPI } from "../../SmartDeviceAPI";
import { UiFramework } from "@itwin/appui-react";

export class SmartDeviceDecorator implements Decorator {
    private _iModel: IModelConnection;
    private _markers: SmartDeviceMarker[];
    private static _instances: SmartDeviceDecorator[] = [];

    constructor(vp: ScreenViewport) {
        this._iModel = vp.iModel;
        this._markers = [];
        this.addMarkers();
        SmartDeviceDecorator._instances.push(this);
    }

    public static async getSmartDeviceData() {
        // Deprecated: keep for compatibility. Prefer `getColumns` below.
        return [] as any[];
    }

    private async addMarkers() {
        // Fetch column elements from the iModel and cloud metadata from blob
        const devices: ColumnElement[] = await IModelDataApi.getColumns(this._iModel);
        const cloudData: DeviceData = await SmartDeviceAPI.getData();
        console.log('Cloud metadata', cloudData);

        devices.forEach((device) => {
            if (!device.origin) return; // skip elements without origin

            const ecId = device.ecInstanceId || device.ECInstanceId || (device as any).id;
            const cloudForElement = cloudData[ecId] || {};

            const smartDeviceMarker = new SmartDeviceMarker(
                { x: device.origin.x, y: device.origin.y, z: device.origin.z },
                { x: 24, y: 24 }, // small pin marker size
                device.userLabel || device.codeValue || ecId,
                'Column',
                cloudForElement,
                ecId as any
            );
            this._markers.push(smartDeviceMarker);
        });
    }

    public decorate(context: DecorateContext): void {
        this._markers.forEach(marker => {
            if (marker.visible) marker.addDecoration(context);
        });
        console.log("SmartDevice decorate called");
    }

    private setAssetsVisible(assetIds: string[], visible: boolean) {
        const set = new Set(assetIds.map(a => String(a)));
        this._markers.forEach(m => {
            const aid = m.getAssetIdFromCloud() || m.title?.toString();
            if (aid && set.has(String(aid))) {
                m.setVisible(visible);
            }
        });
    }

    public static setAssetsVisibleGlobally(assetIds: string[], visible: boolean) {
        SmartDeviceDecorator._instances.forEach(inst => inst.setAssetsVisible(assetIds, visible));
    }
}
