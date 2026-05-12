-- dedup.lua
-- Deduplicate client_bid_id per user
-- KEYS[1] = dedup:user:{user_id}
-- ARGV[1] = client_bid_id
-- ARGV[2] = TTL in seconds (default 60)

local key = KEYS[1]
local client_bid_id = ARGV[1]
local ttl = tonumber(ARGV[2] or "60")

local exists = redis.call("SISMEMBER", key, client_bid_id)
if exists == 1 then
    return cjson.encode({is_duplicate = true})
end

redis.call("SADD", key, client_bid_id)
redis.call("EXPIRE", key, ttl)
return cjson.encode({is_duplicate = false})
