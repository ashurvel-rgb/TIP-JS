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

// Создаёт URL относительно baseUrl и добавляет непустые параметры query.
// Значения кодируются средствами URL и URLSearchParams, а не вручную.
export function buildUrl(baseUrl, path, query = {}) {
  const root = String(baseUrl).replace(/\/+$/, "");
  const suffix = String(path).replace(/^\/+/, "");
  const url = new URL(`${root}/${suffix}`);
  for (const [name, value] of Object.entries(query)) {
    if (value !== "" && value !== null && value !== undefined) {
      url.searchParams.set(name, String(value));
    }
  }
  return url.href;
}

// fetchFn передаётся явно, чтобы модуль можно было проверить без реальной сети.
// Возвращаемый объект: { requestJson(path, { query, signal, timeoutMs } = {}) }.
export function createApiClient({
  baseUrl,
  fetchFn = globalThis.fetch,
  timeoutMs = 2000,
} = {}) {
  let normalized;
  try {
    normalized = new URL(baseUrl);
  } catch {
    throw new TypeError("baseUrl должен быть абсолютным HTTP-адресом");
  }
  if (!["http:", "https:"].includes(normalized.protocol)
    || normalized.search || normalized.hash
    || typeof fetchFn !== "function"
    || !Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError("Некорректная конфигурация API-клиента");
  }
  const normalizedBaseUrl = normalized.href.replace(/\/$/, "");

  return {
    async requestJson(path, { query = {}, signal, timeoutMs: requestTimeout = timeoutMs } = {}) {
      if (!Number.isInteger(requestTimeout) || requestTimeout <= 0) {
        throw new TypeError("timeoutMs должен быть положительным целым числом");
      }
      const url = buildUrl(normalizedBaseUrl, path, query);
      const controller = new AbortController();
      let timedOut = false;
      const abortFromOutside = () => controller.abort(signal?.reason);
      if (signal?.aborted) abortFromOutside();
      else signal?.addEventListener("abort", abortFromOutside, { once: true });
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort(new DOMException("Request timeout", "TimeoutError"));
      }, requestTimeout);

      try {
        let response;
        try {
          response = await fetchFn(url, {
            method: "GET",
            headers: { Accept: "application/json" },
            signal: controller.signal,
          });
        } catch (error) {
          if (timedOut) throw new ApiError("Превышено время ожидания ответа.", { kind: "timeout", url, cause: error });
          if (signal?.aborted) throw new ApiError("Запрос отменён.", { kind: "aborted", url, cause: error });
          throw new ApiError("Не удалось выполнить сетевой запрос.", { kind: "network", url, cause: error });
        }

        if (!(response instanceof Response)) {
          throw new ApiError("Получен некорректный объект ответа.", { kind: "invalid-response", url });
        }
        const contentType = response.headers.get("content-type") ?? "";
        if (!response.ok) {
          let payload = null;
          if (contentType.toLowerCase().includes("application/json")) {
            try { payload = await response.json(); } catch { payload = null; }
          }
          const apiError = payload?.error;
          throw new ApiError(apiError?.message ?? `HTTP-ошибка ${response.status}.`, {
            kind: "http",
            status: response.status,
            code: apiError?.code ?? null,
            details: apiError?.details ?? null,
            url,
          });
        }
        if (response.status === 204) return null;
        if (!contentType.toLowerCase().includes("application/json")) {
          throw new ApiError("Ожидался JSON-ответ.", { kind: "invalid-response", url });
        }
        try {
          return await response.json();
        } catch (error) {
          throw new ApiError("Не удалось разобрать JSON-ответ.", { kind: "invalid-response", url, cause: error });
        }
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abortFromOutside);
      }
    },
  };
}
