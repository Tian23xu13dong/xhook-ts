import { EventEmitter } from "./misc/event-emitter";
import headers from "./misc/headers";

// patchable types
import XMLHttpRequest, {
  XHookBeforeResponse,
  XHookRequest,
} from "./patch/xmlhttprequest";
import fetch from "./patch/fetch";

// global state
import hooks from "./misc/hooks";

export type XHookRequestHandler = (
  req: XHookRequest,
  done?: Function
) => XHookBeforeResponse;

// the global hooks event emitter is also the global xhook object
// (not the best decision in hindsight)
const xhook = hooks;

type xhook = EventEmitter & {
  before: XHookRequestHandler;
  after: XHookRequestHandler;
  enable: () => void;
  disable: () => void;
  headers: Record<string, string>;
  XMLHttpRequest: typeof XMLHttpRequest;
  fetch: typeof fetch;
};

xhook.EventEmitter = EventEmitter;

// modify hooks
xhook.before = function (handler: XHookRequestHandler, i?: number) {
  if (
    typeof handler !== "function" ||
    (handler.length < 1 && handler.length > 2)
  ) {
    throw "invalid hook";
  }
  return xhook.on("before", handler, i);
};
xhook.after = function (handler: Function, i?: number) {
  if (
    typeof handler !== "function" ||
    (handler.length < 1 && handler.length > 3)
  ) {
    throw "invalid hook";
  }
  return xhook.on("after", handler, i);
};

// globally enable/disable
xhook.enable = function () {
  XMLHttpRequest.patch();
  fetch.patch();
};
xhook.disable = function () {
  XMLHttpRequest.unpatch();
  fetch.unpatch();
};
// expose native objects
xhook.XMLHttpRequest = XMLHttpRequest.Native;
xhook.fetch = fetch.Native;

// expose helpers
xhook.headers = headers.convert;

// enable by default
xhook.enable();

// @ts-ignore
window.xhook = xhook;

export default xhook;
