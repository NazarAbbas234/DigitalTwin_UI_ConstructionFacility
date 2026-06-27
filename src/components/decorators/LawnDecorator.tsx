import { ColorDef } from "@itwin/core-common";
import { DecorateContext, Decorator, GraphicType, IModelConnection } from "@itwin/core-frontend";
import { Point3d } from "@itwin/core-geometry";

export interface LawnOptions {
    padding?: number; // meters around the house
    zOffset?: number; // offset below project extents low.z
    squareSize?: number; // if provided, draw a centered square with this side length (meters)
    offsetY?: number; // meters to shift the square center along Y (positive moves maxY/up)
    offsetX?: number; // meters to shift the square center along X (positive moves maxX/right)
    anchorY?: 'center' | 'min' | 'max'; // where the square is anchored in Y
}

export class LawnDecorator implements Decorator {
    private _iModel: IModelConnection;
    private _padding: number;
    private _zOffset: number;
    private _squareSize?: number;
    private _offsetY: number;
    private _offsetX: number;
    private _anchorY: 'center' | 'min' | 'max';

    constructor(iModel: IModelConnection, options?: LawnOptions) {
        this._iModel = iModel;
        this._padding = options?.padding ?? 15;
        this._zOffset = options?.zOffset ?? 0.05;
        this._squareSize = options?.squareSize;
        this._offsetY = options?.offsetY ?? 0;
        this._offsetX = options?.offsetX ?? 0;
        this._anchorY = options?.anchorY ?? 'center';
    }

    public setPadding(p: number) { this._padding = p; }
    public setZOffset(z: number) { this._zOffset = z; }
    public setSquareSize(s: number | undefined) { this._squareSize = s; }
    public setOffsetY(y: number) { this._offsetY = y; }
    public setOffsetX(x: number) { this._offsetX = x; }
    public setAnchorY(a: 'center' | 'min' | 'max') { this._anchorY = a; }

    public decorate(context: DecorateContext): void {
        // 1. Get the bounding box coordinates of your specific house model
        const extents = this._iModel.projectExtents;

        // 2. Expand the boundaries slightly so the lawn extends past the walls
        let minX: number;
        let maxX: number;
        let minY: number;
        let maxY: number;

        if (this._squareSize && this._squareSize > 0) {
            const half = this._squareSize / 2;
            const centerX = (extents.low.x + extents.high.x) / 2 + this._offsetX;
            // Anchor handling for Y: center, min (start at extents.low.y), or max (end at extents.high.y)
            if (this._anchorY === 'center') {
                const centerY = (extents.low.y + extents.high.y) / 2 + this._offsetY;
                minX = centerX - half;
                maxX = centerX + half;
                minY = centerY - half;
                maxY = centerY + half;
            } else if (this._anchorY === 'min') {
                // start drawing from the model's min Y and extend positively
                minX = centerX - half;
                maxX = centerX + half;
                minY = extents.low.y + this._offsetY;
                maxY = minY + this._squareSize;
            } else {
                // anchorY === 'max' -> end at model's max Y and extend negatively
                minX = centerX - half;
                maxX = centerX + half;
                maxY = extents.high.y + this._offsetY;
                minY = maxY - this._squareSize;
            }
        } else {
            const padding = this._padding; // meters of padding around the house
            minX = extents.low.x - padding + this._offsetX;
            maxX = extents.high.x + padding + this._offsetX;
            minY = extents.low.y - padding;
            maxY = extents.high.y + padding;
        }
        
        // 3. Set the elevation (Z axis) exactly to the base floor of the house
        const groundZ = extents.low.z - this._zOffset; 

        // 4. Create the graphic builder
        const builder = context.createGraphicBuilder(GraphicType.WorldDecoration);
        
        // Set outline color to blue, fill color to green, and line width to 10
        builder.setSymbology(ColorDef.blue, ColorDef.green, 10);
        
        // 5. Map out the rectangular coordinates relative to the house
        builder.addShape([
            Point3d.create(minX, minY, groundZ),
            Point3d.create(minX, maxY, groundZ),
            Point3d.create(maxX, maxY, groundZ),
            Point3d.create(maxX, minY, groundZ),
        ]);
        
        // Render the completed shape graphic into the viewport canvas
        context.addDecorationFromBuilder(builder);
        console.log("decorate called");
    }
}
