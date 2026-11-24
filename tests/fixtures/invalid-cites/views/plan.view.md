# Refactor Payment (v1)

## Objective

Consolidate all payment validation into PaymentValidator

## DAG

| id | task |
|---|---|
| s1 | tasks/01_extract_validator.yaml |
| s2 | tasks/02_replace_callers.yaml |

## Exclusions

- src/billing.py: payment validation is not in the billing layer
- src/legacy/**: deprecated, not part of the call chain
