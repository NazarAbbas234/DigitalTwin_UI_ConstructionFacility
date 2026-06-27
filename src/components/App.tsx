import "./App.scss";
import {Viewer} from "@itwin/web-viewer-react";
import {FitViewTool,IModelApp,IModelConnection,type ScreenViewport,StandardViewId,} from "@itwin/core-frontend";
import { useCallback, useMemo } from "react";
import { TreeWidget } from "@itwin/tree-widget-react";
import { PropertyGridManager } from "@itwin/property-grid-react";
import {MeasurementActionToolbar,MeasureTools} from "@itwin/measure-tools-react";
import { selectionStorage } from "../selectionStorage";
import { useAuthorizationContext } from "./Authorization";
import { Visualization } from "./Visualization";
import { useToaster } from "@itwin/itwinui-react"; 
import { DeviceStatusApi } from "./apis/DeviceStatusApi";
import { LawnDecorator } from "./decorators/LawnDecorator";
import { SmartDeviceUiItemsProvider } from "./providers/SmartDeviceUiItemsProvider";
import * as React from "react";

interface AppProps {
  iTwinId: string;
  iModelId: string;
  changesetId?: string;
}

export function App({ iTwinId, iModelId, changesetId }: AppProps) {
  const { client: authClient } = useAuthorizationContext();
  const toaster = useToaster();

  const [isAuthenticated, setIsAuthenticated] = React.useState<boolean>(false);
  const [username, setUsername] = React.useState<string>("");
  const [password, setPassword] = React.useState<string>("");
  const [loginError, setLoginError] = React.useState<string>("");

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (username === "admin" && password === "twin2026") {
      setIsAuthenticated(true);
    } else {
      setLoginError("❌ Invalid credentials. Hint: admin / twin2026");
    }
  };

  // 🚀 1. Moved inside and memoized to stabilize 3D Canvas camera loops
  const viewConfiguration = useCallback((viewPort: ScreenViewport) => {
    const tileTreesLoaded = () => {
      return new Promise((resolve, reject) => {
        const start = new Date();
        const intvl = setInterval(() => {
          if (viewPort.areAllTileTreesLoaded) {
            clearInterval(intvl);
            resolve(true);
          }
          const now = new Date();
          if (now.getTime() - start.getTime() > 20000) { // 20-second safety timeout
            clearInterval(intvl);
            reject();
          }
        }, 100);
      });
    };

    void tileTreesLoaded().finally(() => {
      void IModelApp.tools.run(FitViewTool.toolId, viewPort, true, false);
      viewPort.view.setStandardRotation(StandardViewId.Iso);
    });
  }, []);

  // 🚀 2. Wrapped in useMemo so the Viewer doesn't drop layout tracking on state updates
  const viewCreatorOptions = useMemo(
    () => ({ viewportConfigurer: viewConfiguration }),
    [viewConfiguration]
  );

  const onIModelAppInit = useCallback(async () => {
    await TreeWidget.initialize();
    await PropertyGridManager.initialize();
    await MeasureTools.startup();
    MeasurementActionToolbar.setDefaultActionProvider(); 
    const data = await DeviceStatusApi.getData();
    console.log("✅ Device Data:", data);

    IModelApp.viewManager.onViewOpen.addOnce(async (viewport) => {
      const categoryIds = await Visualization.getCategoryIds(viewport.iModel);
      console.debug("Category IDs loaded:", categoryIds);

      viewport.changeCategoryDisplay(categoryIds, false);
      viewport.invalidateScene();

      Visualization.toggleHouseExterior(viewport, false);
      // Ensure background change is applied reliably
      //try { Visualization.changeBackground(viewport, "#add8e6"); } catch (e) { console.warn("changeBackground failed on view open", e); }

      // Create a LawnDecorator as a smaller centered square under the model
      // Add offsetY to shift the lawn in Y direction (positive values move it 'up' in model Y)
      // Anchor at model min Y and push it behind by -10 meters (starts drawing at model min Y + offsetY)
      IModelApp.viewManager.addDecorator(new LawnDecorator(viewport.iModel, { squareSize: 30, zOffset: 0.05, anchorY: 'min', offsetY: 23, offsetX: 6 }));
      // Permanent custom markers disabled: temporary markers on row-click still work.
      // To re-enable permanent markers, re-add: IModelApp.viewManager.addDecorator(new SmartDeviceDecorator(viewport));
      IModelApp.viewManager.invalidateDecorationsAllViews();
    });
    // If a view is already selected (startup or reload), ensure background is applied immediately
    const currentVp = IModelApp.viewManager.selectedView;
    if (currentVp) {
      //try { Visualization.changeBackground(currentVp, "#add8e6"); } catch (e) { console.warn("changeBackground failed on selected view", e); }
    }
    console.debug("Device data loaded:", data);
  }, [toaster]);

  const onIModelConnected = useCallback(async (iModel: IModelConnection) => {
    const message = `Connected to iModel: ${iModel.name}`;
    console.log(message);
  }, []);

  // ====================================================
  // 🔒 INJECT THE AUTHENTICATION RENDERING GUARD HERE:
  // ====================================================
  if (!isAuthenticated) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", background: "#1a1a1a", fontFamily: "sans-serif" }}>
        <form onSubmit={handleLoginSubmit} style={{ background: "#2a2a2a", padding: "40px", borderRadius: "10px", boxShadow: "0 4px 15px rgba(0,0,0,0.5)", width: "320px" }}>
          <h2 style={{ color: "#fff", marginTop: 0, marginBottom: "20px", textAlign: "center" }}>⚡ SmartFacility</h2>
          
          <div style={{ marginBottom: "15px" }}>
            <label style={{ color: "#aaa", display: "block", marginBottom: "5px", fontSize: "12px" }}>Username</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "4px", border: "1px solid #444", background: "#333", color: "#fff", boxSizing: "border-box" }} placeholder="admin" />
          </div>

          <div style={{ marginBottom: "20px" }}>
            <label style={{ color: "#aaa", display: "block", marginBottom: "5px", fontSize: "12px" }}>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "4px", border: "1px solid #444", background: "#333", color: "#fff", boxSizing: "border-box" }} placeholder="••••••••" />
          </div>

          {loginError && <p style={{ color: "#e74c3c", fontSize: "12px", margin: "0 0 15px 0" }}>{loginError}</p>}

          <button type="submit" style={{ width: "100%", padding: "12px", background: "#2ecc71", color: "#fff", border: "none", borderRadius: "4px", fontWeight: "bold", cursor: "pointer" }}>
            Sign In to Dashboard
          </button>
        </form>
      </div>
    );
  }

  // Your original 3D canvas engine loads right here safely after successful authentication match:

  return (
    <Viewer
      iTwinId={iTwinId}
      iModelId={iModelId}
      changeSetId={changesetId}
      authClient={authClient}
      viewCreatorOptions={viewCreatorOptions} // Uses the optimized config link
      enablePerformanceMonitors={true}
      onIModelAppInit={onIModelAppInit}
      onIModelConnected={onIModelConnected}
      mapLayerOptions={{
        BingMaps: {
          key: "key",
          value: import.meta.env.IMJS_BING_MAPS_KEY ?? "",
        },
      }}
      uiProviders={[new SmartDeviceUiItemsProvider()]}
      selectionStorage={selectionStorage}
    />
  );
}