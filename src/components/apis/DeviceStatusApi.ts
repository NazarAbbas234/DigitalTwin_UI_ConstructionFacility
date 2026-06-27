export interface DeviceData {
    [index: string]: any;
}

export class DeviceStatusApi {
    // 🚀 CHOOSE THE BASE URL BASED ON RUNTIME ENVIRONMENT
    private static get baseUrl(): string {
        return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"
            ? "http://localhost:5000"
            : "https://digitaltwin-backend-constructionfacility.onrender.com"; //Paste your real production URL here
    }

    public static async getData(): Promise<DeviceData> {
        const response = await fetch(`${this.baseUrl}/devices`);
        if (!response.ok) throw new Error("Backend fetch failed");
        return response.json(); 
    }

    public static async updateDeviceStatus(deviceId: string, status: string, reading: number): Promise<boolean> {
        try {
            const response = await fetch(`${this.baseUrl}/devices/${deviceId}/status`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ status, reading }),
            });
            return response.ok;
        } catch (error) {
            console.error("❌ Production pipeline write-back failed:", error);
            return false;
        }
    }
}
