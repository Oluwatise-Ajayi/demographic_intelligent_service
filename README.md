# Insighta Labs+ Platform (Stage 3)

This repository contains the backend for the Insighta Labs demographic intelligence project. In Stage 3, the Profile Intelligence Service has been upgraded into a fully secure, multi-interface platform supporting both web browsers and CLI tools.

## Key Features & Stage 3 Updates

### 1. Unified Authentication (OAuth + PKCE)
- **GitHub OAuth**: Users authenticate securely via their GitHub accounts.
- **PKCE Support**: Implemented the Proof Key for Code Exchange (PKCE) flow to ensure secure OAuth handshakes, preventing interception attacks.
- **Multi-Client Support**: The authentication flow seamlessly handles both:
  - **CLI Tools**: Returns tokens for local storage.
  - **Web Portal**: Automatically manages sessions via secure, `HttpOnly`, `SameSite=Lax` cookies to prevent XSS attacks.

### 2. Session Management & Security
- **JWT Rotation**: Access tokens (3-minute expiry) and refresh tokens (5-minute expiry).
- **Server-Side Revocation**: Refresh tokens are hashed and stored in the database, allowing immediate invalidation on logout or token rotation.
- **CSRF Protection**: Web sessions receive a CSRF token to protect state-changing requests.
- **Rate Limiting**: Protects endpoints against brute-force and DDoS attacks (10 requests/min for Auth, 60 requests/min globally).

### 3. Role-Based Access Control (RBAC)
- **Analyst Role**: Read-only access. Can search, filter, paginate, and export profiles.
- **Admin Role**: Full access. Can create new profiles and delete all profiles, in addition to analyst capabilities.
- Enforced strictly via a custom NestJS `@Roles()` guard across all protected endpoints.

### 4. API Standardization
- **API Versioning**: All profile endpoints strictly require the `X-API-Version: 1` header, enforced by an `ApiVersionGuard`.
- **HATEOAS Pagination**: Responses now include a standard `links` object (`self`, `next`, `prev`) dynamically generating query URLs for easier frontend and CLI pagination.
- **CSV Export**: A dedicated endpoint (`/api/profiles/export`) allows analysts and admins to download filtered profile segments as structured CSV data.

---

## Stage 2 Features (Retained)

### Natural Language Parsing Approach
The `/api/profiles/search?q=...` endpoint uses rule-based parsing (no AI/LLM) to convert plain English strings into database filters. 

### How the Logic Works
The parsing works by looking for specific keywords and regex patterns in the user query and mapping them to `ProfileFilters` properties (`gender`, `min_age`, `max_age`, `age_group`, `country_id`). 

1. **Gender:**
   - **male**: Looks for "male", "men", "boy", "boys" `-> gender=male`
   - **female**: Looks for "female", "women", "girl", "girls" `-> gender=female`
2. **Age & Age Groups:**
   - **"young"**: Maps to ages 16-24 (`min_age=16`, `max_age=24`).
   - **"teenager(s)"**, **"adult(s)"**, **"senior(s)"**, **"child(ren)"**: Maps to `age_group`.
   - **"above X"**, **"under X"**, **"between X and Y"**: Parses direct numerical ranges.
3. **Country / Origin:**
   - Detects patterns like `from [Country Name]` or `in [Country Name]` and maps them to standard ISO-2 Codes.

---

## Local Development Setup

1. Rename `.env.example` to `.env` (or create a `.env` file) and fill in the values:
   ```env
   GITHUB_CLIENT_ID=your_github_client_id
   GITHUB_CLIENT_SECRET=your_github_client_secret
   JWT_SECRET=your_super_secret_jwt_key
   BACKEND_URL=http://localhost:3000
   WEB_PORTAL_URL=http://localhost:3001
   NODE_ENV=development
   ```
2. Run `npm install`
3. Run `npm run start:dev`
4. Visit `http://localhost:3000/api/docs` to view the comprehensive, interactive Swagger documentation.
