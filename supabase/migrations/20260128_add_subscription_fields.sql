-- Add subscription fields to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_platform TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_id TEXT;

-- Create index for subscription queries
CREATE INDEX IF NOT EXISTS idx_users_subscription_tier ON users(subscription_tier);
CREATE INDEX IF NOT EXISTS idx_users_subscription_expires ON users(subscription_expires_at);

-- Add comment for documentation
COMMENT ON COLUMN users.subscription_tier IS 'free, plus, pro, or business';
COMMENT ON COLUMN users.subscription_platform IS 'ios, android, or web';
COMMENT ON COLUMN users.subscription_id IS 'RevenueCat subscription identifier';
