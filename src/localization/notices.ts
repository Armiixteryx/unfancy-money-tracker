export const noticeEn = {
  categoryAdded: "{{name}} added locally.",
  budgetsCopied_one: "Copied {{count, number}} budget from {{month}}; skipped {{skipped, number}} existing or unavailable categories.",
  budgetsCopied_other: "Copied {{count, number}} budgets from {{month}}; skipped {{skipped, number}} existing or unavailable categories.",
  rateUnavailable: "No exchange rate is available for {{currencies}}. Combined totals stay unavailable; original amounts remain visible.",
  rateDetails: "{{pair}} · effective {{date}} · {{status}} · fetched {{timestamp}}",
  fresh: "Current", stale: "Stale", system: "System", light: "Light", dark: "Dark",
  clearDate: "Clear {{label}}", renameCategory: "Rename {{name}}",
  languageSaved: "Language preference saved locally.",
  previewTitle: "CSV export preview", previewDescription: "A non-functional Pro feature preview. No export or payment is implemented in V1.",
  previewInterest: "CSV export interest recorded locally for this preview.",
  months_one: "{{count, number}} month", months_other: "{{count, number}} months",
  editRecord: "Edit {{description}}", deleteRecord: "Delete {{description}}", cancelDeleteRecord: "Cancel deleting {{description}}", confirmDeleteRecord: "Confirm deletion of {{description}}", deleteBudget: "Delete {{name}} budget",
  budgetPreview_one: "{{count, number}} budget in {{month}}", budgetPreview_other: "{{count, number}} budgets in {{month}}",
  baseCurrencySaved: "Base currency set to {{currency}}.",
  recordCount_one: "{{count, number}} record", recordCount_other: "{{count, number}} records",
  cachedRate: "A cached rate is being used and is visibly stale. Refresh from Settings when online.", csvExport: "CSV export",
  retrySave: "Retry local save"
} as const;
export const noticeEs: Record<keyof typeof noticeEn, string> = {
  categoryAdded: "{{name}} agregada localmente.",
  budgetsCopied_one: "Se copió {{count, number}} presupuesto de {{month}}; se omitieron {{skipped, number}} categorías existentes o no disponibles.",
  budgetsCopied_other: "Se copiaron {{count, number}} presupuestos de {{month}}; se omitieron {{skipped, number}} categorías existentes o no disponibles.",
  rateUnavailable: "No hay una tasa de cambio disponible para {{currencies}}. Los totales combinados no están disponibles; los montos originales siguen visibles.",
  rateDetails: "{{pair}} · vigente desde {{date}} · {{status}} · obtenida {{timestamp}}",
  fresh: "Actual", stale: "Desactualizada", system: "Sistema", light: "Claro", dark: "Oscuro",
  clearDate: "Limpiar {{label}}", renameCategory: "Renombrar {{name}}",
  languageSaved: "Preferencia de idioma guardada localmente.",
  previewTitle: "Vista previa de exportación CSV", previewDescription: "Vista previa de una función Pro sin funcionalidad. V1 no incluye exportación ni pagos.",
  previewInterest: "Interés en exportar CSV registrado localmente para esta vista previa.",
  months_one: "{{count, number}} mes", months_other: "{{count, number}} meses",
  editRecord: "Editar {{description}}", deleteRecord: "Eliminar {{description}}", cancelDeleteRecord: "Cancelar eliminación de {{description}}", confirmDeleteRecord: "Confirmar eliminación de {{description}}", deleteBudget: "Eliminar presupuesto de {{name}}",
  budgetPreview_one: "{{count, number}} presupuesto en {{month}}", budgetPreview_other: "{{count, number}} presupuestos en {{month}}",
  baseCurrencySaved: "Moneda base cambiada a {{currency}}.",
  recordCount_one: "{{count, number}} registro", recordCount_other: "{{count, number}} registros",
  cachedRate: "Se usa una tasa almacenada desactualizada. Actualízala desde Ajustes cuando tengas conexión.", csvExport: "Exportar CSV",
  retrySave: "Reintentar guardado local"
};
export type Notice = { code: "baseCurrencySaved"; currency: string } | { code: "categoryAdded"; name: string } | { code: "budgetsCopied"; count: number; month: string; skipped: number };
export type Message = string | Notice;
