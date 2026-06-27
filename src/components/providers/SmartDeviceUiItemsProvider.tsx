import { IModelApp } from "@itwin/core-frontend";
import { 
    UiItemsProvider, ToolbarUsage, 
    ToolbarOrientation, CommonToolbarItem, 
    StageUsage, ToolbarItemUtilities, 
    StagePanelLocation,StagePanelSection,
    Widget,
        } from "@itwin/appui-react";
        
import { Visualization } from "../Visualization";
import { SmartDeviceDecorator } from "../decorators/SmartDeviceDecorator";
import { SmartDeviceListWidgetComponent } from "../widgets/SmartDeviceListWidgetComponent";


export class SmartDeviceUiItemsProvider implements UiItemsProvider {
  public readonly id = "SmartDeviceUiProvider";
  

    /******************************************** */

    /******************************************** */
  public getToolbarItems(): ReadonlyArray<CommonToolbarItem> {
    const toolbarButtonItems: CommonToolbarItem[] = [];

    // Pass the properties as a single configuration object literal
    

    const toggleSlabsButton: CommonToolbarItem = ToolbarItemUtilities.createActionItem({
      id: "ToggleSlabs",
      itemPriority: 1001,
      icon: "Toggle Slabs",
      label: "Toggle Slabs Tool",
      execute: () => {
        // flip state and call Visualization
        // store toggle state locally on the provider instance
        (this as any)._toggleSlabs = !(this as any)._toggleSlabs;
        if (IModelApp.viewManager.selectedView) {
          Visualization.toggleSlabs(IModelApp.viewManager.selectedView, (this as any)._toggleSlabs);
          // Also toggle visibility for specific slab AssetIDs
          const slabAssetIds = ["SLB-G-001", "SLB-2F-001", "SLB-3F-001"];
          SmartDeviceDecorator.setAssetsVisibleGlobally(slabAssetIds, (this as any)._toggleSlabs);
        }
      },
      layouts: {
        standard: {
          usage: ToolbarUsage.ContentManipulation,
          orientation: ToolbarOrientation.Vertical
        }
      }
    });

    toolbarButtonItems.push(toggleSlabsButton);
    return toolbarButtonItems;
  }

    /******************************************** */

    /******************************************** */
  public getWidgets(): ReadonlyArray<Widget> {
    const widgets: Widget[] = [];

    // Define the widget configuration
    const widget: Widget = {
      id: "smartDeviceListWidget",
      label: "Smart Devices",
      content: <SmartDeviceListWidgetComponent />,
      
      // FIX: Modern AppUI v4 location properties are explicitly defined here
      layouts: {
        standard: {
          location: StagePanelLocation.Right,
          section: StagePanelSection.Start
        }
      }
    };

    widgets.push(widget);
    return widgets;
  }

}
