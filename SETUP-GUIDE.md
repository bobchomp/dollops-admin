# Dollops Admin — Windows App Setup Guide

## What you have
- `dollops-admin/` — the desktop app folder
- Updated `shop.html` and `shop.js` — your website now saves orders to Firebase

---

## Step 1: Install Node.js
1. Go to https://nodejs.org
2. Download the **LTS** version (left button)
3. Run the installer — click Next through everything, keep all defaults
4. When done, open **Command Prompt** (search "cmd" in Windows start menu)
5. Type `node --version` and press Enter — you should see something like `v20.x.x`

---

## Step 2: Set up the app
1. Copy the `dollops-admin` folder somewhere permanent on your PC (e.g. `C:\Users\YourName\dollops-admin`)
2. Open **Command Prompt**
3. Type `cd C:\Users\YourName\dollops-admin` (adjust path to where you put it) and press Enter
4. Type `npm install` and press Enter
5. Wait — this downloads everything needed (may take 2-3 minutes, you'll see lots of text)

---

## Step 3: Run the app
1. In the same Command Prompt window, type `npm start` and press Enter
2. The Dollops Admin window should open!
3. Log in with:
   - **Email:** ross@dollopsicecream.uk
   - **Password:** Dollops@0823

---

## Step 4: Build a proper .exe installer (optional)
When you want a proper Windows installer you can double-click:
1. In Command Prompt, in the dollops-admin folder, type `npm run build`
2. Wait 2-3 minutes
3. Look in the `dist/` folder — you'll find a `.exe` installer
4. Double-click it to install the app like any normal Windows program

---

## Update your website
Replace these two files on Vercel with the new versions provided:
- `shop.html` (now includes Firebase)
- `shop.js` (now saves orders to Firebase in real time)

Once done, any order placed on the website will appear in your desktop app immediately.

---

## Daily use
- Just run `npm start` from the dollops-admin folder each time
- Or build the .exe once and use that — no Command Prompt needed after that