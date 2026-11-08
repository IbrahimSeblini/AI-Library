# Connect this folder to your existing Git repo

Repo: **https://github.com/mhmdjawadd/FYP**  
Branch: **karim-big-update**

Run these commands in Terminal from the project folder (`MyLibraryPal`).

**1. Go to the project folder**
```bash
cd /Users/karimassi/Desktop/FYP/MyLibraryPal
```

**2. Initialize Git (creates the `.git` folder)**
```bash
git init
```

**3. Add the remote**
```bash
git remote add origin https://github.com/mhmdjawadd/FYP.git
```

**4. Fetch and switch to the branch you want to push to**
```bash
git fetch origin
git checkout -b karim-big-update origin/karim-big-update
```
If that branch doesn’t exist on the remote yet, create it locally and push it later:
```bash
git checkout -b karim-big-update
```

**5. If the remote branch already has commits** (e.g. README) and you want to merge:
```bash
git pull origin karim-big-update --allow-unrelated-histories
```

**6. Add, commit, and push your code**
```bash
git add .
git commit -m "MyLibraryPal updates"
git push -u origin karim-big-update
```
