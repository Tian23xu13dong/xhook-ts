import { windowRef } from "../misc/window";
import hooks from "../misc/hooks";

interface InterceptReqOptions extends Omit<RequestInit, "window"> {
  url?: URL | string;
  isFetch?: boolean;
  acceptedRequest?: boolean;
}

// @ts-ignore
export interface XHookResponse extends Response {
  body?: ReadableStream<Uint8Array> | null | string;
  data?: string;
  text?: string;
}

//browser's fetch
const NativeFetch: typeof fetch = windowRef.fetch;

function copyToObjFromRequest(req: Request): any {
  const copyedKeys = [
    "method",
    "headers",
    "body",
    "mode",
    "credentials",
    "cache",
    "redirect",
    "referrer",
    "referrerPolicy",
    "integrity",
    "keepalive",
    "signal",
    "url",
  ];
  let copyedObj: { [p: string]: any } = {};
  // @ts-ignore
  copyedKeys.forEach(key => (copyedObj[key] = req[key]));
  return copyedObj;
}

function covertHeaderToPlainObj(headers: RequestInit["headers"]) {
  if (headers instanceof Headers) {
    return covertTDAarryToObj([...headers.entries()]);
  }
  if (Array.isArray(headers)) {
    return covertTDAarryToObj(headers);
  }
  return headers;
}

function covertTDAarryToObj<T extends [string, any][]>(input: T) {
  return input.reduce((prev: { [key: string]: any }, [key, value]) => {
    prev[key] = value;
    return prev;
  }, {});
}

/**
 * if fetch(hacked by XHook) accept a Request as a first parameter, it will be destrcuted to a plain object.
 * Finally the whole network request was convert to fectch(Request.url, other options)
 */
const XHook: typeof fetch = function (input, init = { headers: {} }) {
  let options: InterceptReqOptions = { ...init, isFetch: true };

  if (input instanceof Request) {
    const requestObj = copyToObjFromRequest(input);
    const prevHeaders = {
      ...covertHeaderToPlainObj(requestObj.headers),
      ...covertHeaderToPlainObj(options.headers),
    };
    options = {
      ...requestObj,
      ...init,
      headers: prevHeaders,
      acceptedRequest: true,
    };
  } else {
    options.url = input;
  }

  const beforeHooks = hooks.listeners("before");
  const afterHooks = hooks.listeners("after");

  let needSend = true;

  return new Promise<Response>(function (resolve, reject) {
    let fullfiled = resolve;

    const done = function (userResponse?: XHookResponse) {
      if (userResponse !== undefined) {
        let response: Response;
        if (typeof userResponse === "string") {
          response = new Response(userResponse);
        } else {
          response = new Response(
            userResponse.body || userResponse.text,
            userResponse as ResponseInit
          );
        }
        resolve(response);
        processAfter(response);
        return;
      }

      //continue processing until no hooks left
      processBefore();
    };

    const processBefore = function () {
      if (needSend && !beforeHooks.length) {
        send();
        return;
      }

      const hook = beforeHooks.shift();

      if (hook && hook.length === 1) {
        return done(hook(options));
      } else if (hook && hook.length === 2) {
        return hook(options, done);
      }
    };

    const processAfter: (response: Response) => void = function (
      response: Response
    ) {
      if (!afterHooks.length) {
        return fullfiled(response);
      }

      const hook = afterHooks.shift();

      if (hook && hook.length === 2) {
        hook(options, response);
        return processAfter(response);
      } else if (hook && hook.length === 3) {
        return hook(options, response, processAfter);
      } else {
        return processAfter(response);
      }
    };

    const send = async () => {
      const { url, isFetch, acceptedRequest, ...restInit } = options;
      if (input instanceof Request && restInit.body instanceof ReadableStream) {
        restInit.body = await new Response(restInit.body).text();
      }
      return NativeFetch(url as string | URL, restInit)
        .then(response => processAfter(response))
        .catch(function (err) {
          fullfiled = reject;
          processAfter(err);
          return reject(err);
        });
    };

    processBefore();
  });
};

//patch interface
export default {
  patch() {
    // @ts-ignore
    if (NativeFetch) {
      windowRef.fetch = XHook;
    } else {
      throw Error("patch fetch is error");
    }
  },
  unpatch() {
    if (NativeFetch) {
      windowRef.fetch = NativeFetch;
    }
  },
  Native: NativeFetch,
  XHook: XHook,
};
