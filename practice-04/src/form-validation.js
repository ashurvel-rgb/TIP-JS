const ALLOWED_PRIORITIES = new Set(["low", "medium", "high"]);

// Чистая проверка данных формы. DOM и показ сообщений выполняются в main.js.
// draft: { id, title, priority }; editingId: null либо id редактируемой задачи.
export function validateTaskDraft(draft, tasks, editingId = null) {
  const errors = {};
  const rawId = editingId ?? draft?.id;
  const id = typeof rawId === "number" ? rawId : Number(String(rawId ?? "").trim());
  const title = typeof draft?.title === "string" ? draft.title.trim() : "";
  const priority = draft?.priority;

  if (!Number.isSafeInteger(id) || id <= 0) errors.id = "Введите положительное целое число";
  else if (editingId === null && tasks.some((task) => task.id === id)) errors.id = "Задача с таким id уже существует";
  else if (editingId !== null && !tasks.some((task) => task.id === id)) errors.id = "Задача для редактирования не найдена";
  if (title.length < 1 || title.length > 100) errors.title = "Название должно содержать от 1 до 100 символов";
  if (!ALLOWED_PRIORITIES.has(priority)) errors.priority = "Выберите допустимый приоритет";

  return Object.keys(errors).length
    ? { ok: false, errors }
    : { ok: true, value: { id, title, priority } };
}
