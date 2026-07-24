"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var utils = __toESM(require("@iobroker/adapter-core"));
var import_measurements = require("./lib/measurements");
var import_obi_api = require("./lib/obi-api");
class ObiEnergy extends utils.Adapter {
  api = null;
  device = null;
  pollTimer;
  reconnectTimer;
  liveSocket = null;
  stopping = false;
  polling = false;
  previousEnergy = null;
  constructor(options = {}) {
    super({ ...options, name: "obi-energy" });
    this.on("ready", this.onReady.bind(this));
    this.on("unload", this.onUnload.bind(this));
  }
  async onReady() {
    var _a;
    await this.setState("info.connection", false, true);
    await this.setState("info.lastError", "", true);
    if (!((_a = this.config.email) == null ? void 0 : _a.trim()) || !this.config.password) {
      this.log.error("Please configure the OBI/heyOBI email address and password");
      await this.setState("info.lastError", "Missing email address or password", true);
      return;
    }
    this.api = new import_obi_api.ObiApi({
      email: this.config.email.trim(),
      password: this.config.password,
      debug: (message) => {
        if (this.config.debugApi) {
          this.log.debug(message);
        }
      }
    });
    try {
      await this.refreshDevice();
      await this.poll();
      this.schedulePolling();
      if (this.config.liveEnabled) {
        await this.startLive();
      }
    } catch (error) {
      await this.handleError("Adapter startup", error);
    }
  }
  async refreshDevice() {
    if (!this.api) {
      return;
    }
    this.device = await this.api.discoverDevice();
    await this.setState("device.bridgeId", this.device.bridgeId, true);
    await this.setState("device.sensorId", this.device.sensor.id, true);
    await this.writeOptionalState("device.battery", this.device.sensor.batteryLevel);
    await this.writeOptionalState("device.online", this.device.sensor.isOnline);
    if (this.device.sensor.connectionStrength) {
      await this.setState("device.connectionStrength", this.device.sensor.connectionStrength, true);
    }
    if (this.device.sensor.lastRecordReceivedAt) {
      await this.setState("device.lastRecordReceived", this.device.sensor.lastRecordReceivedAt, true);
    }
  }
  schedulePolling() {
    const minutes = this.numberConfig(this.config.pollIntervalMinutes, 5, 1, 60);
    this.pollTimer = this.setInterval(() => void this.poll(), minutes * 6e4);
  }
  async poll() {
    if (this.polling || !this.api || !this.device) {
      return;
    }
    this.polling = true;
    try {
      const duration = this.numberConfig(this.config.historicalDurationMinutes, 15, 5, 120);
      const records = await this.api.getHistoricalData(
        this.device.bridgeId,
        this.device.sensor.id,
        (0, import_measurements.isoTimestampMinutesAgo)(duration),
        duration
      );
      const energy = (0, import_measurements.latestMeasurement)(records, "energy");
      const feedIn = (0, import_measurements.latestMeasurement)(records, "negative_energy");
      if (energy) {
        await this.writeEnergy(energy.value, energy.time);
      }
      if (feedIn) {
        await this.setState("energy.feedInWh", energyValue(feedIn.value), true);
        await this.setState("energy.feedInKWh", energyValue(feedIn.value) / 1e3, true);
        await this.setState("energy.feedInTime", feedIn.time, true);
      }
      await this.setState("info.connection", true, true);
      await this.setState("info.lastUpdate", (/* @__PURE__ */ new Date()).toISOString(), true);
      await this.setState("info.lastError", "", true);
    } catch (error) {
      await this.handleError("Historical data request", error);
    } finally {
      this.polling = false;
    }
  }
  async writeEnergy(value, time) {
    const currentTimestamp = Date.parse(time) || Date.now();
    const valueWh = energyValue(value);
    await this.setState("energy.consumptionWh", valueWh, true);
    await this.setState("energy.consumptionKWh", valueWh / 1e3, true);
    await this.setState("energy.consumptionTime", time, true);
    if (this.previousEnergy) {
      const averagePower = (0, import_measurements.calculateAveragePower)(
        this.previousEnergy.value,
        this.previousEnergy.timestamp,
        valueWh,
        currentTimestamp
      );
      if (averagePower !== null) {
        await this.setState("energy.calculatedPowerW", Math.round(averagePower), true);
      }
    }
    this.previousEnergy = { value: valueWh, timestamp: currentTimestamp };
  }
  async startLive() {
    if (!this.api || !this.device || this.stopping) {
      return;
    }
    const liveInterval = this.numberConfig(this.config.liveUploadIntervalSeconds, 2, 2, 60);
    const effective = await this.api.setSensorUploadInterval(this.device.sensor.id, liveInterval);
    await this.setState("live.uploadInterval", effective, true);
    this.liveSocket = await this.api.createLiveSocket(this.device.bridgeId, this.device.sensor.id);
    this.liveSocket.on("open", () => {
      void this.setState("live.connected", true, true);
      this.log.info("Live WebSocket connected");
    });
    this.liveSocket.on("message", (data) => void this.handleLiveMessage(rawMessageToString(data)));
    this.liveSocket.on("error", (error) => void this.handleError("Live WebSocket", error));
    this.liveSocket.on("close", () => {
      this.liveSocket = null;
      void this.setState("live.connected", false, true);
      if (!this.stopping) {
        this.scheduleReconnect();
      }
    });
  }
  async handleLiveMessage(raw) {
    var _a;
    try {
      const parsed = JSON.parse(raw);
      const data = (_a = parsed.data) != null ? _a : parsed;
      await this.writeOptionalState("live.rssi", data.rssi);
      await this.writeOptionalState("device.battery", data.battery);
      if (typeof data.power === "number" && Number.isFinite(data.power)) {
        await this.setState("live.powerW", data.power, true);
        await this.setState("live.powerAvailable", true, true);
      } else {
        await this.setState("live.powerAvailable", false, true);
      }
      await this.setState("live.lastUpdate", (/* @__PURE__ */ new Date()).toISOString(), true);
    } catch (error) {
      await this.handleError("Live message parsing", error);
    }
  }
  scheduleReconnect() {
    if (this.reconnectTimer || this.stopping) {
      return;
    }
    this.reconnectTimer = this.setTimeout(() => {
      this.reconnectTimer = void 0;
      void this.startLive().catch((error) => this.handleError("Live reconnect", error));
    }, 1e4);
  }
  async handleError(context, error) {
    const message = error instanceof Error ? error.message : String(error);
    this.log.error(`${context}: ${message}`);
    await this.setState("info.connection", false, true);
    await this.setState("info.lastError", `${context}: ${message}`.slice(0, 500), true);
  }
  async writeOptionalState(id, value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      await this.setState(id, value, true);
    } else if (typeof value === "boolean") {
      await this.setState(id, value, true);
    }
  }
  numberConfig(value, fallback, min, max) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
  }
  onUnload(callback) {
    var _a, _b;
    this.stopping = true;
    if (this.pollTimer) {
      this.clearInterval(this.pollTimer);
    }
    if (this.reconnectTimer) {
      this.clearTimeout(this.reconnectTimer);
    }
    (_a = this.liveSocket) == null ? void 0 : _a.removeAllListeners();
    (_b = this.liveSocket) == null ? void 0 : _b.close();
    const restore = async () => {
      var _a2;
      if (this.api && this.device && this.config.liveEnabled) {
        const normal = this.numberConfig(this.config.normalUploadIntervalSeconds, 300, 60, 3600);
        await this.api.setSensorUploadInterval(this.device.sensor.id, normal);
      }
      await this.setState("live.connected", false, true);
      (_a2 = this.api) == null ? void 0 : _a2.clearToken();
    };
    void restore().catch((error) => this.log.warn(`Could not restore normal sensor interval: ${String(error)}`)).finally(callback);
  }
}
function energyValue(value) {
  return Number.isFinite(value) ? value : 0;
}
function rawMessageToString(data) {
  if (Array.isArray(data)) {
    return Buffer.concat(data).toString("utf8");
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data).toString("utf8");
  }
  return Buffer.from(data).toString("utf8");
}
if (require.main !== module) {
  module.exports = (options) => new ObiEnergy(options);
} else {
  (() => new ObiEnergy())();
}
//# sourceMappingURL=main.js.map
