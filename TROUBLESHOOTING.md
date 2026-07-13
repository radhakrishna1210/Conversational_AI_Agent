# 🆘 Troubleshooting & FAQ

## Common Problems & Solutions

---

## 1️⃣ "npm: command not found" or "Node.js not installed"

### Problem
```
'npm' is not recognized as an internal or external command
```

### Solution
1. Download Node.js from https://nodejs.org/ (v20.0.0 or higher)
2. Run the installer and follow steps
3. **RESTART YOUR TERMINAL** (very important!)
4. Verify: `node --version` and `npm --version`

---

## 2️⃣ "Port 4000 already in use"

### Problem
```
Error: listen EADDRINUSE: address already in use :::4000
```

### Solution - Option A (Easy)
Change the PORT in `.env` file:
```
PORT=4001  # Use 4001 instead of 4000
```

### Solution - Option B (Kill the process)
```bash
# Find what's using port 4000
netstat -ano | findstr :4000

# Kill it (replace PID with the process ID)
taskkill /PID <PID_NUMBER> /F

# Example:
taskkill /PID 12345 /F
```

---

## 3️⃣ "Cannot find module" errors

### Problem
```
Error: Cannot find module 'express'
```

### Solution
```bash
# Delete node_modules and reinstall
rm -r node_modules
npm install

# If that doesn't work, clear cache
npm cache clean --force
npm install
```

---

## 4️⃣ Frontend shows "Internal server error" when logging in

### Problem
Login fails with generic error, nothing specific

### Root Causes
- Backend server not running
- Backend crashed
- Port 4000 not accessible
- CORS configuration issue

### Solution - Check Backend
```bash
# Terminal with backend should show:
[2026-04-15 23:11:08.833 +0530] INFO (11012): Server running on http://localhost:4000

# If not running, check for errors and restart:
npm run dev
```

### Solution - Check Network
```bash
# Try accessing API directly
curl http://localhost:4000/health

# Should return:
{"status":"ok","timestamp":"2026-04-15T17:41:08.000Z"}
```

### Solution - Check Frontend Console
1. Open browser console (F12 or Ctrl+Shift+I)
2. Go to "Console" tab
3. Try login again
4. Check for errors - usually shows real problem

---

## 5️⃣ "Database connection failed" message at startup

### Problem
```
[WARN] Database connection failed on startup
[WARN] Server will continue using mock auth for development
```

### This is NOT necessarily a problem!
The server automatically switched to mock auth. You can still:
- ✅ Login with test credentials
- ✅ Test the application
- ✅ Continue development

### To use a real database (optional)
1. Get a free PostgreSQL database from:
   - https://railway.app (Recommended)
   - https://render.com
   - https://supabase.com

2. Update `.env` with connection string:
   ```
   DATABASE_URL="postgresql://user:password@host:5432/db"
   ```

3. Run migrations:
   ```bash
   npm run db:generate
   npm run db:migrate
   ```

4. Restart backend

---

## 6️⃣ Login credentials not working

### Problem
```
Email: test@example.com
Password: password123
→ "Invalid credentials" error
```

### Check Your Credentials
Make sure you're using EXACTLY:

**Account 1:**
- Email: `test@example.com` (not test@gmail.com)
- Password: `password123` (not password or 123)

**Account 2:**
- Email: `admin@example.com`
- Password: `admin123`

### If Still Not Working
Backend is using real database but no users registered:
1. Switch to mock auth (automatic on startup if DB unavailable)
2. Or register new account with email/password

---

## 7️⃣ "Cannot find .env file"

### Problem
Backend crashes because `.env` is missing

### Solution
```bash
# Rename template to .env
cd backend

# Windows (Command Prompt)
copy .env.template .env

# Or create manually
# Just copy content from .env.template to .env
```

---

## 8️⃣ Frontend keeps saying "Port 5173 in use"

### Problem
```
Port 5173 is in use, trying another one...
VITE v5.4.21 ready in 202 ms
Local: http://localhost:5174/
```

### Solution - Use the new port
Open browser to: `http://localhost:5174` instead of 5173

### Or - Change frontend port
Edit `client/vite.config.ts`:
```typescript
server: {
  port: 3000  // Change from default 5173
}
```

---

## 9️⃣ "npm run db:migrate" returns errors

### Problem
Prisma migration fails with database errors

### Solutions

**If using mock auth:**
Don't need to run migrations - mock auth works without real DB

**If using real database:**
1. Make sure DATABASE_URL is correct:
   ```bash
   echo %DATABASE_URL%  # Check current value
   ```

2. Make sure database server is running and accessible

3. Try resetting everything:
   ```bash
   npm run db:reset    # WARNING: Deletes all data!
   npm run db:migrate
   npm run db:seed
   ```

---

## 🔟 Completely stuck? Start fresh

### Nuclear Option (starts completely fresh)

```bash
# 1. Navigate to project
cd Conversational_AI_Agent

# 2. Clean everything
cd backend
rm -r node_modules package-lock.json .env

# 3. Reinstall
npm install
copy .env.template .env

# 4. Go to frontend
cd ../client
rm -r node_modules package-lock.json

# 5. Reinstall
npm install

# 6. Start fresh
# Terminal 1: cd backend && npm run dev
# Terminal 2: cd client && npm run dev
```

---

## 📋 Checklist Before Getting Help

Before asking for help, check:

- [ ] Node.js v20+ installed? (`node --version`)
- [ ] Both terminals have npm modules? (`ls node_modules` should show folders)
- [ ] .env file exists in backend? (`ls backend/.env`)
- [ ] Backend showing "Server running on http://localhost:4000"?
- [ ] Frontend showing "Local: http://localhost:5173" (or 5174)?
- [ ] Backend logs show "Mock auth users initialized" or "Database connected"?
- [ ] Browser console (F12) shows any errors?
- [ ] Testing with correct credentials? (test@example.com / password123)

---

## 🎯 Quick Diagnostic Commands

Run these in order to identify the problem:

```bash
# Check Node.js
node --version        # Should show v20.x.x

# Check npm
npm --version         # Should work

# Check if ports are open
netstat -ano | findstr :4000    # Backend port
netstat -ano | findstr :5173    # Frontend port

# Check if .env exists
cd backend && dir .env

# Try backend health check
curl http://localhost:4000/health

# Check backend logs (look for errors)
cd backend && npm run dev
```

---

## 💡 Pro Tips

1. **Keep two terminals open**
   - One for backend (`npm run dev`)
   - One for frontend (`npm run dev`)
   - Don't close them!

2. **Check terminal output first**
   - 90% of issues are in terminal logs
   - Read error messages carefully!

3. **Use browser DevTools**
   - F12 → Console tab
   - Shows real errors happening
   - Much more helpful than UI errors

4. **Restart before troubleshooting**
   - Still errors? Restart everything
   - Kill both servers (Ctrl+C)
   - Start fresh

5. **Ask with information**
   - Share error message
   - Share which step you're on
   - Share terminal output

---

## 📞 If Still Stuck

When asking for help, provide:

1. **Error message** (copy-paste from terminal)
2. **Which step** (Backend install? Frontend? Login?)
3. **What you did** (step-by-step)
4. **What you expected** (what should happen)
5. **What happened instead** (what went wrong)

Example:
```
I'm stuck on: Installing backend dependencies
I ran: npm install
Error message: 
  npm ERR! code ERESOLVE
  npm ERR! ERESOLVE unable to resolve dependency tree

Expected: Dependencies installed successfully
What I did:
  1. Downloaded Node.js
  2. Opened terminal in backend/
  3. Ran npm install
```

This makes it MUCH easier to help quickly!

---

**Good luck with your setup! 🚀**
