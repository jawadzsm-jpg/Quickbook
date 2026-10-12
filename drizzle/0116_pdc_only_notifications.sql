-- Cheque notices are kept only for post-dated cheques: remove "written" / "updated" notices for cheques that were not
-- dated after the day the notice was created (UAE time). PDC reminders and other notices are untouched.
DELETE FROM "notifications" n USING "transactions" t
WHERE n."transaction_id" = t."id"
  AND n."kind" IN ('cheque-written', 'cheque-updated')
  AND t."transaction_date" <= to_char((n."created_at" AT TIME ZONE 'Asia/Dubai')::date, 'YYYY-MM-DD');
