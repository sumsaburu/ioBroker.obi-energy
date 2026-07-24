"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var obi_api_exports = {};
__export(obi_api_exports, {
  ObiApi: () => ObiApi
});
module.exports = __toCommonJS(obi_api_exports);
var import_axios = __toESM(require("axios"));
var import_ws = __toESM(require("ws"));
const LOGIN_URL = "https://www.obi.de/regi/auth/api/public/login";
const API_BASE_URL = "https://energy-tracking-backend.prod-eks.dbs.obi.solutions";
const LIVE_DATA_URL = "wss://energy-tracking-livemode.prod-eks.dbs.obi.solutions/retrieving";
const API_KEY = "Rh57q3vtOPYTf6FtArVN1boy2AyEiIqaGEmnMks7";
const USER_AGENT = "heyOBI APP / iPhone17,2 / 4.9.1 / 560";
const LIVE_USER_AGENT = "app_client";
const ACCEPT_LANGUAGE = "de-DE,de;q=0.9";
const ACCEPT_BRIDGES = "application/vnd.obi.companion.energy-tracking.bridge.v1+json";
const ACCEPT_HISTORICAL = "application/vnd.obi.companion.energy-tracking.historical-record.v1+json";
const ACCEPT_SENSOR = "application/vnd.obi.companion.energy-tracking.sensor.v1+json";
const TOKEN_MAX_AGE_MS = 55 * 6e4;
class ObiApi {
  constructor(options) {
    this.options = options;
    this.http = import_axios.default.create({
      timeout: 3e4,
      validateStatus: () => true
    });
  }
  http;
  token = null;
  tokenObtainedAt = 0;
  async login() {
    var _a, _b, _c, _d, _e;
    const response = await this.http.post(
      LOGIN_URL,
      {
        email: this.options.email,
        password: this.options.password,
        country: "de"
      },
      {
        headers: {
          accept: "*/*",
          "user-agent": USER_AGENT,
          "accept-language": ACCEPT_LANGUAGE,
          cookie: "obi_storeid=527",
          origin: "https://www.obi.de",
          referer: "https://www.obi.de/"
        }
      }
    );
    this.assertSuccess(response, "OBI login");
    const token = (_e = (_c = (_a = response.data) == null ? void 0 : _a.token) != null ? _c : (_b = response.data) == null ? void 0 : _b.authentication_token) != null ? _e : (_d = response.data) == null ? void 0 : _d.access_token;
    if (typeof token !== "string" || !token) {
      throw new Error("OBI login response did not contain a token");
    }
    this.token = token;
    this.tokenObtainedAt = Date.now();
  }
  async discoverDevice() {
    var _a, _b, _c;
    const bridges = await this.authenticatedGet("/bridges", ACCEPT_BRIDGES);
    (_b = (_a = this.options).debug) == null ? void 0 : _b.call(_a, `Received ${Array.isArray(bridges) ? bridges.length : 0} bridge(s)`);
    for (const bridge of bridges != null ? bridges : []) {
      const sensor = (_c = bridge.sensors) == null ? void 0 : _c.find((item) => typeof (item == null ? void 0 : item.id) === "string" && item.id);
      if ((bridge == null ? void 0 : bridge.id) && sensor) {
        return { bridgeId: String(bridge.id), sensor };
      }
    }
    throw new Error("No OBI Energy bridge with a sensor was found");
  }
  async getHistoricalData(bridgeId, sensorId, start, durationMinutes) {
    const interval = `${start}/PT${durationMinutes}M`;
    const path = `/historical-data/${encodeURIComponent(bridgeId)}/${encodeURIComponent(sensorId)}/meter?duration=${encodeURIComponent(interval)}&measures=${encodeURIComponent("energy,negative_energy")}`;
    const result = await this.authenticatedGet(path, ACCEPT_HISTORICAL);
    if (!Array.isArray(result)) {
      throw new Error("Unexpected historical-data response format");
    }
    return result;
  }
  async setSensorUploadInterval(sensorId, uploadInterval) {
    var _a;
    await this.ensureLoggedIn();
    const response = await this.http.patch(
      `${API_BASE_URL}/sensors/${encodeURIComponent(sensorId)}`,
      { id: sensorId, uploadInterval },
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: ACCEPT_SENSOR,
          "Content-Type": ACCEPT_SENSOR,
          "Accept-Language": ACCEPT_LANGUAGE,
          "User-Agent": LIVE_USER_AGENT,
          "X-Platform": "iOS",
          "X-Lib-Version": "26.6.9"
        }
      }
    );
    this.assertSuccess(response, "Changing the sensor upload interval");
    const returned = Number((_a = response.data) == null ? void 0 : _a.uploadInterval);
    return Number.isFinite(returned) ? returned : uploadInterval;
  }
  async createLiveSocket(bridgeId, sensorId) {
    await this.ensureLoggedIn();
    const url = `${LIVE_DATA_URL}?bridgeId=${encodeURIComponent(bridgeId)}&sensorId=${encodeURIComponent(sensorId)}`;
    return new import_ws.default(url, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "*/*",
        "Accept-Language": ACCEPT_LANGUAGE,
        "User-Agent": LIVE_USER_AGENT,
        "X-Platform": "iOS",
        "X-Lib-Version": "26.6.9"
      },
      handshakeTimeout: 3e4,
      perMessageDeflate: true
    });
  }
  clearToken() {
    this.token = null;
    this.tokenObtainedAt = 0;
  }
  async authenticatedGet(path, accept, retry = true) {
    await this.ensureLoggedIn();
    const response = await this.http.get(`${API_BASE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        "x-api-key": API_KEY,
        "x-app-type": "b2c",
        Accept: accept,
        "accept-language": ACCEPT_LANGUAGE,
        "user-agent": USER_AGENT,
        "cache-control": "no-cache",
        pragma: "no-cache"
      }
    });
    if (response.status === 401 && retry) {
      this.clearToken();
      await this.login();
      return this.authenticatedGet(path, accept, false);
    }
    this.assertSuccess(response, "OBI API request");
    return response.data;
  }
  async ensureLoggedIn() {
    if (!this.token || Date.now() - this.tokenObtainedAt >= TOKEN_MAX_AGE_MS) {
      await this.login();
    }
  }
  assertSuccess(response, operation) {
    var _a;
    if (response.status >= 200 && response.status < 300) {
      return;
    }
    const body = typeof response.data === "string" ? response.data : JSON.stringify((_a = response.data) != null ? _a : "");
    throw new Error(`${operation} failed with HTTP ${response.status}: ${body.slice(0, 300)}`);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ObiApi
});
//# sourceMappingURL=obi-api.js.map
