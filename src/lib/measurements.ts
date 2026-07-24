export interface HistoricalRecord {
	measure?: string;
	value?: number | string | null;
	time?: string;
	timestamp?: string;
}

export interface Measurement {
	value: number;
	time: string;
}

export function measurementTimestamp(record: HistoricalRecord): string {
	const value = record.time ?? record.timestamp;
	return typeof value === 'string' ? value : '';
}

export function latestMeasurement(records: HistoricalRecord[], measure: string): Measurement | null {
	const matching = records
		.filter(record => record?.measure === measure && Number.isFinite(Number(record.value)))
		.sort((a, b) => measurementTimestamp(a).localeCompare(measurementTimestamp(b)));

	const latest = matching.at(-1);
	if (!latest) {
		return null;
	}

	return {
		value: Number(latest.value),
		time: measurementTimestamp(latest),
	};
}

export function calculateAveragePower(
	previousEnergyWh: number,
	previousTimestamp: number,
	currentEnergyWh: number,
	currentTimestamp: number,
): number | null {
	const elapsedHours = (currentTimestamp - previousTimestamp) / 3_600_000;
	const deltaWh = currentEnergyWh - previousEnergyWh;

	if (elapsedHours <= 0 || deltaWh < 0) {
		return null;
	}

	return deltaWh / elapsedHours;
}

export function isoTimestampMinutesAgo(minutes: number, now = Date.now()): string {
	const date = new Date(now - minutes * 60_000);
	return date.toISOString().replace(/\.\d{3}Z$/, '.000Z');
}
