import { mergeObjects, fakeEvent } from "./events";

export interface EventEmitter {
  _has: (event: string) => boolean;
  addEventListener: (event: string, fn: Function, i?: number) => void;
  removeEventListener: (event: string, fn: Function) => void;
  dispatchEvent: (event: string, target: object) => void;
  listeners: (event: string) => Function[];
  destroy: () => void;
  on: (event: string, fn: Function, i?: number) => void;
  off: (event: string, fn: Function) => void;
  fire: (event: string, target: object) => void;
  once: (event: string, fn: Function) => void;

  [k: string]: any;
}

/**
 * tiny event emitter
 * @constructor
 */
export const EventEmitter = function (nodeStyle?: boolean) {
  // private
  let events: {
    [k: string]: Function[];
  } = {};
  const listeners: (e: string) => Function[] = event =>
    Array.from(events[event] || []);
  //public
  const emitter: EventEmitter = {
    _has: (event: string) => !!(events[event] || emitter[`on${event}`]),
    addEventListener,
    removeEventListener,
    dispatchEvent,

    // add extra aliases
    // @ts-ignore
    listeners: (event: string) => listeners(event),
    destroy: () => (events = {}),
    on: addEventListener,
    off: removeEventListener,
    fire: dispatchEvent,
    once: function (e: string, fn: Function) {
      var fire = function () {
        emitter.off(e, fire);
        return fn.apply(null, arguments);
      };
      return emitter.on(e, fire);
    },
  };

  function addEventListener(event: string, callback: Function, i?: number) {
    events[event] = listeners(event);
    if (events[event].indexOf(callback) >= 0) {
      return;
    }
    i = i === undefined ? events[event].length : i;
    events[event].splice(i, 0, callback);
  }

  function removeEventListener(event: string, callback: Function) {
    // remove all
    if (event === undefined) {
      events = {};
      return;
    }
    // remove all of type event
    if (callback === undefined) {
      events[event] = [];
    }
    // remove particular handler
    const i = listeners(event).indexOf(callback);
    if (i === -1) {
      return;
    }
    listeners(event).splice(i, 1);
  }

  function dispatchEvent(event: string, target: object) {
    if (!nodeStyle) {
      target = mergeObjects(target, fakeEvent(event));
      Object.defineProperty(target, "target", {
        writable: false,
        // @ts-ignore
        value: this,
      });
    }
    const legacylistener = emitter[`on${event}`];
    if (legacylistener) {
      legacylistener.apply(emitter, target);
    }
    const iterable = listeners(event).concat(listeners("*"));
    for (let i = 0; i < iterable.length; i++) {
      const listener = iterable[i];
      listener.apply(emitter, target);
    }
  }

  return emitter;
};
