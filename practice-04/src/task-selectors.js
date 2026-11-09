// Перед началом ПР4 заменить этот файл собственной проверенной версией из ПР3.
export function getVisibleTasks(tasks, filter = "all") {
  if (filter === "all") return [...tasks];
  if (filter === "pending") return tasks.filter((task) => !task.completed);
  if (filter === "completed") return tasks.filter((task) => task.completed);
  return [...tasks];
}
