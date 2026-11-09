import { ApiError } from "./api-client.js";

const ALLOWED_PRIORITIES = new Set(["low", "medium", "high"]);
const ALLOWED_FILTERS = new Set(["completed", "priority", "categoryId", "q"]);

function invalidResponse(message) {
  return new ApiError(message, { kind: "invalid-response" });
}

function isPositiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

export function isTask(value) {
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

export function isCategory(value) {
  return Boolean(
    value
    && typeof value === "object"
    && isPositiveSafeInteger(value.id)
    && typeof value.name === "string"
    && value.name.trim().length >= 1
    && value.name.trim().length <= 100,
  );
}

// Методы результата:
// getTasks, getTaskById, getCategories, loadInitialData, createTask, updateTask,
// setTaskCompleted, deleteTask и resetDemoData.
// Последний аргумент каждого метода данных — { signal }.
export function createTaskApi(client) {
  if (!client || typeof client.requestJson !== "function") throw new TypeError("Требуется requestJson");

  function requireId(id) {
    if (!isPositiveSafeInteger(id)) throw new TypeError("id должен быть положительным целым числом");
  }
  function normalizeFilters(filters = {}) {
    if (!filters || typeof filters !== "object" || Array.isArray(filters)) throw new TypeError("Фильтры должны быть объектом");
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
  function checkedTask(payload) {
    if (!payload || !isTask(payload.data)) throw invalidResponse("Некорректная задача.");
    return payload.data;
  }
  function checkedArray(items, predicate, label) {
    if (!Array.isArray(items) || !items.every(predicate)
      || new Set(items.map((item) => item.id)).size !== items.length) {
      throw invalidResponse(`Некорректные ${label}.`);
    }
  }

  return {
    async getTasks(filters = {}, { signal } = {}) {
      const query = normalizeFilters(filters);
      const payload = await client.requestJson("/tasks", { query, signal });
      if (!payload?.meta) throw invalidResponse("Некорректный ответ задач.");
      checkedArray(payload.data, isTask, "задачи");
      if (!Number.isSafeInteger(payload.meta.total) || payload.meta.total !== payload.data.length) {
        throw invalidResponse("Некорректное количество задач.");
      }
      return { tasks: payload.data, meta: payload.meta };
    },
    async getTaskById(id, { signal } = {}) {
      requireId(id);
      return checkedTask(await client.requestJson(`/tasks/${id}`, signal ? { signal } : undefined));
    },
    async getCategories({ signal } = {}) {
      const payload = await client.requestJson("/categories", signal ? { signal } : undefined);
      checkedArray(payload?.data, isCategory, "категории");
      if (payload.meta && payload.meta.total !== payload.data.length) throw invalidResponse("Некорректное количество категорий.");
      return payload.data;
    },
    async loadInitialData(filters = {}, { signal } = {}) {
      const [taskResult, categories] = await Promise.all([
        this.getTasks(filters, { signal }), this.getCategories({ signal }),
      ]);
      return { tasks: taskResult.tasks, categories, meta: taskResult.meta };
    },
    async createTask(draft, { signal } = {}) {
      return checkedTask(await client.requestJson("/tasks", { method: "POST", body: draft, signal }));
    },
    async updateTask(id, changes, { signal } = {}) {
      requireId(id);
      return checkedTask(await client.requestJson(`/tasks/${id}`, { method: "PATCH", body: changes, signal }));
    },
    async setTaskCompleted(id, value, { signal } = {}) {
      requireId(id);
      if (typeof value !== "boolean") throw new TypeError("completed должен быть boolean");
      return checkedTask(await client.requestJson(`/tasks/${id}`, { method: "PATCH", body: { completed: value }, signal }));
    },
    async deleteTask(id, { signal } = {}) {
      requireId(id);
      const result = await client.requestJson(`/tasks/${id}`, { method: "DELETE", signal });
      if (result !== null) throw invalidResponse("DELETE должен вернуть 204 без тела.");
      return null;
    },
    async resetDemoData({ signal } = {}) {
      const payload = await client.requestJson("/debug/reset", { method: "POST", signal });
      const data = payload?.data;
      if (!data || data.reset !== true || !Number.isSafeInteger(data.total)) throw invalidResponse("Некорректное подтверждение сброса.");
      return data;
    },
  };
}
