-- Daily operations (phase 4), part 1: a 'sending' state for the outbox.
--
-- On its own because a new enum value can't be used in the transaction that
-- adds it; the next migration's functions use it.
alter type public.message_status add value if not exists 'sending' after 'queued';
