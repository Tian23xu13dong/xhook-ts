let result = null;

// find global object
// @ts-ignore
if (typeof WorkerGlobalScope !== "undefined" && self instanceof WorkerGlobalScope) {
  result = self;
} else {
  // @ts-ignore
  if (typeof global !== "undefined") {
    // @ts-ignore
    result = global;
  } else if (window) {
    console.log('当前环境是浏览器环境');
    result = window;
  }
}

export const windowRef = result;
export const documentRef = result.document;
