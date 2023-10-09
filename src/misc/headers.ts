// helper
const CRLF = "\r\n";

const objectToString = function (headersObj: object) {
  const entries = Object.entries(headersObj);

  const headers = entries.map(([name, value]) => {
    return `${name.toLowerCase()}: ${value}`;
  });

  return headers.join(CRLF);
};

const stringToObject = function (headersString: string, dest?: object) {
  const headers = headersString.split(CRLF);
  if (!dest) {
    dest = {};
  }

  for (let header of headers) {
    if (/([^:]+):\s*(.+)/.test(header)) {
      const name = RegExp.$1 != null ? RegExp.$1.toLowerCase() : undefined;
      const value = RegExp.$2;
      // @ts-ignore
      if (dest[name] == null) {
        // @ts-ignore
        dest[name] = value;
      }
    }
  }

  return dest;
};

const convert = function (headers: string | object, dest?: object) {
  switch (typeof headers) {
    case "object": {
      return objectToString(headers);
    }
    case "string": {
      return stringToObject(headers, dest);
    }
  }

  return [];
};

export default { convert };
