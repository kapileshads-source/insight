-- The evening "what's due tomorrow" reminder, opted into by default like the
-- other two. Additive with a default, so existing subscriptions keep working
-- and nobody has to re-subscribe to get it.
ALTER TABLE "PushSubscription"
  ADD COLUMN "dueWorkNudge" BOOLEAN NOT NULL DEFAULT true;
