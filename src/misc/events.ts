import { EventEmitter } from "./event-emitter";
import { documentRef } from "./window";

export const UPLOAD_EVENTS = ["load", "loadend", "loadstart"];
export const COMMON_EVENTS = ["progress", "abort", "error", "timeout"];

const depricatedProp = (p: string) =>
  ["returnValue", "totalSize", "position"].includes(p);

/**
 * 对象合并， 合并 src 到dst中
 * @param src
 * @param dst
 */
export const mergeObjects = function <T = object>(src: object, dst: T): T {
  for (let k in src) {
    if (depricatedProp(k)) {
      continue;
    }
    // @ts-ignore
    const v = src[k];
    try {
      // @ts-ignore
      dst[k] = v;
    } catch (error) {}
  }
  return dst;
};

// proxy events from one emitter to another
export const proxyEvents = function (
  events: string[],
  src: EventEmitter,
  dst: EventEmitter
) {
  const p = (event: string) =>
    // @ts-ignore
    function (e) {
      const clone = {};
      // copies event, with dst emitter inplace of src
      for (let k in e) {
        if (depricatedProp(k)) {
          continue;
        }
        const val = e[k];
        // @ts-ignore
        clone[k] = val === src ? dst : val;
      }
      // emits out the dst
      return dst.dispatchEvent(event, clone);
    };
  // dont proxy manual events
  for (let event of Array.from(events)) {
    if (dst._has(event)) {
      src[`on${event}`] = p(event);
    }
  }
};

// create fake event
export const fakeEvent = function (type: any) {
  if (documentRef && documentRef.createEventObject != null) {
    const msieEventObject = documentRef.createEventObject();
    msieEventObject.type = type;
    return msieEventObject;
  }
  // on some platforms like android 4.1.2 and safari on windows, it appears
  // that new Event is not allowed
  try {
    return new Event(type);
  } catch (error) {
    return { type };
  }
};
