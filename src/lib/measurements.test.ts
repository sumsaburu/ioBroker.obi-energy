import { expect } from 'chai';
import {
	calculateAveragePower,
	isoTimestampMinutesAgo,
	latestMeasurement,
	type HistoricalRecord,
} from './measurements';

describe('measurement helpers', () => {
	it('selects the latest numeric measurement', () => {
		const records: HistoricalRecord[] = [
			{ measure: 'energy', value: 1000, time: '2026-01-01T10:00:00.000Z' },
			{ measure: 'negative_energy', value: 200, time: '2026-01-01T10:05:00.000Z' },
			{ measure: 'energy', value: '1250', time: '2026-01-01T10:05:00.000Z' },
		];

		expect(latestMeasurement(records, 'energy')).to.deep.equal({
			value: 1250,
			time: '2026-01-01T10:05:00.000Z',
		});
	});

	it('calculates average power from cumulative energy', () => {
		const result = calculateAveragePower(10_000, 0, 10_250, 5 * 60_000);
		expect(result).to.equal(3000);
	});

	it('rejects meter resets and invalid time spans', () => {
		expect(calculateAveragePower(10_000, 0, 9000, 300_000)).to.equal(null);
		expect(calculateAveragePower(10_000, 300_000, 10_100, 300_000)).to.equal(null);
	});

	it('creates an OBI-compatible UTC timestamp', () => {
		expect(isoTimestampMinutesAgo(15, Date.parse('2026-01-01T10:15:12.987Z'))).to.equal('2026-01-01T10:00:12.000Z');
	});
});
