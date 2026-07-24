# ioBroker OBI Energy adapter

[![Tests](https://github.com/sumsaburu/ioBroker.obi-energy/actions/workflows/test-and-release.yml/badge.svg)](https://github.com/sumsaburu/ioBroker.obi-energy/actions/workflows/test-and-release.yml)

Experimental ioBroker adapter for the OBI Energy Tracker. It connects to the unofficial OBI/heyOBI API and exposes cumulative electricity consumption, feed-in data when available, device information and optional live data.

> This is an unofficial community project. It is not affiliated with, endorsed by or supported by OBI or heyOBI. The undocumented API may change at any time.

## Features

- login with an OBI/heyOBI account
- automatic detection of the first bridge and sensor
- cumulative grid consumption in Wh and kWh
- cumulative grid feed-in in Wh and kWh, when supplied by the meter
- calculated average power based on consecutive historical meter readings
- sensor battery, online state and connection information
- optional experimental WebSocket mode for power, RSSI and battery
- automatic token renewal and WebSocket reconnect
- restoration of the normal sensor interval on adapter shutdown
- protected password field in the ioBroker instance configuration

## Installation for testing

The adapter has not yet been published to npm or the official ioBroker repository.

1. In ioBroker Admin, open **Adapters**.
2. Use **Install from custom URL**.
3. Enter:

   ```text
   https://github.com/sumsaburu/ioBroker.obi-energy
   ```

4. Create an instance.
5. Enter the email address and password of the OBI/heyOBI account.
6. Leave the experimental live mode disabled for the first test.

## States

The adapter creates states below `obi-energy.0`:

- `energy.consumptionWh` and `energy.consumptionKWh`
- `energy.feedInWh` and `energy.feedInKWh`
- `energy.calculatedPowerW`
- `device.battery`, `device.online` and connection details
- `live.powerW`, `live.rssi` and live connection information
- `info.connection`, `info.lastUpdate` and `info.lastError`

`energy.calculatedPowerW` is an average calculated from consecutive cumulative readings. It is not a real-time measurement.

## Live mode

Live mode changes the sensor upload interval and connects to OBI's WebSocket
service. The adapter requests instantaneous power, RSSI and battery data. Values
are written whenever OBI includes them in the live payload.

If OBI returns `power: null`, `live.powerAvailable` is set to `false` and
`live.powerW` is left unchanged. This indicates that the OBI live endpoint did
not provide a power value; it is not treated as zero. The heyOBI app may still
show a value obtained or calculated through a different internal mechanism.

Live mode can increase sensor activity and is disabled by default.

When API debug logging is enabled, the adapter logs only live payload field names
and value types. Raw WebSocket messages, credentials, tokens and device
identifiers are never included in this diagnostic output.

`energy.calculatedPowerW` remains available as an average calculated from
consecutive cumulative meter readings. With the default polling interval it is
not an instantaneous measurement.

## Hourly consumption with InfluxDB 1.x and Grafana

For hourly energy charts, store the cumulative kWh counters rather than
`live.powerW` or `energy.calculatedPowerW`.

1. In ioBroker, open **Objects** and enable history for these states in the
   InfluxDB adapter:
   - `obi-energy.0.energy.consumptionKWh`
   - `obi-energy.0.energy.feedInKWh` when feed-in is available
2. Keep **Store changes only** enabled. The adapter writes cumulative meter
   readings, so Grafana must calculate the difference between consecutive
   hourly values.
3. In Grafana, create a **Bar chart** panel and use this InfluxQL query for
   hourly consumption:

```sql
SELECT non_negative_difference(last("value"), 1h) AS "Consumption"
FROM "obi-energy.0.energy.consumptionKWh"
WHERE $timeFilter
GROUP BY time(1h) fill(null)
```

For hourly feed-in, use:

```sql
SELECT non_negative_difference(last("value"), 1h) AS "Feed-in"
FROM "obi-energy.0.energy.feedInKWh"
WHERE $timeFilter
GROUP BY time(1h) fill(null)
```

Set the Grafana unit to **Energy → kilowatt-hour (kWh)**. Depending on the
InfluxDB adapter configuration, the measurement name may include a configured
prefix or differ from the full ioBroker state ID. Select the exact measurement
shown by Grafana's query editor in that case.

`non_negative_difference` prevents a meter reset or counter rollover from
appearing as a large negative hourly value. Empty hours should remain `null`;
filling them with zero can hide missing OBI readings.

## Security and privacy

- The password is stored in ioBroker's protected native configuration.
- Login tokens are held in memory only.
- Passwords and tokens are never logged.
- Detailed API logging can contain device identifiers. Anonymise logs before publishing them.
- Never place real credentials in issues, pull requests or repository files.

## Development

```bash
npm install
npm run check
npm run lint
npm test
npm run build
```

The adapter was generated with the official `@iobroker/create-adapter` tool.

## Attribution

The API behaviour and constants are based on the MIT-licensed Home Assistant integration [Karo-X/obi_energy](https://github.com/Karo-X/obi_energy) and the earlier experimental script [sumsaburu/iobroker-obi-energy-script](https://github.com/sumsaburu/iobroker-obi-energy-script).

## License

MIT License

Copyright (c) 2026 Gerke Eckhoff and contributors

---

## Deutsche Kurzbeschreibung

Dieser experimentelle Adapter bindet den OBI Energy Tracker über die inoffizielle OBI-/heyOBI-API an ioBroker an. Für den ersten Test sollte der Live-Modus deaktiviert bleiben. Nach der Installation werden die Zugangsdaten in der Instanzkonfiguration eingetragen. Bitte niemals Zugangsdaten oder Tokens in Protokollen, Issues oder Repository-Dateien veröffentlichen.
