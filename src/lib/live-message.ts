export interface LivePayload {
	power?: unknown;
	rssi?: unknown;
	battery?: unknown;
}

export interface ParsedLiveMessage {
	event?: string;
	payload: LivePayload;
}

/**
 * OBI may concatenate multiple JSON objects in one WebSocket frame.
 * Parse every complete object without ever logging or returning the raw frame.
 */
export function parseLiveMessages(raw: string): ParsedLiveMessage[] {
	const messages: ParsedLiveMessage[] = [];
	let position = 0;

	while (position < raw.length) {
		while (position < raw.length && /\s/.test(raw[position])) {
			position++;
		}
		if (position >= raw.length) {
			break;
		}

		const end = findJsonObjectEnd(raw, position);
		if (end === null) {
			break;
		}

		try {
			const decoded: unknown = JSON.parse(raw.slice(position, end));
			const parsed = toLiveMessage(decoded);
			if (parsed) {
				messages.push(parsed);
			}
		} catch {
			// Ignore malformed frames. The caller can report that no live payload was found.
		}
		position = end;
	}

	return messages;
}

export function finiteNumber(value: unknown): number | null {
	if (typeof value === 'number') {
		return Number.isFinite(value) ? value : null;
	}
	if (typeof value === 'string' && value.trim() !== '') {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : null;
	}
	return null;
}

export function livePayloadSignature(message: ParsedLiveMessage): string {
	const keys = Object.keys(message.payload).sort();
	const types = keys.map(key => `${key}:${valueType(message.payload[key as keyof LivePayload])}`);
	return `event=${message.event ?? '<none>'}; fields=${types.join(',') || '<none>'}`;
}

function toLiveMessage(decoded: unknown): ParsedLiveMessage | null {
	if (!isRecord(decoded)) {
		return null;
	}

	const event = typeof decoded.event === 'string' ? decoded.event : undefined;
	const nested = decoded.data;
	if (isRecord(nested)) {
		if (event && event !== 'mqttMessage') {
			return null;
		}
		return { event, payload: nested };
	}

	if ('power' in decoded || 'rssi' in decoded || 'battery' in decoded) {
		return { event, payload: decoded };
	}
	return null;
}

function findJsonObjectEnd(raw: string, start: number): number | null {
	const opening = raw[start];
	if (opening !== '{' && opening !== '[') {
		return null;
	}

	let depth = 0;
	let inString = false;
	let escaped = false;
	for (let index = start; index < raw.length; index++) {
		const character = raw[index];
		if (inString) {
			if (escaped) {
				escaped = false;
			} else if (character === '\\') {
				escaped = true;
			} else if (character === '"') {
				inString = false;
			}
			continue;
		}

		if (character === '"') {
			inString = true;
		} else if (character === '{' || character === '[') {
			depth++;
		} else if (character === '}' || character === ']') {
			depth--;
			if (depth === 0) {
				return index + 1;
			}
		}
	}
	return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function valueType(value: unknown): string {
	if (value === null) {
		return 'null';
	}
	if (Array.isArray(value)) {
		return 'array';
	}
	return typeof value;
}
