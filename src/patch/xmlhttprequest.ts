import { windowRef } from "../misc/window";
import {
  proxyEvents,
  mergeObjects,
  COMMON_EVENTS,
  UPLOAD_EVENTS,
} from "../misc/events";
import { EventEmitter } from "../misc/event-emitter";
import headers from "../misc/headers";
import hooks from "../misc/hooks";

const nullify = (res?: any) => (res === undefined ? null : res);

//browser's XMLHttpRequest
const Native = windowRef.XMLHttpRequest;

// @ts-ignore
export interface XHookRequest extends Request {
  async?: boolean;
  headers?: Record<string, string>;
  headerNames?: Record<string, string>;
  status?: number;
  method?: string;
  url?: string;
  user?: string;
  pass?: string;
  body?: any;
  upload?: EventEmitter;
  xhr?: EventEmitter;
}

// @ts-ignore
export interface XHookResponse extends Response {
  async?: boolean;
  headers?: object;
  headerNames?: object;
  status?: number;
  statusText?: string;
  method?: string;
  url?: string;
  finalUrl?: string;
  user?: string;
  pass?: string;
  body?: any;
  data?: string;
  response?: string;
  text?: string;
  xml?: Document | Blob | string;
  needSend?: boolean;
}

export interface XHookXMLHttpRequest extends XMLHttpRequest {}

export type XHookBeforeResponse = string | XHookResponse;

// xhook's XMLHttpRequest
const XHook = function () {
  const ABORTED = -1;
  const xhr = new Native();

  //==========================
  // Extra state
  // @ts-ignore
  let request: XHookRequest = {};
  let status: number | null = null;
  let hasError: boolean | undefined = undefined;
  let transiting: boolean | undefined = undefined;
  let response: XHookResponse;
  let currentState = 0;

  //==========================
  // Private API

  // read results from real xhr into response
  const readHead = function () {
    console.log("readHead ==> read results from real xhr into response");
    // Accessing attributes on an aborted xhr object will throw an 'c00c023f error' in IE9 and lower, don't touch it.
    response.status = status || xhr.status;
    if (status !== ABORTED) {
      response.statusText = xhr.statusText;
    }
    if (status !== ABORTED) {
      const obj = headers.convert(xhr.getAllResponseHeaders()) as object;
      for (let key in obj) {
        // @ts-ignore
        const val = obj[key];
        // @ts-ignore
        if (response.headers && !response.headers[key]) {
          const name = key.toLowerCase();
          // @ts-ignore
          response.headers[name] = val;
        }
      }
      return;
    }
  };

  const readBody = function () {
    console.log("readBody ==> read results from real xhr into response");
    //https://xhr.spec.whatwg.org/
    if (!xhr.responseType || xhr.responseType === "text") {
      response.text = xhr.responseText;
      response.data = xhr.responseText;
      try {
        response.xml = xhr.responseXML;
      } catch (error) {}
      // unable to set responseXML due to response type, we attempt to assign responseXML
      // when the type is text even though it's against the spec due to several libraries
      // and browser vendors who allow this behavior. causing these requests to fail when
      // xhook is installed on a page.
    } else if (xhr.responseType === "document") {
      response.xml = xhr.responseXML;
      response.data = xhr.responseXML;
    } else {
      response.data = xhr.response;
    }
    // new in some browsers
    if ("responseURL" in xhr) {
      response.finalUrl = xhr.responseURL;
    }
  };

  // write response into facade xhr
  const writeHead = function () {
    console.log("writeHead ==> write response into facade xhr ");
    facade.status = response.status;
    facade.statusText = response.statusText;
  };

  const writeBody = function () {
    console.log("writeBody ==> write response into facade xhr");
    if ("text" in response) {
      facade.responseText = response.text;
    }
    if ("xml" in response) {
      facade.responseXML = response.xml;
    }
    if ("data" in response) {
      facade.response = response.data;
    }
    if ("finalUrl" in response) {
      facade.responseURL = response.finalUrl;
    }
  };

  const emitFinal = function () {
    console.log("emitFinal ==> write response into facade xhr");
    if (!hasError) {
      facade.dispatchEvent("load", {});
      facade.dispatchEvent("onload", {});
    }
    facade.dispatchEvent("loadend", {});
    if (hasError) {
      facade.readyState = 0;
    }
  };

  // ensure ready state 0 through 4 is handled
  const emitReadyState = function (n: number) {
    while (n > currentState && currentState < 4) {
      facade.readyState = ++currentState;
      // make fake events for libraries that actually check the type on the event object
      if (currentState === 1) {
        facade.dispatchEvent("loadstart", {});
      }
      if (currentState === 2) {
        writeHead();
      }
      if (currentState === 4) {
        writeHead();
        writeBody();
      }
      facade.dispatchEvent("readystatechange", {});
      // delay final events incase of error
      if (currentState === 4) {
        if (request.async === false) {
          emitFinal();
        } else {
          setTimeout(emitFinal, 0);
        }
      }
    }
  };

  //control facade ready state
  const setReadyState = function (n: number) {
    //emit events until readyState reaches 4
    if (n !== 4) {
      emitReadyState(n);
      return;
    }
    // before emitting 4, run all 'after' hooks in sequence
    const afterHooks = hooks.listeners("after");
    let process = function () {
      if (afterHooks.length > 0) {
        // execute each 'before' hook one at a time
        const hook = afterHooks.shift();
        if (hook && hook.length === 2) {
          hook(request, response);
          process();
        } else if (hook && hook.length === 3 && request.async) {
          hook(request, response, process);
        } else {
          process();
        }
      } else {
        //response ready for reading
        emitReadyState(4);
      }
      return;
    };
    process();
  };

  //==========================
  // Facade XHR
  let facade = EventEmitter();
  request.xhr = facade;

  // Handle the underlying ready state
  xhr.onreadystatechange = function (event: string) {
    console.log(event);
    // pull status and headers
    try {
      if (xhr.readyState === 2) {
        readHead();
      }
    } catch (error) {}
    //pull response data
    if (xhr.readyState === 4) {
      transiting = false;
      readHead();
      readBody();
    }

    setReadyState(xhr.readyState);
  };

  // mark this xhr as errored
  const hasErrorHandler = function () {
    hasError = true;
  };
  facade.addEventListener("error", hasErrorHandler);
  facade.addEventListener("timeout", hasErrorHandler);
  facade.addEventListener("abort", hasErrorHandler);
  // progress means we're current downloading...
  facade.addEventListener("progress", function () {
    if (currentState < 3) {
      setReadyState(3);
    } else if (xhr.readyState <= 3) {
      // until ready (4), each progress event is followed by readystatechange...
      facade.dispatchEvent("readystatechange", {}); // TODO fake an XHR event
    }
  });

  // initialise 'withCredentials' on facade xhr in browsers with it or if explicitly told to do so
  if ("withCredentials" in xhr) {
    facade.withCredentials = false;
  }
  facade.status = 0;

  // initialise all possible event handlers
  for (let event of Array.from([...COMMON_EVENTS, ...UPLOAD_EVENTS])) {
    facade[`on${event}`] = null;
  }

  facade.open = function (
    method: string,
    url: string,
    async?: boolean,
    user?: string,
    pass?: string
  ) {
    // Initailize empty XHR facade
    currentState = 0;
    hasError = false;
    transiting = false;
    // reset request
    request.headers = {};
    request.headerNames = {};
    request.status = 0;
    request.method = method;
    request.url = url;
    request.async = async !== false;
    request.user = user;
    request.pass = pass;
    // reset response
    // @ts-ignore
    response = {};
    response.headers = {};
    // openned facade xhr (not real xhr)
    setReadyState(1);
  };

  facade.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
    // read xhr settings before hooking
    let k,
      modk,
      needSend = true;
    for (k of ["type", "timeout", "withCredentials"]) {
      modk = k === "type" ? "responseType" : k;
      if (modk in facade) {
        // @ts-ignore
        request[k] = facade[modk];
      }
    }

    request.body = body;

    const send = function () {
      //proxy all events from real xhr to facade
      proxyEvents(COMMON_EVENTS, xhr, facade);
      //proxy all upload events from the real to the upload facade
      if (facade.upload) {
        proxyEvents(
          [...COMMON_EVENTS, ...UPLOAD_EVENTS],
          xhr.upload,
          facade.upload
        );
      }

      //prepare request all at once
      transiting = true;
      // perform open
      xhr.open(
        request.method,
        request.url,
        request.async,
        request.user,
        request.pass
      );

      //write xhr settings
      for (k of ["type", "timeout", "withCredentials"]) {
        modk = k === "type" ? "responseType" : k;
        if (k in request) {
          // @ts-ignore
          xhr[modk] = request[k];
        }
      }

      //insert headers
      for (let header in request.headers) {
        // @ts-ignore
        const value = request.headers[header];
        if (header) {
          xhr.setRequestHeader(header, value);
        }
      }
      //real send!
      xhr.send(request.body);
    };

    const beforeHooks = hooks.listeners("before");

    // process beforeHooks sequentially
    let process = function () {
      if (needSend && !beforeHooks.length) {
        console.log('needSend: ', needSend);
        return send();
      }
      // go to next hook OR optionally provide response
      const done = function (userResponse?: XHookBeforeResponse) {
        //break chain - provide dummy response (readyState 4)
        if (typeof userResponse === "string") {
          response = mergeObjects(
            { data: userResponse, response: userResponse, text: userResponse },
            response
          );
          needSend = false
          setReadyState(4);
          return;
        } else if (typeof userResponse === "object") {
          if (!("data" in userResponse)) {
            userResponse.data = userResponse.response || userResponse.text;
          }
          response = mergeObjects(userResponse, response);
          needSend = userResponse.needSend === true
          setReadyState(4);
          return;
        } else {
          //continue processing until no beforeHooks left
          process();
        }
      };

      // specifically provide headers (readyState 2)
      done.head = function (userResponse: object) {
        mergeObjects(userResponse, response);
        setReadyState(2);
      };
      //specifically provide partial text (responseText  readyState 3)
      done.progress = function (userResponse: object) {
        mergeObjects(userResponse, response);
        setReadyState(3);
      };

      const hook = beforeHooks.shift();
      // async or sync?
      if (hook && hook.length === 1) {
        done(hook(request));
      } else if (hook && hook.length === 2 && request.async) {
        // async handlers must use an async xhr
        hook(request, done);
      } else {
        // skip async hook on sync requests
        done();
      }
      return;
    };
    // kick off
    process();
  };

  facade.abort = function () {
    status = ABORTED;
    if (transiting) {
      xhr.abort(); // this will emit an 'abort' for us
    } else {
      facade.dispatchEvent("abort", {});
    }
  };

  facade.setRequestHeader = function (name: string, value: string | number) {
    // the first header set is used for all future case-alternatives of 'name'
    let headerName = name && name.toLowerCase();

    // @ts-ignore
    headerName = request.headerNames[headerName] || headerName;
    // append header to any previous values
    // @ts-ignore
    if (request.headers[headerName]) {
      // @ts-ignore
      value = request.headers[headerName] + ", " + value;
    }

    // @ts-ignore
    request.headers[headerName] = value;
  };

  facade.getResponseHeader = (header: string) =>
    // @ts-ignore
    nullify(response.headers && response.headers[header.toLowerCase()]);

  facade.getAllResponseHeaders = () =>
    nullify(headers.convert(response.headers as object));

  // proxy call only when supported
  if (xhr.overrideMimeType) {
    facade.overrideMimeType = function () {
      xhr.overrideMimeType.apply(xhr, arguments);
    };
  }

  //create emitter when supported
  if (xhr.upload) {
    let up = EventEmitter();
    facade.upload = up;
    request.upload = up;
  }

  facade.UNSENT = 0;
  facade.OPENED = 1;
  facade.HEADERS_RECEIVED = 2;
  facade.LOADING = 3;
  facade.DONE = 4;

  // fill in default values for an empty XHR object according to the spec
  facade.response = "";
  facade.responseText = "";
  facade.responseXML = null;
  facade.readyState = 0;
  facade.statusText = "";

  return facade;
};

XHook.UNSENT = 0;
XHook.OPENED = 1;
XHook.HEADERS_RECEIVED = 2;
XHook.LOADING = 3;
XHook.DONE = 4;

// patch interface
export default {
  patch() {
    if (Native) {
      windowRef.XMLHttpRequest = XHook;
    }
  },
  unpatch() {
    if (Native) {
      windowRef.XMLHttpRequest = Native;
    }
  },
  Native,
  XHook: XHook,
};
