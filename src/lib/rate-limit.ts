interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Simple in-memory token bucket. Good enough for a single instance;
 * see docs/DECISIONS.md for the serverless caveat.
 */
export function rateLimit(
  key: string,
  { capacity, refillPerSec }: { capacity: number; refillPerSec: number },
): boolean {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: capacity, updatedAt: now };
  const elapsed = (now - bucket.updatedAt) / 1000;
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerSec);
  bucket.updatedAt = now;
  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    return false;
  }
  bucket.tokens -= 1;
  buckets.set(key, bucket);
  if (buckets.size > 5000) {
    for (const [k, b] of buckets) if (now - b.updatedAt > 3_600_000) buckets.delete(k);
  }
  return true;
}
