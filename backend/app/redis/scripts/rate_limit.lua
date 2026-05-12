-- rate_limit.lua
-- Token bucket rate limiter
-- KEYS[1] = rate_limit:{user_id}:{resource}
-- ARGV[1] = max_tokens (burst)
-- ARGV[2] = refill_rate_per_second
-- ARGV[3] = cost (usually 1)
-- ARGV[4] = current timestamp in ms

local key = KEYS[1]
local max_tokens = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local now_ms = tonumber(ARGV[4])

local bucket = redis.call("HMGET", key, "tokens", "last_refill")
local tokens = tonumber(bucket[1])
local last_refill = tonumber(bucket[2])

if tokens == nil then
    tokens = max_tokens
    last_refill = now_ms
end

-- Refill tokens based on elapsed time
local elapsed_ms = now_ms - last_refill
local new_tokens = math.min(max_tokens, tokens + (elapsed_ms / 1000.0) * refill_rate)

if new_tokens >= cost then
    new_tokens = new_tokens - cost
    redis.call("HMSET", key, "tokens", tostring(new_tokens), "last_refill", tostring(now_ms))
    redis.call("EXPIRE", key, 3600)
    return cjson.encode({allowed = true, remaining = math.floor(new_tokens)})
else
    redis.call("HMSET", key, "tokens", tostring(new_tokens), "last_refill", tostring(now_ms))
    redis.call("EXPIRE", key, 3600)
    local retry_after_ms = math.ceil((cost - new_tokens) / refill_rate * 1000)
    return cjson.encode({allowed = false, retry_after_ms = retry_after_ms})
end
