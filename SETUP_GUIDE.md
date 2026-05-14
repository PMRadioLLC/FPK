# Fun Pizza Kitchen — Developer Setup Guide

## What We're Building

This is a full-stack project with three parts:

| Component | Tech | What It Does |
|-----------|------|--------------|
| **Backend API** | NestJS + PostgreSQL + Redis | Handles all business logic, auth, payments, barcode validation |
| **Mobile App** | React Native (Expo) | Customer membership + Staff scanning (same app, role-based) |
| **Admin Dashboard** | Next.js | Web-based management for owners/managers |

We're building the **backend first** because both the mobile app and dashboard depend on it.

---

## Step 1: Install Required Tools on Your Machine

### 1.1 — Node.js (v20 or higher)

Download from: https://nodejs.org/en/download
Pick the LTS version. After installing, verify:

```bash
node --version   # Should show v20.x.x or higher
npm --version    # Should show 10.x.x or higher
```

### 1.2 — PostgreSQL (v15 or higher)

**Mac:**
```bash
brew install postgresql@15
brew services start postgresql@15
```

**Windows:**
Download installer from https://www.postgresql.org/download/windows/
During install, remember the password you set for the `postgres` user.

**After installing, create the database:**
```bash
psql -U postgres
CREATE DATABASE fpk_drinks;
\q
```

### 1.3 — Redis (v7 or higher)

**Mac:**
```bash
brew install redis
brew services start redis
```

**Windows:**
Redis doesn't officially support Windows. Use one of these:
- Docker: `docker run -d -p 6379:6379 redis:7`
- Or install WSL2 (Windows Subsystem for Linux) and install Redis there
- Or use Memurai (Redis-compatible for Windows): https://www.memurai.com/

**Verify Redis is running:**
```bash
redis-cli ping   # Should respond: PONG
```

### 1.4 — Git

Download from: https://git-scm.com/downloads
Verify: `git --version`

### 1.5 — VS Code (Recommended Editor)

Download from: https://code.visualstudio.com/

**Install these extensions:**
- ESLint
- Prettier
- Thunder Client (for testing API endpoints)
- PostgreSQL (by Chris Kolkman)

### 1.6 — Stripe CLI (For Payment Testing)

```bash
# Mac
brew install stripe/stripe-cli/stripe

# Windows — download from https://stripe.com/docs/stripe-cli
```

### 1.7 — (Optional but Recommended) Docker

If you want to run PostgreSQL and Redis in containers instead of installing them directly:

```bash
# Download Docker Desktop from https://www.docker.com/products/docker-desktop
# Then run both services:
docker run -d --name fpk-postgres -p 5432:5432 -e POSTGRES_DB=fpk_drinks -e POSTGRES_PASSWORD=yourpassword postgres:15
docker run -d --name fpk-redis -p 6379:6379 redis:7
```

---

## Step 2: Project Setup

### 2.1 — Download and Extract the Backend

Take the `fpk-backend` folder I've created for you and place it wherever you keep your projects (e.g., `~/Projects/fpk-backend`).

### 2.2 — Install Dependencies

```bash
cd fpk-backend
npm install
```

### 2.3 — Configure Environment Variables

Copy the example environment file:
```bash
cp .env.example .env
```

Then open `.env` in your editor and fill in your actual values:

```
# Database — update password to match what you set during PostgreSQL install
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/fpk_drinks

# Redis — default is fine if running locally
REDIS_URL=redis://localhost:6379

# Firebase — we'll set these up in Step 3
FIREBASE_PROJECT_ID=
FIREBASE_PRIVATE_KEY=
FIREBASE_CLIENT_EMAIL=

# Stripe — we'll set these up in Step 4
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# JWT Secret — generate a random one
JWT_SECRET=run-this-command-to-generate-one

# App
APP_PORT=3000
APP_ENV=development
```

To generate a JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Copy the output and paste it as your JWT_SECRET.

### 2.4 — Run Database Migrations

```bash
npm run migration:run
```

This creates all the database tables we designed.

### 2.5 — Start the Development Server

```bash
npm run start:dev
```

You should see:
```
[Nest] LOG [NestApplication] Nest application successfully started
[Nest] LOG Application is running on: http://localhost:3000
```

### 2.6 — Test It

Open your browser and go to: http://localhost:3000/health
You should see: `{ "status": "ok", "timestamp": "..." }`

---

## Step 3: Set Up Firebase Auth (Free)

1. Go to https://console.firebase.google.com/
2. Click "Create a project" → name it "fun-pizza-kitchen"
3. Once created, go to **Authentication** → **Get Started**
4. Enable these sign-in providers:
   - **Email/Password** (toggle ON, also enable "Email link" for OTP)
   - **Google** (toggle ON, fill in your project's support email)
   - **Apple** (toggle ON — you'll need your Apple Developer account info)
5. Go to **Project Settings** → **Service Accounts** → **Generate New Private Key**
6. Download the JSON file
7. From that JSON file, copy these values into your `.env`:
   - `FIREBASE_PROJECT_ID` = the `project_id` field
   - `FIREBASE_PRIVATE_KEY` = the `private_key` field (keep the \n characters)
   - `FIREBASE_CLIENT_EMAIL` = the `client_email` field

---

## Step 4: Set Up Stripe (Free to Start)

1. Go to https://dashboard.stripe.com/register — create an account
2. Once in the dashboard, you'll be in **Test Mode** by default (look for the toggle)
3. Go to **Developers** → **API Keys**
4. Copy the **Secret key** (starts with `sk_test_`) into your `.env` as `STRIPE_SECRET_KEY`
5. For webhooks (we'll configure later):
   ```bash
   stripe listen --forward-to localhost:3000/payments/webhook
   ```
   This gives you a webhook signing secret — paste it as `STRIPE_WEBHOOK_SECRET`

---

## Step 5: Set Up AWS S3 (For Photo Storage)

1. Go to https://aws.amazon.com/ — create a free account
2. Go to S3 → Create a bucket named `fpk-drinks-uploads`
3. Go to IAM → Create a new user with S3 access
4. Copy the access key and secret into your `.env`

**Alternative (easier for starting out):** Use Firebase Storage instead — it's simpler and you already have a Firebase project. We can switch to S3 later for production.

---

## How the Build Will Progress

Here's the order we'll build things:

### Phase 1: Backend API (Current)
1. ✅ Project structure & database schema
2. → Authentication (Firebase + JWT)
3. → User registration with age gate
4. → ID verification flow
5. → Membership purchase (Stripe)
6. → Barcode generation (TOTP)
7. → Drink scanning & logging
8. → Drink menu management
9. → Admin endpoints

### Phase 2: Mobile App
10. → Expo project setup
11. → Splash screen & auth screens
12. → Selfie capture
13. → Membership purchase screens
14. → Barcode display screen
15. → Staff scanning mode

### Phase 3: Admin Dashboard
16. → Next.js project setup
17. → ID verification queue
18. → Member management
19. → Analytics

---

## Useful Commands

```bash
# Start dev server (auto-restarts on code changes)
npm run start:dev

# Run database migrations
npm run migration:run

# Create a new migration after changing entities
npm run migration:generate -- -n MigrationName

# Run tests
npm run test

# Lint code
npm run lint

# Build for production
npm run build
```

---

## Troubleshooting

**"Cannot connect to PostgreSQL"**
→ Make sure PostgreSQL is running: `brew services list` (Mac) or check Services app (Windows)
→ Verify your password in `.env` matches what you set during install

**"Cannot connect to Redis"**
→ Make sure Redis is running: `redis-cli ping` should return PONG
→ If using Docker: `docker ps` to check container is running

**"Port 3000 already in use"**
→ Another app is using port 3000. Either stop it or change APP_PORT in `.env`

**"Module not found"**
→ Run `npm install` again. If still failing, delete `node_modules` and `package-lock.json`, then `npm install`
