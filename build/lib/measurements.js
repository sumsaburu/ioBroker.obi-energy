"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var measurements_exports = {};
__export(measurements_exports, {
  calculateAveragePower: () => calculateAveragePower,
  isoTimestampMinutesAgo: () => isoTimestampMinutesAgo,
  latestMeasurement: () => latestMeasurement,
  measurementTimestamp: () => measurementTimestamp
});
module.exports = __toCommonJS(measurements_exports);
function measurementTimestamp(record) {
  var _a;
  const value = (_a = record.time) != null ? _a : record.timestamp;
  return typeof value === "string" ? value : "";
}
function latestMeasurement(records, measure) {
  const matching = records.filter((record) => (record == null ? void 0 : record.measure) === measure && Number.isFinite(Number(record.value))).sort((a, b) => measurementTimestamp(a).localeCompare(measurementTimestamp(b)));
  const latest = matching.at(-1);
  if (!latest) {
    return null;
  }
  return {
    value: Number(latest.value),
    time: measurementTimestamp(latest)
  };
}
function calculateAveragePower(previousEnergyWh, previousTimestamp, currentEnergyWh, currentTimestamp) {
  const elapsedHours = (currentTimestamp - previousTimestamp) / 36e5;
  const deltaWh = currentEnergyWh - previousEnergyWh;
  if (elapsedHours <= 0 || deltaWh < 0) {
    return null;
  }
  return deltaWh / elapsedHours;
}
function isoTimestampMinutesAgo(minutes, now = Date.now()) {
  const date = new Date(now - minutes * 6e4);
  return date.toISOString().replace(/\.\d{3}Z$/, ".000Z");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  calculateAveragePower,
  isoTimestampMinutesAgo,
  latestMeasurement,
  measurementTimestamp
});
//# sourceMappingURL=measurements.js.map
