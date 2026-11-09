import { ApiError } from "./api-client.js";

const ALLOWED_PRIORITIES = new Set(["low", "medium", "high"]);
const ALLOWED_FILTERS = new Set(["completed", "priority", "categoryId", "q"]);

function invalidResponse(message) {
  return new ApiError(message, { kind: "invalid-response" });
}

function isPositiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isTask(value) {
  return Boolean(
    value
    && typeof value === "object"
    && isPositiveSafeInteger(value.id)
    && typeof value.title === "string"
    && value.title.trim().length >= 1
    && value.title.trim().length <= 100
    && typeof value.completed === "boolean"
    && ALLOWED_PRIORITIES.has(value.priority)
    && isPositiveSafeInteger(value.categoryId),
  );
}

function isCategory(value) {
  return Boolean(
    value
    && typeof value === "object"
    && isPositiveSafeInteger(value.id)
    && typeof value.name === "string"
    && value.name.trim().length >= 1
    && value.name.trim().length <= 100,
  );
}

// client — объект, созданный createApiClient.
// Контракт результата:
// getTasks(filters) -> Promise<{ tasks, meta }>
// getTaskById(id) -> Promise<task>
// getCategories() -> Promise<category[]>
// loadInitialData(filters) -> Promise<{ tasks, categories, meta }>
export function createTaskApi(client) {
  if (!client || typeof client.requestJson !== "function") {
    throw new TypeError("Требуется API-клиент с методом requestJson");
  }

  function normalizeFilters(filters = {}) {
    if (!filters || typeof filters !== "object" || Array.isArray(filters)) {
      throw new TypeError("Фильтры должны быть объектом");
    }
    const result = {};
    for (const [name, value] of Object.entries(filters)) {
      if (!ALLOWED_FILTERS.has(name)) throw new TypeError(`Неизвестный фильтр: ${name}`);
      if (name === "completed") {
        if (typeof value !== "boolean") throw new TypeError("completed должен быть boolean");
        result.completed = value;
      } else if (name === "priority") {
        if (!ALLOWED_PRIORITIES.has(value)) throw new TypeError("Неверный priority");
        result.priority = value;
      } else if (name === "categoryId") {
        if (!isPositiveSafeInteger(value)) throw new TypeError("Неверный categoryId");
        result.categoryId = value;
      } else {
        if (typeof value !== "string") throw new TypeError("q должен быть строкой");
        const q = value.trim();
        if (q.length > 100) throw new TypeError("q слишком длинный");
        if (q) result.q = q;
      }
    }
    return result;
  }

  function validateUnique(items, predicate, label) {
    if (!Array.isArray(items) || !items.every(predicate)) throw invalidResponse(`Некорректные ${label}.`);
    if (new Set(items.map((item) => item.id)).size !== items.length) {
      throw invalidResponse(`Повторяющиеся id в ${label}.`);
    }
  }

  return {
    async getTasks(filters = {}) {
      const query = normalizeFilters(filters);
      const payload = await client.requestJson("/tasks", { query });
      if (!payload || typeof payload !== "object" || !payload.meta || typeof payload.meta !== "object") {
        throw invalidResponse("Некорректный ответ списка задач.");
      }
      validateUnique(payload.data, isTask, "задачи");
      if (!Number.isSafeInteger(payload.meta.total) || payload.meta.total !== payload.data.length) {
        throw invalidResponse("Некорректное количество задач.");
      }
      return { tasks: payload.data, meta: payload.meta };
    },

    async getTaskById(id) {
      if (!isPositiveSafeInteger(id)) throw new TypeError("id должен быть положительным целым числом");
      const payload = await client.requestJson(`/tasks/${id}`);
      if (!payload || !isTask(payload.data)) throw invalidResponse("Некорректная задача.");
      return payload.data;
    },

    async getCategories() {
      const payload = await client.requestJson("/categories");
      if (!payload || typeof payload !== "object") throw invalidResponse("Некорректный ответ категорий.");
      validateUnique(payload.data, isCategory, "категории");
      if (payload.meta && payload.meta.total !== payload.data.length) {
        throw invalidResponse("Некорректное количество категорий.");
      }
      return payload.data;
    },

    async loadInitialData(filters = {}) {
      const [taskResult, categories] = await Promise.all([
        this.getTasks(filters),
        this.getCategories(),
      ]);
      return { tasks: taskResult.tasks, categories, meta: taskResult.meta };
    },
  };
}
