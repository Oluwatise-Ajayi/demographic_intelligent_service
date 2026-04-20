# Profile Intelligence Service

This repository contains the backend for the Insighta Labs demographic intelligence project. It upgrades the existing system with advanced filtering, sorting, pagination, and a natural language search endpoint for the `profiles` data.

## Natural Language Parsing Approach

The `/api/profiles/search?q=...` endpoint uses rule-based parsing (no AI/LLM) to convert plain English strings into database filters. 

### How the Logic Works
The parsing works by looking for specific keywords and regex patterns in the user query and mapping them to `ProfileFilters` properties (`gender`, `min_age`, `max_age`, `age_group`, `country_id`). Each match directly builds up the compound filter object. If no conditions are matched, the parser rejects the query.

### Supported Keywords and Mappings

1. **Gender:**
   - **male**: Looks for "male", "men", "boy", "boys" `-> gender=male`
   - **female**: Looks for "female", "women", "girl", "girls" `-> gender=female`
   - _Note:_ the parser uses word boundaries or string-specific checks to avoid mapping "female" queries as "male".

2. **Age & Age Groups:**
   - **"young"**: Specifically maps to ages 16-24 (`min_age=16`, `max_age=24`).
   - **"teenager(s)"**, **"adult(s)"**, **"senior(s)"**, **"child(ren)"**: Maps to the corresponding `age_group` fields (`teenager`, `adult`, `senior`, `child`).
   - **"above X"**, **"over X"**, **"older than X"**: `-> min_age=X`
   - **"below X"**, **"under X"**, **"younger than X"**: `-> max_age=X`

3. **Country / Origin:**
   - Detects the pattern `from [Country Name]` or parses pure country names (e.g. `nigeria`, `angola`, `kenya`, `united states`, `uk`, `united kingdom`) mapping them to the standard ISO-2 Codes (e.g. `NG`, `AO`, `KE`, `US`, `GB`).

### Limitations & Unhandled Edge Cases
Our parser achieves its speed by relying purely on string matching rules rather than semantic understanding. Due to this constraint, it has certain limitations:

1. **Complex Conjunctions/Disjunctions**: The parser interprets all conditions as `AND` logical conjunctions. It does not reliably process `OR` logic such as "males or teenagers from nigeria". Similarly, exclusions like "everyone *except* males" will still match "males" and filter only males.
2. **Compound Groupings**: Queries with multiple conflicting constraints like "young adults and old males" will lead to overwritten map values or empty result sets (e.g., trying to strictly enforce `age_group=adult` AND `age=16-24`). Wait, "young" does `min_age=16, max_age=24`.
3. **Spelling Sensitivity**: Country names, pronouns, and keywords must be reasonably spelled. "nigaria" instead of "nigeria" wouldn't match. 
4. **Phrased Ranges**: It parses straightforward inequalities ("above 25", "under 18") but doesn't handle English ranges natively formatted like "between 20 and 30".
5. **Partial Country Coverage**: The manual dictionary mapping common names to country IDs currently supports ~20 high-frequency countries. Less common countries need explicit addition to the mapping switch otherwise they won't restrict the data block.
