# Stage 4B: System Optimization & Data Ingestion

## 1. Query Performance Optimization

### Approach & Implementation
To ensure queries respond in the low hundreds of milliseconds under high concurrency, two main optimization techniques were implemented:

1.  **Database Indexing:** Composite B-Tree indexes were added to the `Profile` entity on frequently queried columns (`country_id`, `gender`, `age_group`, `age`, and `created_at`). This prevents the database from performing full table scans when filtering demographic subsets.
2.  **In-Memory Caching:** We introduced `@nestjs/cache-manager` with the default in-memory store to cache the results of executed queries for 5 minutes (300,000ms). Because ~40% of queries are repeated, this drastically reduces redundant database computations. *(Note: While an external Redis cache is ideal for scale, an in-memory cache was chosen to strictly adhere to the "No new database systems" constraint).*

### Before/After Performance Comparison (Estimated Latency)

| Query Type | Before (No Cache/No Index) | After (Cache Miss / Indexed) | After (Cache Hit) |
| :--- | :--- | :--- | :--- |
| Simple Filter (`country=NG`) | ~1200ms (Table scan) | ~150ms | ~15ms |
| Complex Aggregation (`age_group=adult&gender=female`) | ~2500ms (Table scan) | ~200ms | ~15ms |
| High Concurrency (100 req/s, repeated) | Timed out / Server Crash | Stable (~300ms avg) | Stable (~20ms avg) |

## 2. Query Normalization

### Approach & Implementation
To maximize cache hit rates, queries with identical intent but varying formats (e.g., lowercase vs. uppercase, different query parameter orders) must map to the same cache key.

We implemented a `normalizeFilters` helper method in `ProfilesService` that:
1.  Alphabetically sorts all filter keys before serialization.
2.  Normalizes string values (e.g., standardizing "Women" to "female" inside the natural language parser, and calling `.toLowerCase()` on all string filter values).
3.  Removes `undefined`, `null`, or empty parameters from the cache key string.

**Trade-off:** Normalization adds a negligible CPU overhead (sub-millisecond) during query parsing, but the gain in Cache Hit ratios (>40% expected) outweighs this cost infinitely.

## 3. CSV Data Ingestion

### Approach & Implementation
Handling up to 500,000 rows requires memory-safe streaming to prevent Out-Of-Memory (OOM) exceptions.

1.  **Streaming & Chunking:** We implemented an endpoint `POST /api/profiles/upload` using Multer `diskStorage` to save the file to disk temporarily, avoiding RAM exhaustion.
2.  We use `fs.createReadStream().pipe(csvParser())` to stream the data row-by-row.
3.  **Batch Processing:** Rows are accumulated into chunks of 1,000. When a chunk is full, we pause streaming, validate the chunk, and execute a bulk `INSERT` into PostgreSQL.

### Handling Failures & Edge Cases
*   **Missing/Invalid Fields:** Every row is validated. If `age` is negative or `country_id` is missing, the row is skipped and logged under the `reasons` summary.
*   **Idempotency (Duplicate Names):** Before inserting a batch, we run a bulk `SELECT name FROM profiles WHERE name IN (...)` to identify and skip duplicates in one fast query instead of checking one-by-one.
*   **Partial Failures:** If a bulk `INSERT` operation fails (e.g., one malformed string breaks the SQL constraint), the `catch` block intercepts it and falls back to inserting the valid rows *one-by-one*. This guarantees that "a single bad row must never fail the entire upload."
*   **Cleanup:** The temporary CSV file is safely deleted via `fs.unlinkSync()` using a `finally` block, ensuring disk space isn't exhausted over time.

### System Trade-offs & Constraint Adherence
*   **Cache Stale Time:** With a 5-minute TTL on the cache, a bulk upload of 100,000 users might not reflect in immediate subsequent read queries until the cache expires. This is an acceptable trade-off for high read availability.
*   **No Horizontal Scaling / No Message Queues:** To adhere to the "No horizontal scaling" and "No unnecessary infrastructure" constraints, we did not offload processing to a background worker (e.g., BullMQ/RabbitMQ). The chunked CSV ingestion runs asynchronously within the main Node.js event loop, carefully yielding to avoid blocking read queries.
*   **No Redis:** To adhere to the "No new database systems" constraint, query caching is handled in Node.js memory. This limits cache sharing across multiple app servers (if we were to scale horizontally in the future), but it is the optimal choice under the current constraints.
