(async () => {
  const files = [
    "./app-parts/part-01.txt",
    "./app-parts/part-02.txt",
    "./app-parts/part-03.txt",
    "./app-parts/part-04.txt",
    "./app-parts/part-05.txt",
    "./app-parts/part-06.txt",
    "./app-parts/part-07.txt",
    "./app-parts/part-08.txt",
    "./app-parts/part-09.txt"
  ];
  try {
    const parts = [];
    for (const file of files) {
      const response = await fetch(file, { cache: "no-cache" });
      if (!response.ok) throw new Error(`Не удалось загрузить ${file}: ${response.status}`);
      parts.push(await response.text());
    }
    (0, eval)(`${parts.join("\n")}\n//# sourceURL=imon-context.bundle.js`);
  } catch (error) {
    console.error(error);
    const root = document.getElementById("app");
    if (root) root.innerHTML = `<section style="max-width:720px;margin:80px auto;font-family:system-ui"><h1>Ошибка загрузки</h1><p>${String(error.message || error)}</p></section>`;
  }
})();
