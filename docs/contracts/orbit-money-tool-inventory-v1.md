# ORBIT MONEY exact tool inventory

Existing 20 tools in server.mjs are preserved unchanged. 54 additions; 74 hosted tools total. All routes below are relative to /api/orbit/money/v1/. The JSON inventory contains every exact required/optional field and closed schema.

| Tool | Backend route | Scope | Tier | Effect |
|---|---|---|---|---|
| `money_get_console_capabilities` | GET `capabilities` | orbit:read | READ | Read |
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
| `money_get_transaction_financial_detail` | GET `financial-detail` | orbit:read | READ | Read |
| `money_list_loans` | GET `loans` | orbit:read | READ | Read |
| `money_get_loan_repayments` | GET `loan-repayments` | orbit:read | READ | Read |
| `money_list_savings` | GET `savings` | orbit:read | READ | Read |
| `money_get_money_change_history` | GET `change-history` | orbit:read | READ | Read |
| `money_get_operation_outcome` | GET `operation-outcome` | orbit:read | READ | Read |
| `money_set_category_color` | POST `category-color` | orbit:write:money | A | Canonical guarded write |
| `money_create_category` | POST `create-category` | orbit:write:money | A | Canonical guarded write |
| `money_edit_category_metadata` | POST `category-metadata` | orbit:write:money | A | Canonical guarded write |
| `money_reorder_sibling_categories` | POST `category-order` | orbit:write:money | A | Canonical guarded write |
| `money_set_bookkeeping_category` | POST `bookkeeping-category` | orbit:write:money | A | Canonical guarded write |
| `money_bulk_classify_bookkeeping` | POST `bulk-classify` | orbit:write:money | A | Canonical guarded write |
| `money_edit_bookkeeping_meaning` | POST `bookkeeping-meaning` | orbit:write:money | A | Canonical guarded write |
| `money_preview_category_color_plan` | POST `preview/category-color-plan` | orbit:write:money | B | Preview receipt only |
| `money_apply_category_color_plan` | POST `execute/category-color-plan` | orbit:write:money | A | Canonical guarded write |
| `money_preview_classification_batch` | POST `preview/classification-batch` | orbit:write:money | B | Preview receipt only |
| `money_execute_classification_batch` | POST `execute/classification-batch` | orbit:write:money | B | Canonical guarded write |
| `money_preview_rule_change` | POST `preview/rule-change` | orbit:write:money | B | Preview receipt only |
| `money_save_classification_rule` | POST `execute/rule-change` | orbit:write:money | B | Canonical guarded write |
| `money_preview_rule_history` | POST `preview/rule-history` | orbit:write:money | B | Preview receipt only |
| `money_apply_rule_history` | POST `execute/rule-history` | orbit:write:money | B | Canonical guarded write |
| `money_preview_category_structure_change` | POST `preview/category-structure` | orbit:write:money | B | Preview receipt only |
| `money_execute_category_structure_change` | POST `execute/category-structure` | orbit:write:money | B | Canonical guarded write |
| `money_preview_financial_correction` | POST `preview/financial-correction` | orbit:write:money | B | Preview receipt only |
| `money_execute_financial_correction` | POST `execute/financial-correction` | orbit:write:money | B | Canonical guarded write |
| `money_preview_account_settings_change` | POST `preview/account-settings` | orbit:write:money | B | Preview receipt only |
| `money_execute_account_settings_change` | POST `execute/account-settings` | orbit:write:money | B | Canonical guarded write |
| `money_preview_undo_classification` | POST `preview/undo-classification` | orbit:write:money | B | Preview receipt only |
| `money_undo_classification` | POST `execute/undo-classification` | orbit:write:money | B | Canonical guarded write |
| `money_preview_review_batch` | POST `preview/review-batch` | orbit:write:money | B | Preview receipt only |
| `money_execute_review_batch` | POST `execute/review-batch` | orbit:write:money | B | Canonical guarded write |
