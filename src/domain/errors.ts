import type { CurrencyCode } from "./currency";

export const errorCodes = {
  "Check the highlighted fields and try again.": "check_the_highlighted_fields_and_try_again",
  "Something went wrong. Try again.": "something_went_wrong_try_again",
  "Local save failed. Your change is still visible; retry to save it.": "local_save_failed_your_change_is_still_visible_retry_to_save_it",
  "Local data is still loading.": "local_data_is_still_loading",
  "Local save failed. Retry to save your change.": "local_save_failed_retry_to_save_your_change",
  "Local data could not be saved. Retry from Settings.": "local_data_could_not_be_saved_retry_from_settings",
  "Local reset failed. Your records remain available.": "local_reset_failed_your_records_remain_available",
  "Local reset failed. Try again.": "local_reset_failed_try_again",
  "Mock data is available only in the local development environment.": "mock_data_is_available_only_in_the_local_development_environment",
  "Mock data could not be saved locally.": "mock_data_could_not_be_saved_locally",
  "Local save failed. Retry to save this record.": "local_save_failed_retry_to_save_this_record",
  "This transaction is no longer available.": "this_transaction_is_no_longer_available",
  "This budget is no longer available.": "this_budget_is_no_longer_available",
  "Choose valid calendar months to copy budgets.": "choose_valid_calendar_months_to_copy_budgets",
  "Source and target months must be different.": "source_and_target_months_must_be_different",
  "No budgets found in the source month.": "no_budgets_found_in_the_source_month",
  "No budgets are available to copy.": "no_budgets_are_available_to_copy",
  "Budgets could not be saved locally. Retry to save your changes.": "budgets_could_not_be_saved_locally_retry_to_save_your_changes",
  "Choose a supported base currency.": "choose_a_supported_base_currency",
  "Choose supported currencies.": "choose_supported_currencies",
  "Select at least one desired currency.": "select_at_least_one_desired_currency",
  "The current base currency must remain selected.": "the_current_base_currency_must_remain_selected",
  "This category is no longer available.": "this_category_is_no_longer_available",
  "Protected Uncategorized categories cannot be deleted.": "protected_uncategorized_categories_cannot_be_deleted",
  "Use YYYY-MM-DD": "use_yyyy_mm_dd",
  "Use YYYY-MM": "use_yyyy_mm",
  "Description is required": "description_is_required",
  "Description is too long": "description_is_too_long",
  "Enter a valid positive amount": "enter_a_valid_positive_amount",
  "Enter a real calendar date": "enter_a_real_calendar_date",
  "Enter a valid positive budget": "enter_a_valid_positive_budget",
  "Category name is required": "category_name_is_required",
  "Category name is too long": "category_name_is_too_long",
  "Category type must match transaction type": "category_type_must_match_transaction_type",
  "Select an existing category": "select_an_existing_category",
  "Archived categories cannot be selected for new transactions": "archived_categories_cannot_be_selected_for_new_transactions",
  "Select an expense category": "select_an_expense_category",
  "Archived categories cannot receive new budgets": "archived_categories_cannot_receive_new_budgets",
  "Protected categories cannot be renamed": "protected_categories_cannot_be_renamed",
  "Protected categories cannot be archived": "protected_categories_cannot_be_archived",
  "Amount is required": "amount_is_required",
  "Amount must not use exponent notation": "amount_must_not_use_exponent_notation",
  "Amount must be a decimal number": "amount_must_be_a_decimal_number",
  "Exchange rate must be greater than zero": "exchange_rate_must_be_greater_than_zero_message",
  "Amount must be finite": "amount_must_be_finite",
  "Amount must be positive": "amount_must_be_positive",
  "Amount must be greater than zero": "amount_must_be_greater_than_zero_message",
  "Money values must use the same currency": "money_values_must_use_the_same_currency",
  "Invalid category choices": "invalid_category_choices",
  "Recording could not be read. Record again or enter manually.": "recording_could_not_be_read_record_again_or_enter_manually",
  "Say one expense with a description, amount, and currency. Record again or enter manually.": "say_one_expense_with_a_description_amount_and_currency_record_again_or_enter_manually",
  "Voice entry supports Colombian pesos, US dollars, and bolívares. Enter other currencies manually.": "voice_entry_supports_colombian_pesos_us_dollars_and_bol_vares_enter_other_currencies_manually",
  "Voice entry is busy. Wait a moment, then record again or enter manually.": "voice_entry_is_busy_wait_a_moment_then_record_again_or_enter_manually",
  "Voice entry is temporarily unavailable. Enter manually.": "voice_entry_is_temporarily_unavailable_enter_manually",
  "Voice processing is unavailable. Check your connection or enter manually.": "voice_processing_is_unavailable_check_your_connection_or_enter_manually",
  "Voice processing took too long. Record again or enter manually.": "voice_processing_took_too_long_record_again_or_enter_manually",
  "There are too many categories for voice entry. Enter manually.": "there_are_too_many_categories_for_voice_entry_enter_manually",
  "Voice entry is not configured. Enter manually.": "voice_entry_is_not_configured_enter_manually"
} as const;
export type ErrorCode = typeof errorCodes[keyof typeof errorCodes] | "amount_precision";
export type ErrorParameters = { currency?: CurrencyCode; count?: number; example?: string };
export function errorCode(message: string): ErrorCode { return errorCodes[message as keyof typeof errorCodes] ?? "something_went_wrong_try_again"; }
export class DomainError extends Error {
  readonly code: ErrorCode;
  constructor(message: string, readonly parameters: ErrorParameters = {}) { super(message); this.code = parameters.currency !== undefined && parameters.count !== undefined ? "amount_precision" : errorCode(message); }
}

export function errorToken(error: unknown): string {
  if (!(error instanceof DomainError)) return "something_went_wrong_try_again";
  return error.code === "amount_precision" ? `amount_precision:${error.parameters.currency}:${error.parameters.count}` : error.code;
}
