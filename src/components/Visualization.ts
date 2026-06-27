import {ColorDef, DisplayStyleSettingsProps, QueryRowFormat } from "@itwin/core-common";
import { IModelConnection, ScreenViewport, IModelApp } from "@itwin/core-frontend";
  
export class Visualization {
    private static _previouslyHiddenCategories: string[] = [];
    public static getCategoryIds = async (iModel: IModelConnection): Promise<string[]> => {
        const categoriesToHide = [
            "'Wall 2nd'", "'Wall 1st'", "'Dry Wall 2nd'", "'Dry Wall 1st'",
            "'Brick Exterior'", "'WINDOWS 1ST'", "'WINDOWS 2ND'", 
            "'Ceiling 1st'", "'Ceiling 2nd'", "'Callouts'", "'light fixture'", "'Roof'",
        ];

        const query = `SELECT ECInstanceId
                        FROM Bis.SpatialCategory 
                        WHERE CodeValue IN (${categoriesToHide.toString()})`;

        const results = iModel.createQueryReader(query, undefined, {
            rowFormat: QueryRowFormat.UseJsPropertyNames,
        });
        
        const rows = await results.toArray();
        
        // FIX: Added the closing }); for the map function
        return rows.map((row: any) => {
            // Check every possible property name casing that iTwin uses
            return row.id || row.ecInstanceId || row.ECInstanceId || null;
        }); 
    };

    public static toggleHouseExterior = async (viewport: ScreenViewport, show: boolean) => {
    const categoryIds = await Visualization.getCategoryIds(viewport.iModel);
    viewport.changeCategoryDisplay(categoryIds, show);    // show / hide house exterior.
    }

    public static getSlabCategoryIds = async (iModel: IModelConnection): Promise<string[]> => {
        // First try: common exact names
        const exactNames = ["Slab", "Slab 1st", "Slab 2nd", "Floor Slab"];

        const exactQuery = `SELECT ECInstanceId FROM Bis.SpatialCategory WHERE CodeValue IN (${exactNames.map(n => `'${n}'`).toString()})`;
        const exactResults = iModel.createQueryReader(exactQuery, undefined, { rowFormat: QueryRowFormat.UseJsPropertyNames });
        const exactRows = await exactResults.toArray();

        // Fallback: case-insensitive search on both SpatialCategory and Category
        const likeQuerySpatial = `SELECT ECInstanceId FROM Bis.SpatialCategory WHERE LOWER(CodeValue) LIKE '%slab%' OR LOWER(CodeValue) LIKE '%floor%'`;
        const likeQueryCategory = `SELECT ECInstanceId FROM Bis.Category WHERE LOWER(CodeValue) LIKE '%slab%' OR LOWER(CodeValue) LIKE '%floor%'`;

        const reader1 = iModel.createQueryReader(likeQuerySpatial, undefined, { rowFormat: QueryRowFormat.UseJsPropertyNames });
        const reader2 = iModel.createQueryReader(likeQueryCategory, undefined, { rowFormat: QueryRowFormat.UseJsPropertyNames });

        const rows1 = await reader1.toArray();
        const rows2 = await reader2.toArray();

        const combined = [...exactRows, ...rows1, ...rows2];

        const ids = combined
            .map((row: any) => row.id || row.ecInstanceId || row.ECInstanceId || null)
            .filter((v: any) => !!v);

        // Deduplicate
        return Array.from(new Set(ids));
    }

    public static toggleSlabs = async (viewport: ScreenViewport, show: boolean) => {
        const categoryIds = await Visualization.getSlabCategoryIds(viewport.iModel);
        if (categoryIds && categoryIds.length > 0) {
            viewport.changeCategoryDisplay(categoryIds, show);
            try {
                viewport.invalidateScene();
            } catch (e) { /* ignore */ }
            try { IModelApp.viewManager.invalidateDecorationsAllViews(); } catch (e) { /* ignore */ }
        } else {
            // No categories found — ensure the viewport redraws so user can see no-op
            try { viewport.invalidateScene(); } catch (e) { /* ignore */ }
        }
    }

    // Show only the provided elements (by ECInstanceId) by hiding all categories then re-enabling
    // categories that own the specified elements. This is a coarse but effective approach.
    public static showOnlyElements = async (viewport: ScreenViewport, ecInstanceIds: string[]) => {
        if (!viewport || !viewport.iModel) return;

        // 1) hide all known categories first
        try {
            const allCatsReader = viewport.iModel.createQueryReader(`SELECT ECInstanceId FROM Bis.SpatialCategory`, undefined, { rowFormat: QueryRowFormat.UseJsPropertyNames });
            const allCats = await allCatsReader.toArray();
            const allCatIds = allCats.map((r: any) => r.id || r.ecInstanceId || r.ECInstanceId).filter((v: any) => !!v);
            if (allCatIds.length > 0) {
                viewport.changeCategoryDisplay(allCatIds, false);
                Visualization._previouslyHiddenCategories = allCatIds;
            }
        } catch (e) {
            // ignore
        }

        if (!ecInstanceIds || ecInstanceIds.length === 0) {
            try { viewport.invalidateScene(); } catch {};
            return;
        }

        // 2) find categories for the requested elements
        try {
                // Build a safe list for ECSQL: accept numeric/hex literals without quotes, otherwise quote strings
                const list = ecInstanceIds.map((id) => {
                    const s = String(id).trim();
                    if (/^0x[0-9a-f]+$/i.test(s) || /^\d+$/.test(s)) return s; // numeric or hex literal
                    return `'${s.replace(/'/g, "''")}'`;
                }).join(",");

                const q = `SELECT DISTINCT Category.Id as cid FROM Bis.PhysicalElement WHERE ECInstanceId IN (${list})`;
                const reader = viewport.iModel.createQueryReader(q, undefined, { rowFormat: QueryRowFormat.UseJsPropertyNames });
                const rows = await reader.toArray();

                const catIds = rows.map((r: any) => {
                    if (!r) return null;
                    // The property might be named `cid`, `CID`, `categoryId` or nested object
                    const cid = r.cid ?? r.CID ?? r.categoryId ?? r.Category ?? null;
                    if (!cid) return null;
                    if (typeof cid === 'object') return cid.id || cid.ecInstanceId || cid.ECInstanceId || null;
                    return cid;
                }).filter((v: any) => !!v);

                if (catIds.length > 0) {
                    // Ensure unique ids
                    const unique = Array.from(new Set(catIds));
                    viewport.changeCategoryDisplay(unique, true);
                } else {
                    // No categories found for the provided element ids — log for debugging
                    // eslint-disable-next-line no-console
                    console.debug("Visualization.showOnlyElements: no category IDs found for elements", ecInstanceIds);
                }
        } catch (e) {
            // ignore
        }

        try { viewport.invalidateScene(); } catch (e) { /* ignore */ }
        try { IModelApp.viewManager.invalidateDecorationsAllViews(); } catch (e) { /* ignore */ }
    }

    // Restore categories previously hidden by showOnlyElements
    public static restoreAllCategories = async (viewport: ScreenViewport) => {
        if (!viewport || !viewport.iModel) return;
        try {
            const ids = Visualization._previouslyHiddenCategories || [];
            if (ids.length > 0) {
                viewport.changeCategoryDisplay(ids, true);
                Visualization._previouslyHiddenCategories = [];
            }
        } catch (e) {
            // ignore
        }
        try { viewport.invalidateScene(); } catch (e) { /* ignore */ }
        try { IModelApp.viewManager.invalidateDecorationsAllViews(); } catch (e) { /* ignore */ }
    }

        // Method for changing view background color. 
        public static changeBackground = (viewport: ScreenViewport, bgColor: string) => {
            const tbgr = ColorDef.fromString(bgColor).tbgr;
            const displayStyleProps: DisplayStyleSettingsProps = { backgroundColor: tbgr };

            try {
                viewport.overrideDisplayStyle(displayStyleProps);
            } catch (e) {
                // ignore
            }

            // Retry a few times in case something else overwrites the display style during startup
            let attempts = 0;
            const maxAttempts = 6;
            const delay = 200;
            const checkAndApply = () => {
                try {
                    const current = (viewport.view && (viewport.view.displayStyle as any)?.backgroundColor) as number | undefined;
                    if (current !== tbgr && attempts < maxAttempts) {
                        try { viewport.overrideDisplayStyle(displayStyleProps); } catch (e) { /* ignore */ }
                        attempts++;
                        setTimeout(checkAndApply, delay);
                    } else {
                        try { viewport.invalidateScene(); } catch (e) { /* ignore */ }
                        try { IModelApp.viewManager.invalidateDecorationsAllViews(); } catch (e) { /* ignore */ }
                    }
                } catch (e) {
                    if (attempts < maxAttempts) {
                        attempts++;
                        setTimeout(checkAndApply, delay);
                    }
                }
            };

            setTimeout(checkAndApply, delay);
        }
}
