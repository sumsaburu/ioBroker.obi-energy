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

## Configuration

Create an adapter instance and enter the email address and password of the
OBI/heyOBI account. Leave the experimental live mode disabled for the initial
setup. After the first successful update, cumulative readings and device
information are available below the adapter instance.

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

## Hourly consumption with InfluxDB and Grafana

For hourly energy charts, store the cumulative kWh counters rather than
`live.powerW` or `energy.calculatedPowerW`.

1. In ioBroker, open **Objects** and enable history for these states in the
   InfluxDB adapter:
   - `obi-energy.0.energy.consumptionKWh`
   - `obi-energy.0.energy.feedInKWh` when feed-in is available
2. Keep **Store changes only** enabled. The adapter writes cumulative meter
   readings, so Grafana must calculate the difference between consecutive
   hourly values.

The exact bucket, measurement, and field names depend on your ioBroker
InfluxDB adapter configuration. Before copying a query, determine these values
in InfluxDB's **Data Explorer** or Grafana's **Explore** view:

- `<BUCKET_NAME>`: the bucket selected in your InfluxDB 2.x data source
- `<CONSUMPTION_MEASUREMENT>`: the measurement containing
  `obi-energy.0.energy.consumptionKWh`
- `<FEED_IN_MEASUREMENT>`: the measurement containing
  `obi-energy.0.energy.feedInKWh`
- `<FIELD_NAME>`: usually `value`, but this must be verified in your data

The measurement is often the complete ioBroker state ID, but prefixes and
aliases configured in the InfluxDB adapter can change it.

### InfluxDB 2.x (Flux)

Create a Grafana **Bar chart** panel and replace all placeholders with the
names from your installation:

```flux
from(bucket: "<BUCKET_NAME>")
  |> range(start: v.timeRangeStart, stop: v.timeRangeStop)
  |> filter(fn: (r) =>
    r._measurement == "<CONSUMPTION_MEASUREMENT>" and
    r._field == "<FIELD_NAME>"
  )
  |> aggregateWindow(every: 1h, fn: last, createEmpty: false)
  |> difference(nonNegative: true)
  |> yield(name: "Hourly consumption")
```

For hourly feed-in, use the same query and replace
`<CONSUMPTION_MEASUREMENT>` with `<FEED_IN_MEASUREMENT>`.

### InfluxDB 1.x (InfluxQL)

Replace the measurement and field placeholders with the names shown by
Grafana's query editor:

```sql
SELECT non_negative_difference(last("<FIELD_NAME>"), 1h) AS "Consumption"
FROM "<CONSUMPTION_MEASUREMENT>"
WHERE $timeFilter
GROUP BY time(1h) fill(null)
```

For hourly feed-in, use:

```sql
SELECT non_negative_difference(last("<FIELD_NAME>"), 1h) AS "Feed-in"
FROM "<FEED_IN_MEASUREMENT>"
WHERE $timeFilter
GROUP BY time(1h) fill(null)
```

Set the Grafana unit to **Energy → kilowatt-hour (kWh)** and the minimum
interval to `1h`.

`difference(nonNegative: true)` in Flux and `non_negative_difference` in
InfluxQL prevent a meter reset or counter rollover from appearing as a large
negative hourly value. Empty hours should remain `null`; filling them with zero
can hide missing OBI readings. The first visible hour can be empty because a
difference requires a preceding value.

## Security and privacy

- The password is encrypted by ioBroker and hidden in the protected native
  configuration.
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

## Changelog

### 0.1.4

- prepared the adapter for review by the official ioBroker repository
- added complete configuration translations
- improved responsive configuration layout and metadata
- updated the test and release workflows

### 0.1.3

- added flexible InfluxDB 1.x/2.x and Grafana examples

### 0.1.2

- clarified live mode behaviour and power availability

### 0.1.1

- improved live message parsing and privacy-safe diagnostics

### 0.1.0

- initial experimental adapter with historical data and optional live mode

## License

MIT License

Copyright (c) 2026 Gerke Eckhoff and contributors
