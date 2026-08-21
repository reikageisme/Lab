---
name: ctf-lab-development
description: >
  Development guide for upgrading the Lab project into a CTF (Capture The Flag)
  platform. Use this skill when implementing CTF features: challenge engine,
  flag submission, scoreboard, custom challenge containers, or CTF dashboard UI.
---

# CTF Lab Development Guide

## Goal

Transform the existing Pentest Lab into a full CTF platform with:
- Challenge definitions with flags
- Flag submission & validation
- Scoreboard & progress tracking
- Custom challenge containers
- picoCTF-style user experience

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                  Dashboard (:3000)               │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │Lab Modules│  │Monitoring│  │CTF Challenges│  │
│  └──────────┘  └──────────┘  └──────┬───────┘  │
│                                      │          │
│                              ┌───────▼───────┐  │
│                              │  CTF Engine   │  │
│                              │  (API layer)  │  │
│                              └───────┬───────┘  │
│                                      │          │
│                              ┌───────▼───────┐  │
│                              │  challenges/  │  │
│                              │  flags DB     │  │
│                              └───────────────┘  │
└─────────────────────────────────────────────────┘
```

## Phase 1: CTF Core Engine

### Option A: Integrated into Dashboard (Recommended for single-user)

Add CTF endpoints directly to `dashboard/server.js`. Simpler, no extra container.

### Option B: Separate CTF Engine Service (For multi-user)

New Docker service `ctf-engine` with its own database.

### Challenge Schema

Store in `dashboard/challenges.json` (Option A) or SQLite DB (Option B):

```json
{
  "challenges": [
    {
      "id": "ssrf-001",
      "title": "Cloud Metadata Heist",
      "category": "Cloud",
      "difficulty": "Easy",
      "points": 100,
      "description": "The SSRF-Cloud app has a URL fetcher. Use it to access the cloud instance metadata and extract the secret access key.",
      "hints": [
        {"text": "AWS metadata lives at a well-known IP address", "cost": 0},
        {"text": "Try http://169.254.169.254/latest/meta-data/", "cost": 25}
      ],
      "flag": "FLAG{ssrf_m3tadata_3xtr4ct3d}",
      "linkedModule": "lab_ssrf",
      "tags": ["ssrf", "cloud", "aws"],
      "author": "Lab Admin",
      "solves": 0
    }
  ]
}
```

### Flag Format

- Standard format: `FLAG{alphanumeric_with_underscores}`
- Regex validation: `/^FLAG\{[a-zA-Z0-9_!@#$%^&*()-]+\}$/`
- Case-sensitive matching
- Trim whitespace before validation

### API Endpoints to Add

```javascript
// --- CTF ENDPOINTS ---

// Get all challenges (flag field EXCLUDED from response)
GET  /api/ctf/challenges

// Get single challenge detail
GET  /api/ctf/challenges/:id

// Submit flag
POST /api/ctf/submit
// Body: { "challengeId": "ssrf-001", "flag": "FLAG{...}" }
// Response: { "correct": true/false, "points": 100, "message": "..." }

// Get user progress
GET  /api/ctf/progress
// Response: { "solved": ["ssrf-001"], "totalPoints": 100, "totalChallenges": 20 }

// Get scoreboard
GET  /api/ctf/scoreboard

// Use hint
POST /api/ctf/hints
// Body: { "challengeId": "ssrf-001", "hintIndex": 1 }
```

### Progress Storage

Store in `dashboard/ctf-progress.json`:

```json
{
  "solvedChallenges": {
    "ssrf-001": {
      "solvedAt": "2024-01-15T10:30:00Z",
      "attempts": 3,
      "hintsUsed": [0],
      "pointsEarned": 100
    }
  },
  "totalPoints": 100,
  "startedAt": "2024-01-15T09:00:00Z"
}
```

## Phase 2: Flag Injection Strategies

### Per-App Flag Placement

#### SSRF-Cloud (Custom App — Easiest to modify)
- **Method**: Embed flag directly in mock metadata response
- **File**: `ssrf-lab/server.js` line 48
- **Change**: Replace `SecretAccessKey` value with `FLAG{ssrf_m3tadata_3xtr4ct3d}`
- **Multiple challenges**: Add more hidden endpoints (e.g., `/internal/admin`, `/debug/config`)

#### Juice Shop (Third-party — Use env vars or API)
- **Method**: Juice Shop has its own challenge system. Map its challenges to your CTF flags.
- **Alternative**: Create a companion container that checks Juice Shop's scoreboard API
- **Flags**: Generate based on Juice Shop challenge completion tokens

#### DVWA (Third-party — Use database injection)
- **Method**: Mount custom SQL init script that creates a `flags` table
- **Docker**: Add `volumes: - ./challenges/dvwa-init.sql:/docker-entrypoint-initdb.d/init.sql`
- **Challenges**: Flag hidden in database, accessible via SQL injection

#### WebGoat (Third-party — Lesson-based)
- **Method**: WebGoat has lesson completion tracking
- **Integration**: Check lesson completion via WebGoat API, award CTF flag when lesson group completed

#### VAmPI (Third-party — API-based)
- **Method**: Flags embedded in API responses that require exploitation to access
- **Examples**: IDOR to access admin user profile containing flag, auth bypass to access flag endpoint

#### Target-App (Custom — Full control)
- **Method**: Add hidden endpoints that require specific exploit chains
- **Examples**:
  - `GET /admin/flag` — requires auth bypass
  - Flag in rate-limit bypass response header
  - Flag in error message when triggering specific server error

#### ModSecurity WAF
- **Method**: Flag served by target-app when WAF is successfully bypassed
- **Implementation**: Add header `X-CTF-Flag` when request passes through WAF with specific bypass payload

### Custom Challenge Container Template

```dockerfile
FROM node:20-alpine
WORKDIR /app

# Flag is set at build time or via env var
ARG CTF_FLAG="FLAG{default_flag}"
ENV CTF_FLAG=$CTF_FLAG

COPY . .
RUN npm install --production
EXPOSE 3000
CMD ["node", "server.js"]
```

```javascript
// challenge server.js template
const express = require('express');
const app = express();

// The vulnerable endpoint
app.get('/vulnerable', (req, res) => {
    // Intentionally vulnerable code here
    // When exploited correctly, reveals process.env.CTF_FLAG
});

app.listen(3000);
```

Docker Compose addition:
```yaml
  ctf-sqli-001:
    build: ./challenges/web-001-sqli
    container_name: lab_ctf_sqli_001
    ports:
      - "3010:3000"
    environment:
      - CTF_FLAG=FLAG{sql_1nj3ct10n_m4st3r}
    labels:
      - "lab-module=true"
      - "lab.name=CTF: SQL Injection 101"
      - "lab.category=CTF-Web"
      - "lab.difficulty=Easy"
      - "lab.description=Exploit SQL injection to extract the admin password."
      - "lab.url=http://localhost:3010"
      - "lab.ctf=true"
      - "lab.ctf.challengeId=web-001"
    networks:
      - lab-network
```

## Phase 3: Dashboard CTF UI

### New Tab: "CTF Challenges"

Add to the tabs nav in `dashboard/public/index.html`:

```html
<button onclick="switchTab('ctf')" id="tab-ctf"
  class="px-4 py-3 border-b-2 border-transparent text-slate-400 hover:text-slate-200 font-medium">
  🏁 CTF Challenges
</button>
```

### UI Components Needed

1. **Challenge Grid**: Cards grouped by category with:
   - Title, points, difficulty badge
   - Solved/unsolved indicator (🟢/🔴)
   - Expand to see description + hints
   - Flag input field + Submit button

2. **Progress Bar**: Top of CTF tab
   ```
   ████████░░░░░░░░ 8/20 Challenges (350 pts)
   ```

3. **Scoreboard Panel**: Sidebar or separate view
   - Rank, username, points, solves
   - Chart: points over time

4. **Flag Submission UX**:
   - Input field with `FLAG{...}` placeholder
   - Submit button with loading state
   - Success: confetti animation + green flash
   - Failure: shake animation + red flash
   - Cooldown: 5-second delay between attempts (anti-brute-force)

### Category Colors

```javascript
function getCTFCategoryColor(cat) {
    const colors = {
        'Web':       'from-blue-500 to-cyan-500',
        'API':       'from-purple-500 to-pink-500',
        'Cloud':     'from-orange-500 to-yellow-500',
        'Network':   'from-green-500 to-emerald-500',
        'Crypto':    'from-red-500 to-rose-500',
        'Forensics': 'from-indigo-500 to-violet-500',
        'Reverse':   'from-gray-500 to-slate-500',
        'Misc':      'from-teal-500 to-cyan-500'
    };
    return colors[cat] || 'from-slate-500 to-slate-600';
}
```

## Phase 4: Multi-User & Advanced

### User System
- SQLite database for users, solves, sessions
- Registration + login (separate from admin)
- Profile page with solve history

### Scoring Modes
- **Static**: Fixed points per challenge
- **Dynamic**: Points decrease as more people solve (like CTFd)
  ```
  points = max(minPoints, initialPoints - (decay * solves))
  ```

### Docker Label Extensions for CTF
```yaml
labels:
  - "lab.ctf=true"                    # Marks as CTF challenge
  - "lab.ctf.challengeId=web-001"     # Links to challenge DB
  - "lab.ctf.autoStop=30m"            # Auto-stop after 30 min
  - "lab.ctf.maxInstances=1"          # Max concurrent instances
```

## Implementation Checklist

### Phase 1 (CTF Engine)
- [ ] Create `dashboard/challenges.json` with initial challenges
- [ ] Create `dashboard/ctf-progress.json` for progress tracking
- [ ] Add CTF API endpoints to `dashboard/server.js`
- [ ] Modify SSRF-Lab to embed flags in responses
- [ ] Add hidden flag endpoints to Target-App
- [ ] Test flag submission flow end-to-end

### Phase 2 (Dashboard UI)
- [ ] Add "CTF Challenges" tab to `index.html`
- [ ] Build challenge grid with category filters
- [ ] Implement flag submission UI with animations
- [ ] Add progress bar component
- [ ] Add scoreboard/stats view
- [ ] Add hint reveal system

### Phase 3 (Custom Challenges)
- [ ] Create `challenges/` directory structure
- [ ] Build SQL Injection challenge container
- [ ] Build XSS challenge container
- [ ] Build Auth Bypass challenge container
- [ ] Update docker-compose.yml with new services
- [ ] Update `allowedServices` in dashboard server

### Phase 4 (Multi-User)
- [ ] Migrate from JSON to SQLite
- [ ] Add user registration/login
- [ ] Implement dynamic scoring
- [ ] Add team support
- [ ] Add write-up submission system

## Quick Reference: Challenge Categories

| Category | Icon | Description |
|----------|------|-------------|
| Web | 🌐 | XSS, SQLi, CSRF, Auth bypass, IDOR |
| API | 🔌 | REST/GraphQL exploitation, mass assignment |
| Cloud | ☁️ | SSRF, metadata extraction, S3 misconfiguration |
| Network | 🔗 | Port scanning, service exploitation |
| Crypto | 🔐 | Encoding, hashing, weak crypto |
| Forensics | 🔍 | PCAP analysis, log analysis, file carving |
| Reverse | ⚙️ | Binary analysis, deobfuscation |
| Misc | 🎯 | OSINT, steganography, trivia |
