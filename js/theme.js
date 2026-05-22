const themeToggle = document.getElementById("themeToggle");
const THEME_KEY = "musicsite_theme";

// По умолчанию — тёмная тема
let isDark = true;

// Проверяем, есть ли сохранённая тема
const savedTheme = localStorage.getItem(THEME_KEY);
if (savedTheme === "light") {
  // Если пользователь явно выбрал светлую — показываем светлую
  isDark = false;
  document.body.classList.remove("dark");
  if (themeToggle) themeToggle.textContent = "🌙";
} else {
  // Во всех остальных случаях (нет сохранённой или сохранена 'dark') — тёмная
  document.body.classList.add("dark");
  if (themeToggle) themeToggle.textContent = "☀️";
}

// Обработчик клика по кнопке переключения
if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark");
    const isDarkNow = document.body.classList.contains("dark");
    localStorage.setItem(THEME_KEY, isDarkNow ? "dark" : "light");
    themeToggle.textContent = isDarkNow ? "☀️" : "🌙";
  });
}
