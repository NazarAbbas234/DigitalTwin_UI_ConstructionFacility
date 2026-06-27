import { QueryRowFormat } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { XYZ } from "@itwin/core-geometry";

// Smart Device object.
export interface ColumnElement {
    ecInstanceId: string;
    userLabel: string;
    codeValue?: string;
    origin?: XYZ;
}

export class IModelDataApi {
    // Method for fetching Column / Slab elements from the iModel.
    public static async getColumns(iModel: IModelConnection | undefined): Promise<ColumnElement[]> {
        if (!iModel) {
            console.warn("📡 IModelDataApi: No active iModel connection provided yet.");
            return [];
        }

        // Query PhysicalElement for columns/slabs that have a UserLabel
        const query = `
            SELECT ECInstanceId, UserLabel, CodeValue, Origin
            FROM bis.PhysicalElement
            WHERE UserLabel IS NOT NULL
              AND (LOWER(UserLabel) LIKE '%column%' OR LOWER(UserLabel) LIKE '%slab%')
        `;

        try {
            const reader = iModel.createQueryReader(query, undefined, { rowFormat: QueryRowFormat.UseJsPropertyNames });
            return await reader.toArray();
        } catch (error) {
            console.error("❌ Failed to execute ECSQL Column Query:", error);
            return [];
        }
    }
}