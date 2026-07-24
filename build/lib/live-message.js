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
var live_message_exports = {};
__export(live_message_exports, {
  finiteNumber: () => finiteNumber,
  livePayloadSignature: () => livePayloadSignature,
  parseLiveMessages: () => parseLiveMessages
});
module.exports = __toCommonJS(live_message_exports);
function parseLiveMessages(raw) {
  const messages = [];
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
      const decoded = JSON.parse(raw.slice(position, end));
      const parsed = toLiveMessage(decoded);
      if (parsed) {
        messages.push(parsed);
      }
    } catch {
    }
    position = end;
  }
  return messages;
}
function finiteNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
function livePayloadSignature(message) {
  var _a;
  const keys = Object.keys(message.payload).sort();
  const types = keys.map((key) => `${key}:${valueType(message.payload[key])}`);
  return `event=${(_a = message.event) != null ? _a : "<none>"}; fields=${types.join(",") || "<none>"}`;
}
function toLiveMessage(decoded) {
  if (!isRecord(decoded)) {
    return null;
  }
  const event = typeof decoded.event === "string" ? decoded.event : void 0;
  const nested = decoded.data;
  if (isRecord(nested)) {
    if (event && event !== "mqttMessage") {
      return null;
    }
    return { event, payload: nested };
  }
  if ("power" in decoded || "rssi" in decoded || "battery" in decoded) {
    return { event, payload: decoded };
  }
  return null;
}
function findJsonObjectEnd(raw, start) {
  const opening = raw[start];
  if (opening !== "{" && opening !== "[") {
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
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === "{" || character === "[") {
      depth++;
    } else if (character === "}" || character === "]") {
      depth--;
      if (depth === 0) {
        return index + 1;
      }
    }
  }
  return null;
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function valueType(value) {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  finiteNumber,
  livePayloadSignature,
  parseLiveMessages
});
//# sourceMappingURL=live-message.js.map
