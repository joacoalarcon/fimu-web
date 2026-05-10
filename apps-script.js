// ─────────────────────────────────────────────────────────────────
// FiMU Waitlist — Google Apps Script
//
// SETUP:
// 1. Ir a script.google.com → nuevo proyecto → pegar este código
// 2. Cambiar SPREADSHEET_ID por el ID de tu Google Sheet
//    (está en la URL: spreadsheets/d/ESTE_ES_EL_ID/edit)
// 3. Implementar → Nueva implementación → Tipo: Web App
//    - Ejecutar como: Yo
//    - Acceso: Cualquier persona
// 4. Copiar la URL y pegarla como APPS_SCRIPT_URL en Vercel
// ─────────────────────────────────────────────────────────────────

const SPREADSHEET_ID = 'PEGAR_ID_DE_TU_GOOGLE_SHEET_AQUÍ';
const SHEET_NAME = 'Waitlist';

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(SHEET_NAME);

    // Crear hoja con headers si no existe
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(['Fecha', 'Nombre', 'Email', 'Tipo']);
      sheet.getRange(1, 1, 1, 4).setFontWeight('bold');
    }

    sheet.appendRow([
      new Date().toISOString(),
      data.nombre || '',
      data.email || '',
      data.motivo || '',
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
