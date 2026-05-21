# Dark Mode Consistency

**Category:** visual
**Priority:** high
**Prerequisites:**

- Preview server running at http://127.0.0.1:4173
- Build completed (`npm run build && npm run preview`)
- Electron API mock file at `e2e/mcp/shared/electron-mocks.js`

**MCP Tools Used:** `navigate_page`, `emulate`, `take_screenshot`, `evaluate_script`

---

## Steps

### Step 1: Navigate to Dashboard with Electron mocks

**Tool:** `mcp__chrome-devtools__navigate_page`
**Parameters:**

```json
{
  "type": "url",
  "url": "http://127.0.0.1:4173/",
  "initScript": "(function(){const m={ping:async()=>'pong','app-version':async()=>'2.0.0','app-platform':async()=>'win32','open-external':async()=>true,'nvd:search':async()=>({success:true,results:[],totalResults:0}),'nvd:getCve':async()=>({success:false}),'nvd:getStats':async()=>({success:true,stats:{dbSize:987000000,totalCves:331567}}),'osv:query':async()=>({success:true,results:[]}),'osv:getVulnerability':async()=>({success:false})};const SK='__mock_store__';const ds={'settings.theme':'system','settings.onboardingCompleted':true};const ms=localStorage.getItem(SK)?{...ds,...JSON.parse(localStorage.getItem(SK))}:{...ds};const el=new Map();const ae=(c,cb)=>{if(!el.has(c))el.set(c,new Set());el.get(c).add(cb)};const ee=(c,...a)=>{const l=el.get(c);if(l)l.forEach(cb=>cb(...a))};window.electronAPI={invoke:async(ch,...args)=>{if(m[ch])return m[ch](...args);return undefined},store:{get:async(k)=>ms[k],set:async(k,v)=>{ms[k]=v;localStorage.setItem(SK,JSON.stringify(ms))},delete:async(k)=>{delete ms[k];localStorage.setItem(SK,JSON.stringify(ms))}},secureStorage:{get:async()=>null,set:async()=>true,delete:async()=>true,has:async()=>false},getDatabaseStatus:async()=>({exists:true,path:'test',size:32768}),database:{getStats:async()=>({success:true,stats:{dbSize:32768,totalCves:0}}),getDetailedStats:async()=>({success:true,stats:{dbSize:987000000,totalCves:331567,totalCpes:2500000,lastUpdate:'2025-01-15'}}),getSyncConfig:async()=>({success:true,config:{}}),updateSyncConfig:async()=>({success:true}),updateStorageConfig:async()=>({success:true}),updatePerformanceConfig:async()=>({success:true}),cpeSearch:async()=>({success:true,results:[]}),reset:async()=>({success:true}),rebuildIndexes:async()=>({success:true}),sync:async()=>({success:true}),startDeltaSync:async()=>({success:true}),cancelSync:async()=>({success:true}),onSyncProgress:()=>()=>{},onSyncComplete:()=>()=>{},onSyncError:()=>()=>{},search:async()=>({success:true,results:[]}),getCve:async()=>({success:false})},platform:'win32',appVersion:'2.0.0',onMenuAction:cb=>ae('menu-action',cb),onUpdateAvailable:cb=>ae('update-available',cb),onProgress:cb=>ae('progress',cb),onNvdSyncProgress:cb=>ae('nvd-sync-progress',cb),onNvdSyncComplete:cb=>ae('nvd-sync-complete',cb),removeAllListeners:c=>el.delete(c),_emitEvent:ee};window.__mockCves=[];console.log('[Mock] Electron API mock installed')})()"
}
```

**Pass Criteria:** Page loads without navigation errors; HTTP 200 response.

---

### Step 2: Emulate light mode and capture Dashboard

**Tool:** `mcp__chrome-devtools__emulate`
**Parameters:**

```json
{ "colorScheme": "light" }
```

**Pass Criteria:** Emulation applied without errors.

**Tool:** `mcp__chrome-devtools__take_screenshot`
**Parameters:**

```json
{
  "filePath": "e2e/mcp/results/screenshots/dashboard-light.png",
  "fullPage": true
}
```

**Pass Criteria:** Screenshot captured; page renders with light background.

---

### Step 3: Emulate dark mode and capture Dashboard

**Tool:** `mcp__chrome-devtools__emulate`
**Parameters:**

```json
{ "colorScheme": "dark" }
```

**Pass Criteria:** Emulation applied; page visually switches to dark theme.

**Tool:** `mcp__chrome-devtools__take_screenshot`
**Parameters:**

```json
{
  "filePath": "e2e/mcp/results/screenshots/dashboard-dark.png",
  "fullPage": true
}
```

**Pass Criteria:** Screenshot captured; dark background applied, text remains visible.

---

### Step 4: Verify text contrast in both modes on Dashboard

**Tool:** `mcp__chrome-devtools__evaluate_script`
**Parameters:**

```json
{
  "function": "() => { const body = document.body; const cs = getComputedStyle(body); return { colorScheme: cs.colorScheme, backgroundColor: cs.backgroundColor, color: cs.color } }"
}
```

**Pass Criteria:** Text color contrasts with background color in both light and dark modes.

---

### Step 5: Navigate to Search page

**Tool:** `mcp__chrome-devtools__navigate_page`
**Parameters:**

```json
{
  "type": "url",
  "url": "http://127.0.0.1:4173/search",
  "initScript": "(function(){const m={ping:async()=>'pong','app-version':async()=>'2.0.0','app-platform':async()=>'win32','open-external':async()=>true,'nvd:search':async()=>({success:true,results:[],totalResults:0}),'nvd:getCve':async()=>({success:false}),'nvd:getStats':async()=>({success:true,stats:{dbSize:987000000,totalCves:331567}}),'osv:query':async()=>({success:true,results:[]}),'osv:getVulnerability':async()=>({success:false})};const SK='__mock_store__';const ds={'settings.theme':'system','settings.onboardingCompleted':true};const ms=localStorage.getItem(SK)?{...ds,...JSON.parse(localStorage.getItem(SK))}:{...ds};const el=new Map();const ae=(c,cb)=>{if(!el.has(c))el.set(c,new Set());el.get(c).add(cb)};const ee=(c,...a)=>{const l=el.get(c);if(l)l.forEach(cb=>cb(...a))};window.electronAPI={invoke:async(ch,...args)=>{if(m[ch])return m[ch](...args);return undefined},store:{get:async(k)=>ms[k],set:async(k,v)=>{ms[k]=v;localStorage.setItem(SK,JSON.stringify(ms))},delete:async(k)=>{delete ms[k];localStorage.setItem(SK,JSON.stringify(ms))}},secureStorage:{get:async()=>null,set:async()=>true,delete:async()=>true,has:async()=>false},getDatabaseStatus:async()=>({exists:true,path:'test',size:32768}),database:{getStats:async()=>({success:true,stats:{dbSize:32768,totalCves:0}}),getDetailedStats:async()=>({success:true,stats:{dbSize:987000000,totalCves:331567,totalCpes:2500000,lastUpdate:'2025-01-15'}}),getSyncConfig:async()=>({success:true,config:{}}),updateSyncConfig:async()=>({success:true}),updateStorageConfig:async()=>({success:true}),updatePerformanceConfig:async()=>({success:true}),cpeSearch:async()=>({success:true,results:[]}),reset:async()=>({success:true}),rebuildIndexes:async()=>({success:true}),sync:async()=>({success:true}),startDeltaSync:async()=>({success:true}),cancelSync:async()=>({success:true}),onSyncProgress:()=>()=>{},onSyncComplete:()=>()=>{},onSyncError:()=>()=>{},search:async()=>({success:true,results:[]}),getCve:async()=>({success:false})},platform:'win32',appVersion:'2.0.0',onMenuAction:cb=>ae('menu-action',cb),onUpdateAvailable:cb=>ae('update-available',cb),onProgress:cb=>ae('progress',cb),onNvdSyncProgress:cb=>ae('nvd-sync-progress',cb),onNvdSyncComplete:cb=>ae('nvd-sync-complete',cb),removeAllListeners:c=>el.delete(c),_emitEvent:ee};window.__mockCves=[];console.log('[Mock] Electron API mock installed')})()"
}
```

**Pass Criteria:** Search page loads.

---

### Step 6: Capture Search in light mode

**Tool:** `mcp__chrome-devtools__emulate`
**Parameters:**

```json
{ "colorScheme": "light" }
```

**Tool:** `mcp__chrome-devtools__take_screenshot`
**Parameters:**

```json
{
  "filePath": "e2e/mcp/results/screenshots/search-light.png",
  "fullPage": true
}
```

**Pass Criteria:** Screenshot captured; light theme applied.

---

### Step 7: Capture Search in dark mode

**Tool:** `mcp__chrome-devtools__emulate`
**Parameters:**

```json
{ "colorScheme": "dark" }
```

**Tool:** `mcp__chrome-devtools__take_screenshot`
**Parameters:**

```json
{
  "filePath": "e2e/mcp/results/screenshots/search-dark.png",
  "fullPage": true
}
```

**Pass Criteria:** Screenshot captured; dark theme applied, all text readable.

---

### Step 8: Verify text contrast in both modes on Search

**Tool:** `mcp__chrome-devtools__evaluate_script`
**Parameters:**

```json
{
  "function": "() => { const body = document.body; const cs = getComputedStyle(body); return { colorScheme: cs.colorScheme, backgroundColor: cs.backgroundColor, color: cs.color } }"
}
```

**Pass Criteria:** Text color contrasts with background in both modes.

---

### Step 9: Navigate to Settings page

**Tool:** `mcp__chrome-devtools__navigate_page`
**Parameters:**

```json
{
  "type": "url",
  "url": "http://127.0.0.1:4173/settings",
  "initScript": "(function(){const m={ping:async()=>'pong','app-version':async()=>'2.0.0','app-platform':async()=>'win32','open-external':async()=>true,'nvd:search':async()=>({success:true,results:[],totalResults:0}),'nvd:getCve':async()=>({success:false}),'nvd:getStats':async()=>({success:true,stats:{dbSize:987000000,totalCves:331567}}),'osv:query':async()=>({success:true,results:[]}),'osv:getVulnerability':async()=>({success:false})};const SK='__mock_store__';const ds={'settings.theme':'system','settings.onboardingCompleted':true};const ms=localStorage.getItem(SK)?{...ds,...JSON.parse(localStorage.getItem(SK))}:{...ds};const el=new Map();const ae=(c,cb)=>{if(!el.has(c))el.set(c,new Set());el.get(c).add(cb)};const ee=(c,...a)=>{const l=el.get(c);if(l)l.forEach(cb=>cb(...a))};window.electronAPI={invoke:async(ch,...args)=>{if(m[ch])return m[ch](...args);return undefined},store:{get:async(k)=>ms[k],set:async(k,v)=>{ms[k]=v;localStorage.setItem(SK,JSON.stringify(ms))},delete:async(k)=>{delete ms[k];localStorage.setItem(SK,JSON.stringify(ms))}},secureStorage:{get:async()=>null,set:async()=>true,delete:async()=>true,has:async()=>false},getDatabaseStatus:async()=>({exists:true,path:'test',size:32768}),database:{getStats:async()=>({success:true,stats:{dbSize:32768,totalCves:0}}),getDetailedStats:async()=>({success:true,stats:{dbSize:987000000,totalCves:331567,totalCpes:2500000,lastUpdate:'2025-01-15'}}),getSyncConfig:async()=>({success:true,config:{}}),updateSyncConfig:async()=>({success:true}),updateStorageConfig:async()=>({success:true}),updatePerformanceConfig:async()=>({success:true}),cpeSearch:async()=>({success:true,results:[]}),reset:async()=>({success:true}),rebuildIndexes:async()=>({success:true}),sync:async()=>({success:true}),startDeltaSync:async()=>({success:true}),cancelSync:async()=>({success:true}),onSyncProgress:()=>()=>{},onSyncComplete:()=>()=>{},onSyncError:()=>()=>{},search:async()=>({success:true,results:[]}),getCve:async()=>({success:false})},platform:'win32',appVersion:'2.0.0',onMenuAction:cb=>ae('menu-action',cb),onUpdateAvailable:cb=>ae('update-available',cb),onProgress:cb=>ae('progress',cb),onNvdSyncProgress:cb=>ae('nvd-sync-progress',cb),onNvdSyncComplete:cb=>ae('nvd-sync-complete',cb),removeAllListeners:c=>el.delete(c),_emitEvent:ee};window.__mockCves=[];console.log('[Mock] Electron API mock installed')})()"
}
```

**Pass Criteria:** Settings page loads.

---

### Step 10: Capture Settings in light mode

**Tool:** `mcp__chrome-devtools__emulate`
**Parameters:**

```json
{ "colorScheme": "light" }
```

**Tool:** `mcp__chrome-devtools__take_screenshot`
**Parameters:**

```json
{
  "filePath": "e2e/mcp/results/screenshots/settings-light.png",
  "fullPage": true
}
```

**Pass Criteria:** Screenshot captured; light theme applied.

---

### Step 11: Capture Settings in dark mode

**Tool:** `mcp__chrome-devtools__emulate`
**Parameters:**

```json
{ "colorScheme": "dark" }
```

**Tool:** `mcp__chrome-devtools__take_screenshot`
**Parameters:**

```json
{
  "filePath": "e2e/mcp/results/screenshots/settings-dark.png",
  "fullPage": true
}
```

**Pass Criteria:** Screenshot captured; dark theme applied, form labels readable.

---

### Step 12: Verify text contrast in both modes on Settings

**Tool:** `mcp__chrome-devtools__evaluate_script`
**Parameters:**

```json
{
  "function": "() => { const body = document.body; const cs = getComputedStyle(body); return { colorScheme: cs.colorScheme, backgroundColor: cs.backgroundColor, color: cs.color } }"
}
```

**Pass Criteria:** Text color contrasts with background in both modes.

---

### Step 13: Reset color scheme emulation

**Tool:** `mcp__chrome-devtools__emulate`
**Parameters:**

```json
{ "colorScheme": "auto" }
```

**Pass Criteria:** Emulation reset; browser returns to system default.

---

### Step 14: Verify no console errors during theme switches

**Tool:** `mcp__chrome-devtools__list_console_messages`
**Parameters:**

```json
{ "types": ["error"] }
```

**Pass Criteria:** Zero errors logged during all theme transitions across routes.

---

## Assertions

| #   | Assertion                                                          | Route(s)              | Severity |
| --- | ------------------------------------------------------------------ | --------------------- | -------- |
| A1  | All 6 screenshots captured without tool errors                     | /, /search, /settings | critical |
| A2  | Light mode renders correctly (white/light background)              | /, /search, /settings | critical |
| A3  | Dark mode renders correctly (dark background, light text)          | /, /search, /settings | critical |
| A4  | Text is legible in both themes (no white-on-white or dark-on-dark) | /, /search, /settings | critical |
| A5  | No console errors triggered by theme switching                     | /, /search, /settings | high     |
| A6  | Form inputs and interactive elements visible in both themes        | /search, /settings    | high     |
| A7  | Navigation elements maintain contrast in both themes               | /, /search, /settings | high     |
| A8  | Color scheme emulation resets cleanly to auto                      | all                   | medium   |

## Results

| Step | Status | Notes |
| ---- | ------ | ----- |
| 1    |        |       |
| 2    |        |       |
| 3    |        |       |
| 4    |        |       |
| 5    |        |       |
| 6    |        |       |
| 7    |        |       |
| 8    |        |       |
| 9    |        |       |
| 10   |        |       |
| 11   |        |       |
| 12   |        |       |
| 13   |        |       |
| 14   |        |       |

| Assertion | Status | Evidence |
| --------- | ------ | -------- |
| A1        |        |          |
| A2        |        |          |
| A3        |        |          |
| A4        |        |          |
| A5        |        |          |
| A6        |        |          |
| A7        |        |          |
| A8        |        |          |
