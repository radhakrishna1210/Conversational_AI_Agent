# 🚀 Login System Setup Guide

This guide helps you set up the Conversational AI Agent application on any laptop with full login functionality.

---

## 📋 Prerequisites

Before starting, ensure your friend's laptop has:

1. **Node.js** (v20.0.0 or higher)
   - Download from: https://nodejs.org/
   - Verify: `node --version`

2. **npm** (comes with Node.js)
   - Verify: `npm --version`

3. **Git** (optional, for cloning)
   - Download from: https://git-scm.com/

---

## ✨ Quick Start (5 minutes)

### Option 1: For Quick Testing (No Database Needed)

This uses mock authentication - perfect for testing the UI without a database.

```bash
# Navigate to backend
cd Conversational_AI_Agent/backend

# Install dependencies
npm install

# Start backend (runs on http://localhost:4000)
npm run dev

# In a NEW terminal - Navigate to frontend
cd Conversational_AI_Agent/client

# Install dependencies  
npm install

# Start frontend (runs on http://localhost:5173)
npm run dev
```

**Test Credentials:**
- Email: `test@example.com` | Password: `password123`
- Email: `admin@example.com` | Password: `admin123`

---

### Option 2: For Production (With Real Database)

#### Step 1: Set Up a Free PostgreSQL Database

Choose ONE of these free options:

**A) Railway.app (Recommended - Easiest)**
1. Go to https://railway.app
2. Sign up with GitHub
3. Create new project → Add PostgreSQL
4. Copy the connection string from "Connect" tab

**B) Render.com (Alternative)**
1. Go to https://render.com
2. Sign up
3. Create new PostgreSQL database
4. Copy the connection string

**C) Supabase (What we had)**
1. Go to https://supabase.com
2. Create new project
3. Get connection string from project settings

#### Step 2: Configure Backend

1. Open `Conversational_AI_Agent/backend/.env`

2. Replace `DATABASE_URL` with your database connection string:
   ```
   DATABASE_URL="postgresql://username:password@host:port/database"
   ```

3. Keep other environment variables as they are

#### Step 3: Run Database Migrations

```bash
cd Conversational_AI_Agent/backend

# Generate Prisma client
npm run db:generate

# Create database tables
npm run db:migrate

# (Optional) Seed with sample data
npm run db:seed
```

#### Step 4: Start the Application

```bash
# Terminal 1 - Backend
cd Conversational_AI_Agent/backend
npm run dev

# Terminal 2 - Frontend
cd Conversational_AI_Agent/client
npm run dev
```

---

## 🔧 Environment Variables Reference

Create or update `.env` file in `backend/` folder:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/convo_ai"

# Server
NODE_ENV=development
PORT=4000
CLIENT_URL=http://localhost:5173
CHATFLOW_PRO_URL=http://localhost:8080

# JWT Secrets (Can keep as-is for development)
JWT_ACCESS_SECRET=supersecretaccesskey1234567890abcdef
JWT_REFRESH_SECRET=supersecretrefreshkey1234567890xyz123

# Security
BCRYPT_SALT_ROUNDS=12

# Redis (for queue management - can be disabled in dev)
REDIS_URL=rediss://default:password@host:port

# Meta/WhatsApp (Optional for testing)
META_APP_ID=your_app_id
META_APP_SECRET=your_app_secret
```

---

## 📱 Login Flow Explained

### Mock Auth (Development)
```
User enters credentials → Backend (Mock Service)
→ In-memory verification → JWT Token generated
→ Token sent to frontend → User logged in
```

**Data stored in:** RAM (lost when server restarts)

### Real Auth (Production)
```
User enters credentials → Backend → Database lookup
→ Password verification → JWT Token generated  
→ Token sent to frontend → User logged in
```

**Data stored in:** PostgreSQL Database (persistent)

---

## 🐛 Common Issues & Solutions

### Issue: "Port 4000 already in use"
```bash
# Kill process using port 4000
netstat -ano | find ":4000"
taskkill /PID <PID_NUMBER> /F
```

### Issue: "Cannot find module"
```bash
# Clear and reinstall dependencies
rm -r node_modules package-lock.json
npm install
```

### Issue: "Database connection failed"
- ✅ Use Mock Auth option (recommended for testing)
- Or fix DATABASE_URL and verify database is running

### Issue: "npm: command not found"
- Node.js not installed properly
- Restart terminal and verify: `node --version`

### Issue: "Frontend showing 'Internal server error'"
- Backend server not running
- Check backend terminal for errors
- Verify port 4000 is accessible

---

## 📂 Project Structure

```
Conversational_AI_Agent/
├── backend/                 ← API Server (Node.js + Express)
│   ├── .env                ← Configuration file
│   ├── package.json
│   ├── prisma/
│   │   └── schema.prisma   ← Database schema
│   └── src/
│       ├── services/
│       │   ├── auth.service.js        (Real DB)
│       │   └── mockAuth.service.js    (Mock Auth)
│       └── ...
│
└── client/                 ← Web App (React + Vite)
    ├── package.json
    └── src/
        ├── pages/
        │   └── Login.tsx   ← Login page
        └── ...
```

---

## 🔄 Development Workflow

### Starting Fresh

```bash
# 1. Clone/download project
git clone <repo> Conversational_AI_Agent
cd Conversational_AI_Agent

# 2. Setup Backend
cd backend
npm install
# (Optional) Setup database if using real DB
npm run db:migrate

# 3. Setup Frontend  
cd ../client
npm install

# 4. Start servers (in separate terminals)
# Terminal 1:
cd backend && npm run dev

# Terminal 2:
cd client && npm run dev

# 5. Open browser
# Go to http://localhost:5173
```

### Switching Between Mock and Real Database

**To use Mock Auth (no database needed):**
- Just start the servers
- Backend automatically detects if database is unavailable
- Falls back to mock authentication

**To use Real Database:**
1. Set DATABASE_URL in `.env`
2. Run `npm run db:migrate`
3. Restart backend

---

## 🧪 Testing the Login

### Step 1: Start both servers (from above)

### Step 2: Open browser
- Navigate to: `http://localhost:5173`

### Step 3: Try logging in
**With Mock Auth:**
```
Email: test@example.com
Password: password123
```

**With Real Database:**
```
Email: your_registered_email
Password: your_password
```

### Step 4: Verify
- Should be redirected to dashboard
- Token stored in browser localStorage
- Logout clears token

---

## 📞 Getting Help

If your friend encounters issues:

1. **Check terminal for error messages**
   - Backend errors show in backend terminal
   - Frontend errors show in browser console (F12)

2. **Follow troubleshooting section** (above)

3. **Verify prerequisites installed** (Node.js v20+, npm)

4. **Try starting fresh:**
   ```bash
   npm run db:reset        # Reset database
   rm -r node_modules      # Clear node_modules
   npm install             # Reinstall packages
   npm run dev             # Start fresh
   ```

---

## 🎯 Next Steps

After successful login, you can:
- ✅ Test with mock data (development)
- ✅ Integrate with real database (production)
- ✅ Set up WhatsApp/Meta integration
- ✅ Configure Redis for queues
- ✅ Deploy to cloud (Railway.app, Render.com, etc)

---

## 📚 Useful Commands

```bash
# Backend
npm run dev              # Start development server
npm run db:migrate       # Run database migrations  
npm run db:reset         # Reset database completely
npm run db:seed          # Seed sample data

# Frontend
npm run dev              # Start development server
npm run build            # Build for production
npm run preview          # Preview production build
```

---

**Happy Coding! 🎉**
