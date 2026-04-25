# 🎯 Conversational AI Agent - Getting Started.

**Welcome!** This guide will help you and your friend get the application running in **5 minutes**.

## ⚡ Super Quick Start (Copy-Paste)

### Terminal 1 - Backend
```bash
cd backend
npm install
npm run dev
```

### Terminal 2 - Frontend
```bash
cd client
npm install
npm run dev
```

### Then Open Browser
```
http://localhost:5173
```

### Test Login
```
Email: test@example.com
Password: password123
```

---

## 📖 Full Documentation

Choose based on your needs:

| Document | Use When |
|----------|----------|
| **[SETUP_GUIDE.md](./SETUP_GUIDE.md)** | 🎯 First time setup, complete walkthrough |
| **[TROUBLESHOOTING.md](./TROUBLESHOOTING.md)** | 🆘 Something's broken, finding solutions |
| **.env.template** | 📝 Understanding environment variables |

---

## 🎯 Three Setup Options

### Option 1: Mock Auth (Recommended for Testing)
- **Time:** 5 minutes
- **Database:** Not needed
- **Test Accounts:** Built-in
- **Setup:** Just run `npm install` and `npm run dev`

**Test Credentials:**
```
test@example.com / password123
admin@example.com / admin123
```

### Option 2: Real Database (Production)
- **Time:** 15 minutes  
- **Database:** Required (free options available)
- **Setup:** Get Free PostgreSQL + update .env + run migrations
- **Services:** Railway.app, Render.com, Supabase

### Option 3: Your Friend's Laptop
- Give them **SETUP_GUIDE.md** + **TROUBLESHOOTING.md**
- They follow "Quick Start (5 minutes)" section
- They use mock auth to test
- Later they can set up real database

---

## 🚀 Quick Startup Scripts

### Windows Batch Scripts
```bash
# Start just backend
cd backend
start-backend.bat

# Start just frontend  
cd client
start-frontend.bat

# Start BOTH (run from project root)
STARTUP.bat
```

### PowerShell
```powershell
# Run from project root
.\STARTUP.ps1
```

---

## 🔍 What's What

```
Conversational_AI_Agent/
├── backend/                      ← API Server (Node.js/Express)
│   ├── SETUP_GUIDE.md           ← Detailed setup instructions
│   ├── TROUBLESHOOTING.md       ← Problem solutions
│   ├── start-backend.bat        ← Quick start script
│   ├── .env                     ← Configuration (secrets)
│   ├── .env.template            ← Configuration template
│   ├── package.json
│   ├── prisma/                  ← Database stuff
│   └── src/
│       ├── services/
│       │   ├── auth.service.js              (Real DB auth)
│       │   └── mockAuth.service.js          (Mock auth)
│       └── ... (other code)
│
└── client/                       ← Web App (React/TypeScript)
    ├── start-frontend.bat       ← Quick start script
    ├── package.json
    └── src/
        ├── pages/
        │   └── Login.tsx        ← Login page
        └── ... (other code)
```

---

## 🔑 How Authentication Works

### 2 Modes:

**Mode 1: Mock Auth (Default)**
```
User Login → Backend (In-Memory) → JWT Token → Logged In
Data Location: RAM (lost when server restarts)
Perfect for: Testing, Development, Quick Start
```

**Mode 2: Real Database**
```
User Login → Backend → PostgreSQL Database → JWT Token → Logged in
Data Location: Database (persistent)
Perfect for: Production, Deployment, Real Users
```

**The backend automatically chooses:**
- No real database available? → Uses Mock auth automatically
- Real database configured? → Uses real PostgreSQL

No configuration needed - it just works!

---

## ✅ Prerequisites Checklist

Before starting, your friend needs:

- [ ] **Node.js v20+** - https://nodejs.org/
- [ ] **npm** (comes with Node.js)
- [ ] **Terminal/Command Prompt**
- [ ] **Browser** (Chrome, Firefox, Safari, Edge)

That's it! No database software needed for quick start.

---

## 📝 Sharing with Your Friend

### Option 1: Copy-Paste Instructions
Send them:
1. **SETUP_GUIDE.md** - Full instructions
2. **TROUBLESHOOTING.md** - If things break
3. Test credentials

### Option 2: Share Entire Folder
```bash
# Zip everything
# Send them the Conversational_AI_Agent/ folder
# They extract and run STARTUP.bat
```

### Option 3: Git Link
```bash
git clone <repo-link>
cd Conversational_AI_Agent
# Then follow SETUP_GUIDE.md
```

---

## 🎓 Step-by-Step for Your Friend

### Step 1: Install Node.js
1. Go to https://nodejs.org/
2. Download LTS version (v20+)
3. Run installer, follow steps
4. **RESTART terminal**

### Step 2: Get Project Files
```bash
# Option A: Git
git clone <link> Conversational_AI_Agent

# Option B: Extract ZIP
# Extract folder you received
```

### Step 3: Start Backend
```bash
cd Conversational_AI_Agent/backend
npm install
npm run dev
```
Keep this terminal open!

### Step 4: Start Frontend (NEW terminal)
```bash
cd Conversational_AI_Agent/client
npm install
npm run dev
```
Keep this terminal open!

### Step 5: Test Login
1. Open browser: **http://localhost:5173**
2. Use: `test@example.com` / `password123`
3. Should see dashboard after login

### Done! ✅
If they get stuck → Send them **TROUBLESHOOTING.md**

---

## 🆘 Help! It's Not Working

**90% of issues are solved by:**

1. ✅ Is Node.js installed? (`node --version`)
2. ✅ Is backend running? (Check terminal says "Server running on http://localhost:4000")
3. ✅ Is frontend running? (Check terminal says "Local: http://localhost:5173")
4. ✅ Are you using test credentials? (`test@example.com` / `password123`)
5. ✅ Check browser console (F12) for errors

**Still stuck?** → Read **TROUBLESHOOTING.md**

---

## 🌐 Accessing the Application

### Frontend
```
http://localhost:5173
```

### Backend API (for testing)
```
http://localhost:4000
http://localhost:4000/health  ← Check if backend is alive
```

### Database (if using real DB)
Not in browser - managed from backend

---

## 🔧 Useful Commands

| Command | Does |
|---------|------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm install` | Install dependencies |
| `npm run db:migrate` | Setup database tables |
| `npm run db:seed` | Add sample data |
| `npm run db:reset` | Delete all data and reset |

---

## 📋 For Your Friend's Reference

Print or send them this checklist:

```
🎯 QUICK SETUP CHECKLIST

□ Node.js v20+ installed
□ GitHub/project folder downloaded
□ Terminal 1: cd backend && npm install
□ Terminal 1: npm run dev (LEAVE RUNNING)
□ Terminal 2: cd client && npm install
□ Terminal 2: npm run dev (LEAVE RUNNING)
□ Browser: Open http://localhost:5173
□ Login: test@example.com / password123
□ Success! Welcome to the app 🎉

STUCK? Read TROUBLESHOOTING.md
```

---

## 🎯 Next Steps

After successful login:

1. **Explore the app** - Test all features
2. **Set up real database** (optional) - See SETUP_GUIDE.md
3. **Deploy** (optional) - Host somewhere
4. **Integrate WhatsApp** (optional) - Configure Meta API

---

## 📞 Support

**For issues:**
1. Check **TROUBLESHOOTING.md** first
2. Verify **Prerequisites Checked**
3. Share error message + steps

**For questions:**
1. Read **SETUP_GUIDE.md** - usually has answer
2. Check **TROUBLESHOOTING.md** - common problems
3. Review terminal output - 90% of clues are there

---

## 🎉 You're Ready!

Everything is set up for your friend to:
- ✅ Run the app in 5 minutes
- ✅ Test with mock auth (no database needed)
- ✅ Get help if something breaks
- ✅ Scale to production later

Good luck! Let me know if you need anything else. 🚀
