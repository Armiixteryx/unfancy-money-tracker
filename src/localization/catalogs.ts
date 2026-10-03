import { noticeEn, noticeEs } from "./notices";
import { errorEn, errorEs } from "./errorCatalog";
import { uiEn, uiEs } from "./uiCatalog";
export const en = {
  ui: uiEn,
  notices: noticeEn,
  failures: errorEn,
  navigation: { dashboard: "Dashboard", transactions: "Transactions", budgets: "Budgets", reports: "Reports", settings: "Settings" },
  settings: { language: "Language", system: "System", saved: "Language preference saved locally." },
  categories: { uncategorized: "Uncategorized", income: "Income", food: "Food", housing: "Housing", transport: "Transport", shopping: "Shopping", utilities: "Utilities", entertainment: "Entertainment", health: "Health", education: "Education", subscriptions: "Subscriptions" },
  errors: { generic: "Something went wrong. Try again.", amount: "Enter a positive amount without grouping separators, for example {{example}}.", precision: "{{currency}} supports at most {{count, number}} decimal places.", save: "Local save failed. Your change is still visible; retry to save it." },
  reports: { empty: "No recorded activity in {{month}}.", activity_one: "{{count, number}} transaction recorded in {{month}}, across {{currencies}}.", activity_other: "{{count, number}} transactions recorded in {{month}}, across {{currencies}}." }
} as const;

type Catalog = { [K in keyof typeof en]: { [P in keyof typeof en[K]]: string } };
export const es: Catalog = {
  ui: uiEs,
  notices: noticeEs,
  failures: errorEs,
  navigation: { dashboard: "Resumen", transactions: "Movimientos", budgets: "Presupuestos", reports: "Informes", settings: "Ajustes" },
  settings: { language: "Idioma", system: "Sistema", saved: "Preferencia de idioma guardada localmente." },
  categories: { uncategorized: "Sin categoría", income: "Ingresos", food: "Comida", housing: "Vivienda", transport: "Transporte", shopping: "Compras", utilities: "Servicios", entertainment: "Entretenimiento", health: "Salud", education: "Educación", subscriptions: "Suscripciones" },
  errors: { generic: "Ocurrió un error. Inténtalo de nuevo.", amount: "Ingresa un monto positivo sin separadores de miles, por ejemplo {{example}}.", precision: "{{currency}} admite como máximo {{count, number}} decimales.", save: "No se pudo guardar localmente. El cambio sigue visible; vuelve a intentar guardarlo." },
  reports: { empty: "No hay actividad registrada en {{month}}.", activity_one: "{{count, number}} transacción registrada en {{month}}, en {{currencies}}.", activity_other: "{{count, number}} transacciones registradas en {{month}}, en {{currencies}}." }
};
