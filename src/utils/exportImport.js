import { apiExportData, apiImportData } from '../api';

export async function exportAllData() {
  const exportData = await apiExportData();

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `arkive-export-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importData(jsonFile) {
  const text = await jsonFile.text();
  const data = JSON.parse(text);
  if (!data || !data.version) {
    throw new Error('Invalid export file');
  }
  return apiImportData(data);
}
