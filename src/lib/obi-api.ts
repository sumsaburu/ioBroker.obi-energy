import axios, { type AxiosInstance, type AxiosResponse } from 'axios';
import WebSocket from 'ws';
import type { HistoricalRecord } from './measurements';

const LOGIN_URL = 'https://www.obi.de/regi/auth/api/public/login';
const API_BASE_URL = 'https://energy-tracking-backend.prod-eks.dbs.obi.solutions';
const LIVE_DATA_URL = 'wss://energy-tracking-livemode.prod-eks.dbs.obi.solutions/retrieving';
const API_KEY = 'Rh57q3vtOPYTf6FtArVN1boy2AyEiIqaGEmnMks7';
const USER_AGENT = 'heyOBI APP / iPhone17,2 / 4.9.1 / 560';
const LIVE_USER_AGENT = 'app_client';
const ACCEPT_LANGUAGE = 'de-DE,de;q=0.9';
const ACCEPT_BRIDGES = 'application/vnd.obi.companion.energy-tracking.bridge.v1+json';
const ACCEPT_HISTORICAL = 'application/vnd.obi.companion.energy-tracking.historical-record.v1+json';
const ACCEPT_SENSOR = 'application/vnd.obi.companion.energy-tracking.sensor.v1+json';
const TOKEN_MAX_AGE_MS = 55 * 60_000;

export interface ObiApiOptions {
	email: string;
	password: string;
	debug?: (message: string) => void;
}

export interface ObiSensor {
	id: string;
	batteryLevel?: number;
	isOnline?: boolean;
	connectionStrength?: string;
	lastRecordReceivedAt?: string;
}

export interface ObiBridge {
	id: string;
	sensors?: ObiSensor[];
}

export interface DiscoveredDevice {
	bridgeId: string;
	sensor: ObiSensor;
}

export class ObiApi {
	private readonly http: AxiosInstance;
	private token: string | null = null;
	private tokenObtainedAt = 0;
	public constructor(private readonly options: ObiApiOptions) {
		this.http = axios.create({
			timeout: 30_000,
			validateStatus: () => true,
		});
	}
	public async login(): Promise<void> {
		const response = await this.http.post(
			LOGIN_URL,
			{
				email: this.options.email,
				password: this.options.password,
				country: 'de',
			},
			{
				headers: {
					accept: '*/*',
					'user-agent': USER_AGENT,
					'accept-language': ACCEPT_LANGUAGE,
					cookie: 'obi_storeid=527',
					origin: 'https://www.obi.de',
					referer: 'https://www.obi.de/',
				},
			},
		);

		this.assertSuccess(response, 'OBI login');
		const token = response.data?.token ?? response.data?.authentication_token ?? response.data?.access_token;
		if (typeof token !== 'string' || !token) {
			throw new Error('OBI login response did not contain a token');
		}

		this.token = token;
		this.tokenObtainedAt = Date.now();
	}
	public async discoverDevice(): Promise<DiscoveredDevice> {
		const bridges = await this.authenticatedGet<ObiBridge[]>('/bridges', ACCEPT_BRIDGES);
		this.options.debug?.(`Received ${Array.isArray(bridges) ? bridges.length : 0} bridge(s)`);

		for (const bridge of bridges ?? []) {
			const sensor = bridge.sensors?.find(item => typeof item?.id === 'string' && item.id);
			if (bridge?.id && sensor) {
				return { bridgeId: String(bridge.id), sensor };
			}
		}

		throw new Error('No OBI Energy bridge with a sensor was found');
	}
	public async getHistoricalData(
		bridgeId: string,
		sensorId: string,
		start: string,
		durationMinutes: number,
	): Promise<HistoricalRecord[]> {
		const interval = `${start}/PT${durationMinutes}M`;
		const path =
			`/historical-data/${encodeURIComponent(bridgeId)}/${encodeURIComponent(sensorId)}/meter` +
			`?duration=${encodeURIComponent(interval)}&measures=${encodeURIComponent('energy,negative_energy')}`;
		const result = await this.authenticatedGet<HistoricalRecord[]>(path, ACCEPT_HISTORICAL);
		if (!Array.isArray(result)) {
			throw new Error('Unexpected historical-data response format');
		}
		return result;
	}
	public async setSensorUploadInterval(sensorId: string, uploadInterval: number): Promise<number> {
		await this.ensureLoggedIn();
		const response = await this.http.patch(
			`${API_BASE_URL}/sensors/${encodeURIComponent(sensorId)}`,
			{ id: sensorId, uploadInterval },
			{
				headers: {
					Authorization: `Bearer ${this.token}`,
					Accept: ACCEPT_SENSOR,
					'Content-Type': ACCEPT_SENSOR,
					'Accept-Language': ACCEPT_LANGUAGE,
					'User-Agent': LIVE_USER_AGENT,
					'X-Platform': 'iOS',
					'X-Lib-Version': '26.6.9',
				},
			},
		);
		this.assertSuccess(response, 'Changing the sensor upload interval');
		const returned = Number(response.data?.uploadInterval);
		return Number.isFinite(returned) ? returned : uploadInterval;
	}
	public async createLiveSocket(bridgeId: string, sensorId: string): Promise<WebSocket> {
		await this.ensureLoggedIn();
		const url =
			`${LIVE_DATA_URL}?bridgeId=${encodeURIComponent(bridgeId)}` + `&sensorId=${encodeURIComponent(sensorId)}`;
		return new WebSocket(url, {
			headers: {
				Authorization: `Bearer ${this.token}`,
				Accept: '*/*',
				'Accept-Language': ACCEPT_LANGUAGE,
				'User-Agent': LIVE_USER_AGENT,
				'X-Platform': 'iOS',
				'X-Lib-Version': '26.6.9',
			},
			handshakeTimeout: 30_000,
			perMessageDeflate: true,
		});
	}
	public clearToken(): void {
		this.token = null;
		this.tokenObtainedAt = 0;
	}

	private async authenticatedGet<T>(path: string, accept: string, retry = true): Promise<T> {
		await this.ensureLoggedIn();
		const response = await this.http.get(`${API_BASE_URL}${path}`, {
			headers: {
				Authorization: `Bearer ${this.token}`,
				'x-api-key': API_KEY,
				'x-app-type': 'b2c',
				Accept: accept,
				'accept-language': ACCEPT_LANGUAGE,
				'user-agent': USER_AGENT,
				'cache-control': 'no-cache',
				pragma: 'no-cache',
			},
		});

		if (response.status === 401 && retry) {
			this.clearToken();
			await this.login();
			return this.authenticatedGet<T>(path, accept, false);
		}

		this.assertSuccess(response, 'OBI API request');
		return response.data as T;
	}

	private async ensureLoggedIn(): Promise<void> {
		if (!this.token || Date.now() - this.tokenObtainedAt >= TOKEN_MAX_AGE_MS) {
			await this.login();
		}
	}

	private assertSuccess(response: AxiosResponse, operation: string): void {
		if (response.status >= 200 && response.status < 300) {
			return;
		}

		const body = typeof response.data === 'string' ? response.data : JSON.stringify(response.data ?? '');
		throw new Error(`${operation} failed with HTTP ${response.status}: ${body.slice(0, 300)}`);
	}
}
