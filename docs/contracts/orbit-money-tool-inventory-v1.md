# ORBIT MONEY exact tool inventory

Existing 20 tools in server.mjs are preserved unchanged. 91 additions; 111 hosted tools total. New routes below are relative to /api/orbit/money/v1/. The JSON inventory contains every exact required/optional field and closed schema, including the preserved tools.

| Tool | Backend route | Required scopes | Tier | Effect |
|---|---|---|---|---|
| `money_get_console_capabilities` | GET `capabilities` | orbit:read | READ | Read |
| `money_get_statistical_balances` | GET `statistical-balances` | orbit:read | READ | Read |
| `money_get_dashboard` | GET `dashboard` | orbit:read | READ | Read |
| `money_get_attention_summary` | GET `attention` | orbit:read | READ | Read |
| `money_list_review_items` | GET `review-items` | orbit:read | READ | Read |
| `money_get_review_item` | GET `review-item` | orbit:read | READ | Read |
| `money_get_review_candidates` | GET `review-candidates` | orbit:read | READ | Read |
| `money_list_processing_events` | GET `processing-events` | orbit:read | READ | Read |
| `money_get_review_history` | GET `review-history` | orbit:read | READ | Read |
| `money_search_bookkeeping` | GET `bookkeeping` | orbit:read | READ | Read |
| `money_get_bookkeeping_item` | GET `bookkeeping-item` | orbit:read | READ | Read |
| `money_get_classification_candidates` | GET `classification-candidates` | orbit:read | READ | Read |
| `money_get_classification_history` | GET `classification-history` | orbit:read | READ | Read |
| `money_list_merchants_and_links` | GET `merchants` | orbit:read | READ | Read |
| `money_list_categories` | GET `categories` | orbit:read | READ | Read |
| `money_get_category_impact` | GET `category-impact` | orbit:read | READ | Read |
| `money_get_category_palette` | GET `category-palette` | orbit:read | READ | Read |
| `money_list_classification_rules` | GET `rules` | orbit:read | READ | Read |
| `money_get_classification_rule` | GET `rule` | orbit:read | READ | Read |
| `money_preview_rule_matches` | GET `rule-matches` | orbit:read | READ | Read |
| `money_list_accounts` | GET `accounts` | orbit:read | READ | Read |
| `money_get_account_detail` | GET `account` | orbit:read | READ | Read |
| `money_get_reconciliation_summary` | GET `reconciliation` | orbit:read | READ | Read |
| `money_get_account_reconciliation` | GET `account-reconciliation` | orbit:read | READ | Read |
| `money_get_bank_cutoff_projection` | GET `bank-cutoff-projection` | orbit:read | READ | Read |
| `money_get_notification_reparse_diagnostic` | GET `notification-reparse-diagnostic` | orbit:read | READ | Read |
| `money_get_transaction_financial_detail` | GET `financial-detail` | orbit:read | READ | Read |
| `money_get_logical_savings_balance` | GET `financial-engine/savings-balance` | orbit:read | READ | Read |
| `money_get_contribution_summary` | GET `financial-engine/summary` | orbit:read | READ | Read |
| `money_get_composition` | GET `financial-engine/composition` | orbit:read | READ | Read |
| `money_list_account_transactions` | GET `financial-engine/ledger` | orbit:read | READ | Read |
| `money_get_financial_suggestions` | GET `financial-engine/candidates` | orbit:read | READ | Read |
| `money_get_financial_engine_status` | GET `financial-engine/status` | orbit:read | READ | Read |
| `money_get_financial_decision_history` | GET `financial-engine/history` | orbit:read | READ | Read |
| `money_get_financial_rules` | GET `financial-engine/rules` | orbit:read | READ | Read |
| `money_preview_financial_backfill` | GET `financial-engine/backfill-preview` | orbit:read | READ | Read |
| `money_get_financial_shadow_run` | GET `financial-engine/shadow-run` | orbit:read | READ | Read |
| `money_run_financial_shadow` | POST `financial-engine/shadow` | orbit:read + orbit:write:money | A | Canonical guarded write |
| `money_save_financial_rule` | POST `financial-engine/save-rule` | orbit:read + orbit:write:money | B | Canonical guarded write |
| `money_save_financial_intent` | POST `financial-engine/intent` | orbit:read + orbit:write:money | B | Canonical guarded write |
| `money_preview_financial_batch` | POST `financial-engine/batch-preview` | orbit:read + orbit:write:money | B | Preview receipt only |
| `money_execute_financial_batch` | POST `financial-engine/batch-execute` | orbit:read + orbit:write:money | B | Canonical guarded write |
| `money_quick_confirm_financial_type` | POST `financial-engine/quick-confirm` | orbit:read + orbit:write:money | B | Canonical guarded write |
| `money_get_overdraft_facilities` | GET `overdraft-facilities` | orbit:read | READ | Read |
| `money_list_loans` | GET `loans` | orbit:read | READ | Read |
| `money_get_loan_repayments` | GET `loan-repayments` | orbit:read | READ | Read |
| `money_list_savings` | GET `savings` | orbit:read | READ | Read |
| `money_get_money_change_history` | GET `change-history` | orbit:read | READ | Read |
| `money_get_operation_outcome` | GET `operation-outcome` | orbit:read | READ | Read |
| `money_set_category_color` | POST `category-color` | orbit:read + orbit:write:money | A | Canonical guarded write |
| `money_create_category` | POST `create-category` | orbit:read + orbit:write:money | A | Canonical guarded write |
| `money_edit_category_metadata` | POST `category-metadata` | orbit:read + orbit:write:money | A | Canonical guarded write |
| `money_reorder_sibling_categories` | POST `category-order` | orbit:read + orbit:write:money | A | Canonical guarded write |
| `money_set_bookkeeping_category` | POST `bookkeeping-category` | orbit:read + orbit:write:money | A | Canonical guarded write |
| `money_bulk_classify_bookkeeping` | POST `bulk-classify` | orbit:read + orbit:write:money | A | Canonical guarded write |
| `money_edit_bookkeeping_meaning` | POST `bookkeeping-meaning` | orbit:read + orbit:write:money | A | Canonical guarded write |
| `money_preview_category_color_plan` | POST `preview/category-color-plan` | orbit:read + orbit:write:money | B | Preview receipt only |
| `money_apply_category_color_plan` | POST `execute/category-color-plan` | orbit:read + orbit:write:money | A | Canonical guarded write |
| `money_preview_classification_batch` | POST `preview/classification-batch` | orbit:read + orbit:write:money | B | Preview receipt only |
| `money_execute_classification_batch` | POST `execute/classification-batch` | orbit:read + orbit:write:money | B | Canonical guarded write |
| `money_preview_rule_change` | POST `preview/rule-change` | orbit:read + orbit:write:money | B | Preview receipt only |
| `money_save_classification_rule` | POST `execute/rule-change` | orbit:read + orbit:write:money | B | Canonical guarded write |
| `money_preview_rule_history` | POST `preview/rule-history` | orbit:read + orbit:write:money | B | Preview receipt only |
| `money_apply_rule_history` | POST `execute/rule-history` | orbit:read + orbit:write:money | B | Canonical guarded write |
| `money_preview_category_structure_change` | POST `preview/category-structure` | orbit:read + orbit:write:money | B | Preview receipt only |
| `money_execute_category_structure_change` | POST `execute/category-structure` | orbit:read + orbit:write:money | B | Canonical guarded write |
| `money_preview_financial_correction` | POST `preview/financial-correction` | orbit:read + orbit:write:money | B | Preview receipt only |
| `money_execute_financial_correction` | POST `execute/financial-correction` | orbit:read + orbit:write:money | B | Canonical guarded write |
| `money_preview_account_settings_change` | POST `preview/account-settings` | orbit:read + orbit:write:money | B | Preview receipt only |
| `money_execute_account_settings_change` | POST `execute/account-settings` | orbit:read + orbit:write:money | B | Canonical guarded write |
| `money_preview_undo_classification` | POST `preview/undo-classification` | orbit:read + orbit:write:money | B | Preview receipt only |
| `money_undo_classification` | POST `execute/undo-classification` | orbit:read + orbit:write:money | B | Canonical guarded write |
| `money_preview_review_batch` | POST `preview/review-batch` | orbit:read + orbit:write:money | B | Preview receipt only |
| `money_execute_review_batch` | POST `execute/review-batch` | orbit:read + orbit:write:money | B | Canonical guarded write |
| `money_recon_get_capabilities` | GET `recon/capabilities` | orbit:read | READ | Read |
| `money_recon_intake_start` | POST `recon/intake-start` | orbit:read + orbit:write:money | READ | Canonical guarded write |
| `money_recon_intake_chunk` | POST `recon/intake-chunk` | orbit:read + orbit:write:money | READ | Canonical guarded write |
| `money_recon_import_statement_preview` | POST `recon/import-preview` | orbit:read + orbit:write:money | READ | Canonical guarded write |
| `money_recon_list_statements` | GET `recon/statements` | orbit:read | READ | Read |
| `money_recon_get_statement` | GET `recon/statement` | orbit:read | READ | Read |
| `money_recon_list_rows` | GET `recon/rows` | orbit:read | READ | Read |
| `money_recon_analyze` | POST `recon/analyze` | orbit:read + orbit:write:money | READ | Canonical guarded write |
| `money_recon_get_status` | GET `recon/status` | orbit:read | READ | Read |
| `money_recon_get_candidate_details` | GET `recon/candidate` | orbit:read | READ | Read |
| `money_get_statement_balance_observation` | GET `recon/observation` | orbit:read | READ | Read |
| `money_recon_batch_preview` | POST `recon/batch-preview` | orbit:read + orbit:write:money | B | Preview receipt only |
| `money_recon_batch_execute` | POST `recon/batch-execute` | orbit:read + orbit:write:money | B | Canonical guarded write |
| `money_recon_remaining_preview` | POST `recon/remaining-preview` | orbit:read + orbit:write:money | B | Preview receipt only |
| `money_recon_remaining_execute` | POST `recon/remaining-execute` | orbit:read + orbit:write:money | B | Canonical guarded write |
| `money_recon_get_internal_events` | GET `recon/internal-events` | orbit:read | READ | Read |
| `money_recon_get_execution_history` | GET `recon/history` | orbit:read | READ | Read |

## Preserved tools

| Tool | Backend route | Required scopes | Tier | Effect |
|---|---|---|---|---|
| `get_sleep_context` | GET `/api/orbit/context/get_sleep_context` | orbit:read | READ | Preserved read |
| `get_recovery_context` | GET `/api/orbit/context/get_recovery_context` | orbit:read | READ | Preserved read |
| `get_diet_context` | GET `/api/orbit/context/get_diet_context` | orbit:read | READ | Preserved read |
| `get_diet_daily_context` | GET `/api/orbit/context/get_diet_daily_context` | orbit:read | READ | Preserved read |
| `get_diet_progress_context` | GET `/api/orbit/context/get_diet_progress_context` | orbit:read | READ | Preserved read |
| `get_calendar_context` | GET `/api/orbit/context/get_calendar_context` | orbit:read | READ | Preserved read |
| `get_work_records_context` | GET `/api/orbit/context/get_work_records_context` | orbit:read | READ | Preserved read |
| `get_checklist_catalog_context` | GET `/api/orbit/context/get_checklist_catalog_context` | orbit:read | READ | Preserved read |
| `get_checklist_records_context` | GET `/api/orbit/context/get_checklist_records_context` | orbit:read | READ | Preserved read |
| `get_workflow_projects_context` | GET `/api/orbit/context/get_workflow_projects_context` | orbit:read | READ | Preserved read |
| `get_workflow_tasks_context` | GET `/api/orbit/context/get_workflow_tasks_context` | orbit:read | READ | Preserved read |
| `get_workflow_day_context` | GET `/api/orbit/context/get_workflow_day_context` | orbit:read | READ | Preserved read |
| `get_workflow_plan_context` | GET `/api/orbit/context/get_workflow_plan_context` | orbit:read | READ | Preserved read |
| `get_workflow_waiting_context` | GET `/api/orbit/context/get_workflow_waiting_context` | orbit:read | READ | Preserved read |
| `get_money_overview_context` | GET `/api/orbit/context/get_money_overview_context` | orbit:read | READ | Preserved read |
| `get_money_transactions_context` | GET `/api/orbit/context/get_money_transactions_context` | orbit:read | READ | Preserved read |
| `get_money_accounts_context` | GET `/api/orbit/context/get_money_accounts_context` | orbit:read | READ | Preserved read |
| `get_money_loans_context` | GET `/api/orbit/context/get_money_loans_context` | orbit:read | READ | Preserved read |
| `get_money_savings_context` | GET `/api/orbit/context/get_money_savings_context` | orbit:read | READ | Preserved read |
| `get_money_earnings_context` | GET `/api/orbit/context/get_money_earnings_context` | orbit:read | READ | Preserved read |
