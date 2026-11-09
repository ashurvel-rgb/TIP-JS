// Перед началом ПР4 перенести проверенную реализацию функций ПР2–ПР3.
// Затем добавить updateTask по контракту ПР4.
// Для предусмотренных ошибок возвращается { ok: false, error: "..." }.
// DOM, localStorage и внешнее состояние в этом модуле не используются.

export function createTask(id, title, priority = "medium") {
  if (!Number.isSafeInteger(id) || id <= 0) {
    return { ok: false, error: "id должен быть положительным безопасным целым числом" };
  }
  if (typeof title !== "string") return { ok: false, error: "title должен быть строкой" };
  const cleanTitle = title.trim();
  if (cleanTitle.length < 1 || cleanTitle.length > 100) {
    return { ok: false, error: "title после trim() должен иметь длину от 1 до 100 символов" };
  }
  if (!["low", "medium", "high"].includes(priority)) {
    return { ok: false, error: "priority должен быть low, medium или high" };
  }
  return { ok: true, task: { id, title: cleanTitle, completed: false, priority } };
}

export function findTaskById(tasks, id) {
  return tasks.find((task) => task.id === id);
}

export function getPendingTasks(tasks) {
  return tasks.filter((task) => task.completed === false);
}

export function getTaskTitles(tasks) {
  return tasks.map((task) => task.title);
}

export function getTaskStats(tasks) {
  const total = tasks.length;
  const completed = tasks.filter((task) => task.completed === true).length;
  return { total, completed, pending: total - completed, progress: total ? completed / total * 100 : 0 };
}

export function addTask(tasks, id, title, priority = "medium") {
  const created = createTask(id, title, priority);
  if (!created.ok) return created;
  if (findTaskById(tasks, id)) return { ok: false, error: "Задача с таким id уже существует" };
  return { ok: true, tasks: [...tasks, created.task] };
}

export function setTaskCompleted(tasks, id, completed) {
  if (!Number.isSafeInteger(id) || id <= 0) {
    return { ok: false, error: "id должен быть положительным безопасным целым числом" };
  }
  if (typeof completed !== "boolean") return { ok: false, error: "completed должен быть boolean" };
  if (!findTaskById(tasks, id)) return { ok: false, error: "Задача с таким id не найдена" };
  return { ok: true, tasks: tasks.map((task) => task.id === id ? { ...task, completed } : task) };
}

export function renameTask(tasks, id, title) {
  if (!Number.isSafeInteger(id) || id <= 0) {
    return { ok: false, error: "id должен быть положительным безопасным целым числом" };
  }
  if (typeof title !== "string") return { ok: false, error: "title должен быть строкой" };
  const cleanTitle = title.trim();
  if (cleanTitle.length < 1 || cleanTitle.length > 100) {
    return { ok: false, error: "title после trim() должен иметь длину от 1 до 100 символов" };
  }
  if (!findTaskById(tasks, id)) return { ok: false, error: "Задача с таким id не найдена" };
  return { ok: true, tasks: tasks.map((task) => task.id === id ? { ...task, title: cleanTitle } : task) };
}

export function removeTask(tasks, id) {
  if (!Number.isSafeInteger(id) || id <= 0) {
    return { ok: false, error: "id должен быть положительным безопасным целым числом" };
  }
  if (!findTaskById(tasks, id)) return { ok: false, error: "Задача с таким id не найдена" };
  return { ok: true, tasks: tasks.filter((task) => task.id !== id) };
}

export function updateTask(tasks, id, title, priority) {
  if (!Number.isSafeInteger(id) || id <= 0) {
    return { ok: false, error: "id должен быть положительным безопасным целым числом" };
  }
  if (!findTaskById(tasks, id)) return { ok: false, error: "Задача с таким id не найдена" };
  const checked = createTask(id, title, priority);
  if (!checked.ok) return checked;
  return {
    ok: true,
    tasks: tasks.map((task) => task.id === id
      ? { ...task, title: checked.task.title, priority: checked.task.priority }
      : task),
  };
}
