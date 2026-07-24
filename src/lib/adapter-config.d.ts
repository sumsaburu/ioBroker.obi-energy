// This file extends the AdapterConfig type from "@iobroker/types"

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
	namespace ioBroker {
		interface AdapterConfig {
			email: string;
			password: string;
			pollIntervalMinutes: number;
			historicalDurationMinutes: number;
			liveEnabled: boolean;
			liveUploadIntervalSeconds: number;
			normalUploadIntervalSeconds: number;
			debugApi: boolean;
		}
	}
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};
