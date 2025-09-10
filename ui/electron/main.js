const { ipcMain } = require("electron");

ipcMain.handle("api:fetch", async (_evt, { path, init = {} }) => {
  try {
    // Configura headers apenas se houver body
    const headers = init.body
      ? { ...init.headers, "Content-Type": "application/json" }
      : { ...init.headers };

    const response = await fetch(`http://127.0.0.1:8000${path}`, {
      ...init,
      headers,
    });

    const text = await response.text();
    let body;
    try {
      body = text ? JSON.parse(text) : null; // null se vazio
    } catch (parseError) {
      body = text; // Retorna texto bruto se JSON falhar
    }

    return {
      ok: response.ok,
      status: response.status,
      body,
      headers: Object.fromEntries(response.headers.entries()), // Para debug
    };
  } catch (error) {
    console.error(`Fetch error for ${path}:`, error);
    return {
      ok: false,
      status: 0,
      body: error.message,
      stack: error.stack, // Adiciona stack para debug
    };
  }
});