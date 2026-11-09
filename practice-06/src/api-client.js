export class ApiError extends Error {
  constructor(message, {
    kind,
    status = null,
    code = null,
    details = null,
    url = null,
    cause,
  } = {}) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.code = code;
    this.details = details;
    this.url = url;
  }
}

// Соединяет абсолютный baseUrl, путь и непустые query-параметры.
export function buildUrl(baseUrl, path, query = {}) {
  const root = String(baseUrl).replace(/\/+$/, "");
  const suffix = String(path).replace(/^\/+/, "");
  const url = new URL(`${root}/${suffix}`);
  for (const [name, value] of Object.entries(query)) {
    if (value !== "" && value !== null && value !== undefined) url.searchParams.set(name, String(value));
  }
  return url.href;
}

// requestJson(path, { method, query, body, signal, timeoutMs } = {})
// поддерживает GET, POST, PATCH и DELETE; ответ 204 преобразуется в null.
export function createApiClient({
  baseUrl,
  fetchFn = globalThis.fetch,
  timeoutMs = 3000,
} = {}) {
  let normalized;
  try { normalized = new URL(baseUrl); } catch { throw new TypeError("baseUrl должен быть абсолютным URL"); }
  if (!["http:", "https:"].includes(normalized.protocol) || normalized.search || normalized.hash
    || typeof fetchFn !== "function" || !Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("Некорректная конфигурация API-клиента");
  }
  const normalizedBaseUrl = normalized.href.replace(/\/$/, "");
  const allowedMethods = new Set(["GET", "POST", "PATCH", "DELETE"]);

  return {
    async requestJson(path, {
      method = "GET", query = {}, body, signal, timeoutMs: requestTimeout = timeoutMs,
    } = {}) {
      const normalizedMethod = String(method).toUpperCase();
      if (!allowedMethods.has(normalizedMethod)) throw new TypeError("Неподдерживаемый HTTP-метод");
      if (normalizedMethod === "GET" && body !== undefined) throw new TypeError("GET не поддерживает тело запроса");
      if (!Number.isInteger(requestTimeout) || requestTimeout <= 0) throw new TypeError("Некорректный timeoutMs");
      const url = buildUrl(normalizedBaseUrl, path, query);
      const headers = { Accept: "application/json" };
      const options = { method: normalizedMethod, headers };
      if (body !== undefined) {
        headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(body);
      }
      const controller = new AbortController();
      options.signal = controller.signal;
      let timedOut = false;
      const abortOutside = () => controller.abort(signal?.reason);
      if (signal?.aborted) abortOutside();
      else signal?.addEventListener("abort", abortOutside, { once: true });
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort(new DOMException("Request timeout", "TimeoutError"));
      }, requestTimeout);
      try {
        let response;
        try {
          response = await fetchFn(url, options);
        } catch (error) {
          if (timedOut) throw new ApiError("Превышено время ожидания ответа.", { kind: "timeout", url, cause: error });
          if (signal?.aborted) throw new ApiError("Запрос отменён.", { kind: "aborted", url, cause: error });
          throw new ApiError("Не удалось выполнить сетевой запрос.", { kind: "network", url, cause: error });
        }
        if (!(response instanceof Response)) throw new ApiError("Некорректный объект ответа.", { kind: "invalid-response", url });
        const contentType = response.headers.get("content-type") ?? "";
        if (!response.ok) {
          let payload = null;
          if (contentType.toLowerCase().includes("application/json")) {
            try { payload = await response.json(); } catch { payload = null; }
          }
          const item = payload?.error;
          throw new ApiError(item?.message ?? `HTTP-ошибка ${response.status}.`, {
            kind: "http", status: response.status, code: item?.code ?? null,
            details: item?.details ?? null, url,
          });
        }
        if (response.status === 204) return null;
        if (!contentType.toLowerCase().includes("application/json")) {
          throw new ApiError("Ожидался JSON-ответ.", { kind: "invalid-response", url });
        }
        try { return await response.json(); }
        catch (error) { throw new ApiError("Не удалось разобрать JSON-ответ.", { kind: "invalid-response", url, cause: error }); }
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abortOutside);
      }
    },
  };
}
