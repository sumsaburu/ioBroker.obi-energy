import { expect } from 'chai';
import { finiteNumber, livePayloadSignature, parseLiveMessages } from './live-message';

describe('live message helpers', () => {
	it('parses an OBI mqttMessage payload', () => {
		const messages = parseLiveMessages('{"event":"mqttMessage","data":{"power":412.5,"rssi":-73,"battery":88}}');

		expect(messages).to.deep.equal([
			{
				event: 'mqttMessage',
				payload: { power: 412.5, rssi: -73, battery: 88 },
			},
		]);
	});

	it('parses concatenated JSON objects and ignores unrelated events', () => {
		const messages = parseLiveMessages(
			'{"event":"connected","data":{"status":"ok"}}' +
				'{"event":"mqttMessage","data":{"power":"123"}}\n' +
				'{"power":456}',
		);

		expect(messages).to.have.length(2);
		expect(messages[0].payload.power).to.equal('123');
		expect(messages[1].payload.power).to.equal(456);
	});

	it('accepts finite numeric strings', () => {
		expect(finiteNumber(' 123.5 ')).to.equal(123.5);
		expect(finiteNumber(42)).to.equal(42);
		expect(finiteNumber(null)).to.equal(null);
		expect(finiteNumber('not-a-number')).to.equal(null);
	});

	it('describes only field names and value types', () => {
		const [message] = parseLiveMessages('{"event":"mqttMessage","data":{"power":null,"rssi":-60,"battery":"90"}}');

		expect(livePayloadSignature(message)).to.equal(
			'event=mqttMessage; fields=battery:string,power:null,rssi:number',
		);
	});
});
