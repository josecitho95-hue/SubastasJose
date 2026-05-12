-- bid_script.lua
-- KEYS[1] = auction:{id}:state
-- KEYS[2] = user:{user_id}:wallet
-- ARGV[1] = bid amount (string)
-- ARGV[2] = current timestamp in ms
-- ARGV[3] = user_id
-- ARGV[4] = client_bid_id
-- ARGV[5] = min_bid_increment
-- ARGV[6] = anti_snipe_ms (default 60000)

local auction_key = KEYS[1]
local wallet_key = KEYS[2]
local amount = tonumber(ARGV[1])
local now_ms = tonumber(ARGV[2])
local user_id = ARGV[3]
local client_bid_id = ARGV[4]
local min_increment = tonumber(ARGV[5])
local anti_snipe_ms = tonumber(ARGV[6] or "60000")

-- Load auction state
local state = redis.call("HMGET", auction_key, "current_price", "leader_id", "end_time", "status", "min_bid_increment")
local current_price = tonumber(state[1] or "0")
local leader_id = state[2]
local end_time = tonumber(state[3] or "0")
local status = state[4] or "active"

-- 1. Check auction is active
if status ~= "active" then
    return cjson.encode({status = "rejected", reason = "auction_not_active"})
end

-- 2. Check time
if now_ms >= end_time then
    return cjson.encode({status = "rejected", reason = "auction_ended"})
end

-- 3. Check minimum increment
if amount < (current_price + min_increment) then
    return cjson.encode({status = "rejected", reason = "below_min_increment", current_price = tostring(current_price)})
end

-- 4. Load bidder wallet
local wallet = redis.call("HMGET", wallet_key, "free", "held")
local free_balance = tonumber(wallet[1] or "0")
local held_balance = tonumber(wallet[2] or "0")

if free_balance < amount then
    return cjson.encode({status = "rejected", reason = "insufficient_balance", required = tostring(amount), available = tostring(free_balance)})
end

-- 5. Release previous leader's hold
if leader_id and leader_id ~= user_id then
    local prev_wallet_key = "user:" .. leader_id .. ":wallet"
    local prev_wallet = redis.call("HMGET", prev_wallet_key, "free", "held")
    local prev_free = tonumber(prev_wallet[1] or "0")
    local prev_held = tonumber(prev_wallet[2] or "0")
    -- Release the hold back to free
    redis.call("HMSET", prev_wallet_key, "free", tostring(prev_free + current_price), "held", tostring(prev_held - current_price))
end

-- 6. Apply new hold
redis.call("HMSET", wallet_key, "free", tostring(free_balance - amount), "held", tostring(held_balance + amount))

-- 7. Update auction state
local new_end_time = end_time
if (end_time - now_ms) < anti_snipe_ms then
    new_end_time = end_time + anti_snipe_ms
end

redis.call("HMSET", auction_key,
    "current_price", tostring(amount),
    "leader_id", user_id,
    "end_time", tostring(new_end_time),
    "last_bid_id", client_bid_id,
    "last_bid_at", tostring(now_ms)
)

-- 8. Add to stream
local event = cjson.encode({
    type = "bid_accepted",
    auction_id = string.match(auction_key, "auction:(.+):state"),
    user_id = user_id,
    amount = tostring(amount),
    client_bid_id = client_bid_id,
    previous_price = tostring(current_price),
    previous_leader = leader_id,
    new_end_time = tostring(new_end_time),
    timestamp = tostring(now_ms)
})
local seq = redis.call("XADD", "stream:" .. string.match(auction_key, "auction:(.+):state"), "*", "data", event)

return cjson.encode({
    status = "accepted",
    new_price = tostring(amount),
    new_end_time = tostring(new_end_time),
    seq = seq,
    previous_price = tostring(current_price),
    previous_leader = leader_id
})
