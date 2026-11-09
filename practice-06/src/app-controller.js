import { ApiError } from "./api-client.js";
import { validateTaskDraft } from "./form-validation.js";

export function messageForError(error) {
  if (!(error instanceof ApiError)) return "Не удалось выполнить операцию.";
  if (error.kind === "timeout") return "Сервер не ответил вовремя. Попробуйте ещё раз.";
  if (error.kind === "network") return "Нет соединения с учебным API. Проверьте, запущен ли npm start.";
  if (error.kind === "invalid-response") return "Сервер вернул ответ неожиданного формата.";
  if (error.kind === "http" && error.status === 404) return "Запись уже отсутствует на сервере. Обновите список.";
  if (error.kind === "http") return error.message || `Сервер вернул ошибку ${error.status}.`;
  return "Не удалось выполнить операцию.";
}

// view — адаптер из dom-app.js. Контроллер не должен обращаться к document.
// Обязательные методы результата:
// start, applyFilters, refresh, submit, beginEdit, cancelEdit,
// toggleTask, deleteTask, resetData и destroy.
export function createAppController({ api, view, validateDraft = validateTaskDraft } = {}) {
  const apiMethods = ["loadInitialData", "getTasks", "createTask", "updateTask", "setTaskCompleted", "deleteTask", "resetDemoData"];
  const viewMethods = ["setListState", "setTasks", "setCategories", "setTotal", "setFormTask", "showFormErrors", "setMutationPending", "notify"];
  if (!api || !view || apiMethods.some((name) => typeof api[name] !== "function")
    || viewMethods.some((name) => typeof view[name] !== "function") || typeof validateDraft !== "function") {
    throw new TypeError("Некорректные зависимости контроллера");
  }
  let tasks = [];
  let categories = [];
  let filters = {};
  let editingId = null;
  let loadController = null;
  let loadSequence = 0;

  async function load() {
    loadController?.abort();
    const controller = new AbortController();
    loadController = controller;
    const sequence = ++loadSequence;
    view.setListState("loading");
    try {
      if (categories.length === 0) {
        const result = await api.loadInitialData(filters, { signal: controller.signal });
        if (sequence !== loadSequence) return;
        tasks = result.tasks;
        categories = result.categories;
        view.setCategories(categories);
        view.setTotal(result.meta.total);
      } else {
        const result = await api.getTasks(filters, { signal: controller.signal });
        if (sequence !== loadSequence) return;
        tasks = result.tasks;
        view.setTotal(result.meta.total);
      }
      view.setTasks(tasks, categories);
      view.setListState(tasks.length ? "ready" : "empty");
    } catch (error) {
      if (sequence !== loadSequence || (error instanceof ApiError && error.kind === "aborted")) return;
      view.setListState("error", messageForError(error));
    }
  }

  async function mutate(action, successMessage, { clearForm = false } = {}) {
    view.setMutationPending(true);
    try {
      await action();
      if (clearForm) {
        editingId = null;
        view.setFormTask(null);
        view.showFormErrors({});
      }
      await load();
      view.notify(successMessage, "success");
    } catch (error) {
      view.notify(messageForError(error), "error");
    } finally {
      view.setMutationPending(false);
    }
  }

  return {
    async start(initialFilters = {}) {
      filters = { ...initialFilters };
      await load();
    },
    async applyFilters(nextFilters = {}) {
      filters = { ...nextFilters };
      await load();
    },
    async refresh() { await load(); },
    async submit(draft) {
      const checked = validateDraft(draft, categories);
      view.showFormErrors(checked.errors);
      if (!checked.valid) return;
      if (editingId === null) {
        await mutate(() => api.createTask(checked.value), "Задача добавлена.", { clearForm: true });
      } else {
        const id = editingId;
        await mutate(() => api.updateTask(id, checked.value), "Задача обновлена.", { clearForm: true });
      }
    },
    beginEdit(id) {
      const task = tasks.find((item) => item.id === id);
      if (!task) {
        view.notify("Задача не найдена.", "error");
        return;
      }
      editingId = id;
      view.showFormErrors({});
      view.setFormTask(task);
    },
    cancelEdit() {
      editingId = null;
      view.showFormErrors({});
      view.setFormTask(null);
    },
    async toggleTask(id) {
      const task = tasks.find((item) => item.id === id);
      if (!task) return view.notify("Задача не найдена.", "error");
      await mutate(() => api.setTaskCompleted(id, !task.completed), "Статус задачи изменён.");
    },
    async deleteTask(id) {
      await mutate(() => api.deleteTask(id), "Задача удалена.");
      if (editingId === id) {
        editingId = null;
        view.setFormTask(null);
      }
    },
    async resetData() {
      await mutate(() => api.resetDemoData(), "Исходные данные восстановлены.");
    },
    destroy() {
      loadSequence += 1;
      loadController?.abort();
    },
  };
}
