import * as utils from '@iobroker/adapter-core';
import type WebSocket from 'ws';
import { finiteNumber, livePayloadSignature, parseLiveMessages, type LivePayload } from './lib/live-message';
import { calculateAveragePower, isoTimestampMinutesAgo, latestMeasurement } from './lib/measurements';
import { ObiApi, type DiscoveredDevice } from './lib/obi-api';

class ObiEnergy extends utils.Adapter {
	private api: ObiApi | null = null;
	private device: DiscoveredDevice | null = null;
	private pollTimer: ioBroker.Interval | undefined;
	private reconnectTimer: ioBroker.Timeout | undefined;
	private liveSocket: WebSocket | null = null;
	private stopping = false;
	private polling = false;
	private previousEnergy: { value: number; timestamp: number } | null = null;
	private lastLiveDiagnosticSignature: string | null = null;

	public constructor(options: Partial<utils.AdapterOptions> = {}) {
		super({ ...options, name: 'obi-energy' });
		this.on('ready', this.onReady.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}

	private async onReady(): Promise<void> {
		await this.setState('info.connection', false, true);
		await this.setState('info.lastError', '', true);

		if (!this.config.email?.trim() || !this.config.password) {
			this.log.error('Please configure the OBI/heyOBI email address and password');
			await this.setState('info.lastError', 'Missing email address or password', true);
			return;
		}

		this.api = new ObiApi({
			email: this.config.email.trim(),
			password: this.config.password,
			debug: message => {
				if (this.config.debugApi) {
					this.log.debug(message);
				}
			},
		});

		try {
			await this.refreshDevice();
			await this.poll();
			this.schedulePolling();
			if (this.config.liveEnabled) {
				await this.startLive();
			}
		} catch (error) {
			await this.handleError('Adapter startup', error);
		}
	}

	private async refreshDevice(): Promise<void> {
		if (!this.api) {
			return;
		}
		this.device = await this.api.discoverDevice();
		await this.setState('device.bridgeId', this.device.bridgeId, true);
		await this.setState('device.sensorId', this.device.sensor.id, true);
		await this.writeOptionalState('device.battery', this.device.sensor.batteryLevel);
		await this.writeOptionalState('device.online', this.device.sensor.isOnline);
		if (this.device.sensor.connectionStrength) {
			await this.setState('device.connectionStrength', this.device.sensor.connectionStrength, true);
		}
		if (this.device.sensor.lastRecordReceivedAt) {
			await this.setState(
				'device.lastRecordReceived',
				Date.parse(this.device.sensor.lastRecordReceivedAt) || Date.now(),
				true,
			);
		}
	}

	private schedulePolling(): void {
		const minutes = this.numberConfig(this.config.pollIntervalMinutes, 5, 1, 60);
		this.pollTimer = this.setInterval(() => void this.poll(), minutes * 60_000);
	}

	private async poll(): Promise<void> {
		if (this.polling || !this.api || !this.device) {
			return;
		}
		this.polling = true;

		try {
			const duration = this.numberConfig(this.config.historicalDurationMinutes, 15, 5, 120);
			const records = await this.api.getHistoricalData(
				this.device.bridgeId,
				this.device.sensor.id,
				isoTimestampMinutesAgo(duration),
				duration,
			);
			const energy = latestMeasurement(records, 'energy');
			const feedIn = latestMeasurement(records, 'negative_energy');

			if (energy) {
				await this.writeEnergy(energy.value, energy.time);
			}
			if (feedIn) {
				await this.setState('energy.feedInWh', energyValue(feedIn.value), true);
				await this.setState('energy.feedInKWh', energyValue(feedIn.value) / 1000, true);
				await this.setState('energy.feedInTime', Date.parse(feedIn.time) || Date.now(), true);
			}

			await this.setState('info.connection', true, true);
			await this.setState('info.lastUpdate', Date.now(), true);
			await this.setState('info.lastError', '', true);
		} catch (error) {
			await this.handleError('Historical data request', error);
		} finally {
			this.polling = false;
		}
	}

	private async writeEnergy(value: number, time: string): Promise<void> {
		const currentTimestamp = Date.parse(time) || Date.now();
		const valueWh = energyValue(value);
		await this.setState('energy.consumptionWh', valueWh, true);
		await this.setState('energy.consumptionKWh', valueWh / 1000, true);
		await this.setState('energy.consumptionTime', currentTimestamp, true);

		if (this.previousEnergy) {
			const averagePower = calculateAveragePower(
				this.previousEnergy.value,
				this.previousEnergy.timestamp,
				valueWh,
				currentTimestamp,
			);
			if (averagePower !== null) {
				await this.setState('energy.calculatedPowerW', Math.round(averagePower), true);
			}
		}
		this.previousEnergy = { value: valueWh, timestamp: currentTimestamp };
	}

	private async startLive(): Promise<void> {
		if (!this.api || !this.device || this.stopping) {
			return;
		}
		const liveInterval = this.numberConfig(this.config.liveUploadIntervalSeconds, 2, 2, 60);
		const effective = await this.api.setSensorUploadInterval(this.device.sensor.id, liveInterval);
		await this.setState('live.uploadInterval', effective, true);

		this.liveSocket = await this.api.createLiveSocket(this.device.bridgeId, this.device.sensor.id);
		this.liveSocket.on('open', () => {
			void this.setState('live.connected', true, true);
			this.log.info('Live WebSocket connected');
		});
		this.liveSocket.on('message', data => void this.handleLiveMessage(rawMessageToString(data)));
		this.liveSocket.on('error', error => void this.handleError('Live WebSocket', error));
		this.liveSocket.on('close', () => {
			this.liveSocket = null;
			void this.setState('live.connected', false, true);
			if (!this.stopping) {
				this.scheduleReconnect();
			}
		});
	}

	private async handleLiveMessage(raw: string): Promise<void> {
		try {
			const messages = parseLiveMessages(raw);
			if (messages.length === 0) {
				if (this.config.debugApi) {
					this.log.debug('Live WebSocket frame contained no supported OBI live payload');
				}
				return;
			}

			for (const message of messages) {
				await this.handleLivePayload(message.payload);
				if (this.config.debugApi) {
					const signature = livePayloadSignature(message);
					if (signature !== this.lastLiveDiagnosticSignature) {
						this.lastLiveDiagnosticSignature = signature;
						this.log.debug(`Live payload structure: ${signature}`);
					}
				}
			}
			await this.setState('live.lastUpdate', Date.now(), true);
		} catch (error) {
			await this.handleError('Live message parsing', error);
		}
	}

	private async handleLivePayload(data: LivePayload): Promise<void> {
		await this.writeOptionalState('live.rssi', finiteNumber(data.rssi));
		await this.writeOptionalState('device.battery', finiteNumber(data.battery));

		const power = finiteNumber(data.power);
		if (power !== null) {
			await this.setState('live.powerW', power, true);
			await this.setState('live.powerAvailable', true, true);
		} else {
			await this.setState('live.powerAvailable', false, true);
		}
	}

	private scheduleReconnect(): void {
		if (this.reconnectTimer || this.stopping) {
			return;
		}
		this.reconnectTimer = this.setTimeout(() => {
			this.reconnectTimer = undefined;
			void this.startLive().catch(error => this.handleError('Live reconnect', error));
		}, 10_000);
	}

	private async handleError(context: string, error: unknown): Promise<void> {
		const message = error instanceof Error ? error.message : String(error);
		this.log.error(`${context}: ${message}`);
		await this.setState('info.connection', false, true);
		await this.setState('info.lastError', `${context}: ${message}`.slice(0, 500), true);
	}

	private async writeOptionalState(id: string, value: unknown): Promise<void> {
		if (typeof value === 'number' && Number.isFinite(value)) {
			await this.setState(id, value, true);
		} else if (typeof value === 'boolean') {
			await this.setState(id, value, true);
		}
	}

	private numberConfig(value: unknown, fallback: number, min: number, max: number): number {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
	}

	private onUnload(callback: () => void): void {
		this.stopping = true;
		if (this.pollTimer) {
			this.clearInterval(this.pollTimer);
		}
		if (this.reconnectTimer) {
			this.clearTimeout(this.reconnectTimer);
		}
		this.liveSocket?.removeAllListeners();
		this.liveSocket?.close();

		const restore = async (): Promise<void> => {
			if (this.api && this.device && this.config.liveEnabled) {
				const normal = this.numberConfig(this.config.normalUploadIntervalSeconds, 300, 60, 3600);
				await this.api.setSensorUploadInterval(this.device.sensor.id, normal);
			}
			await this.setState('live.connected', false, true);
			this.api?.clearToken();
		};

		void restore()
			.catch(error => this.log.warn(`Could not restore normal sensor interval: ${String(error)}`))
			.finally(callback);
	}
}

function energyValue(value: number): number {
	return Number.isFinite(value) ? value : 0;
}

function rawMessageToString(data: WebSocket.RawData): string {
	if (Array.isArray(data)) {
		return Buffer.concat(data).toString('utf8');
	}
	if (data instanceof ArrayBuffer) {
		return Buffer.from(data).toString('utf8');
	}
	return Buffer.from(data).toString('utf8');
}

if (require.main !== module) {
	module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new ObiEnergy(options);
} else {
	(() => new ObiEnergy())();
}
