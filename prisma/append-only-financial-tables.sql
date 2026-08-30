-- Financial rows cannot be updated or deleted.
--
-- "Append-only by convention" is a sentence in a comment. A ledger whose rows
-- can be edited into agreement with a cached total is not a ledger — it is a
-- cache with extra steps, and the disagreement that would have revealed a bug
-- gets quietly resolved by whoever noticed it.
--
-- So it is a constraint the database enforces, on both tables, for every
-- caller: the application, a script, a psql session, and whoever is debugging
-- at 2am with the best of intentions.
--
-- A correction is a NEW ROW. A refund reverses a capture; a credit reverses an
-- addition. That is how ledgers have always worked and it is why they can be
-- audited.

CREATE OR REPLACE FUNCTION price2book_reject_financial_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION
    'append-only: % on %.% is not permitted. A correction is a new row — a refund reverses a capture, a credit reverses an addition.',
    TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payment_events_append_only ON payment_events;
CREATE TRIGGER payment_events_append_only
  BEFORE UPDATE OR DELETE ON payment_events
  FOR EACH ROW EXECUTE FUNCTION price2book_reject_financial_mutation();

DROP TRIGGER IF EXISTS booking_adjustments_append_only ON booking_adjustments;
CREATE TRIGGER booking_adjustments_append_only
  BEFORE UPDATE OR DELETE ON booking_adjustments
  FOR EACH ROW EXECUTE FUNCTION price2book_reject_financial_mutation();
