# Search Interaction Performance

**Category:** performance
**Priority:** high
**Prerequisites:**

- Preview server running at http://127.0.0.1:4173
- Build completed (`npm run build`)

**MCP Tools Used:** mcp**chrome-devtools**navigate_page, mcp**chrome-devtools**take_snapshot, mcp**chrome-devtools**performance_start_trace, mcp**chrome-devtools**click, mcp**chrome-devtools**type_text, mcp**chrome-devtools**performance_stop_trace, mcp**chrome-devtools**performance_analyze_insight

---

## Steps

### Step 1: Navigate to application with Electron mocks

**Tool:** mcp**chrome-devtools**navigate_page
**Parameters:**

- `type`: "url"
- `url`: "http://127.0.0.1:4173"
- `initScript`: "(function(){const m={ping:async()=>'pong','app-version':async()=>'2.0.0','app-platform':async()=>'win32','open-external':async()=>true,'nvd:search':async()=>({success:true,results:[],totalResults:0}),'nvd:getCve':async()=>({success:false}),'nvd:getStats':async()=>({success:true,stats:{dbSize:987000000,totalCves:331567}}),'osv:query':async()=>({success:true,results:[]}),'osv:getVulnerability':async()=>({success:false})};const SK='**mock_store**';const ds={'settings.theme':'system','settings.onboardingCompleted':true};const ms=localStorage.getItem(SK)?{...ds,...JSON.parse(localStorage.getItem(SK))}:{...ds};const el=new Map();const ae=(c,cb)=>{if(!el.has(c))el.set(c,new Set());el.get(c).add(cb)};const ee=(c,...a)=>{const l=el.get(c);if(l)l.forEach(cb=>cb(...a))};window.electronAPI={invoke:async(ch,...args)=>{if(m[ch])return m[ch](...args);return undefined},store:{get:async(k)=>ms[k],set:async(k,v)=>{ms[k]=v;localStorage.setItem(SK,JSON.stringify(ms))},delete:async(k)=>{delete ms[k];localStorage.setItem(SK,JSON.stringify(ms))}},secureStorage:{get:async()=>null,set:async()=>true,delete:async()=>true,has:async()=>false},getDatabaseStatus:async()=>({exists:true,path:'test',size:32768}),database:{getStats:async()=>({success:true,stats:{dbSize:32768,totalCves:0}}),getDetailedStats:async()=>({success:true,stats:{dbSize:987000000,totalCves:331567,totalCpes:2500000,lastUpdate:'2025-01-15'}}),getSyncConfig:async()=>({success:true,config:{}}),updateSyncConfig:async()=>({success:true}),updateStorageConfig:async()=>({success:true}),updatePerformanceConfig:async()=>({success:true}),cpeSearch:async()=>({success:true,results:[]}),reset:async()=>({success:true}),rebuildIndexes:async()=>({success:true}),sync:async()=>({success:true}),startDeltaSync:async()=>({success:true}),cancelSync:async()=>({success:true}),onSyncProgress:()=>()=>{},onSyncComplete:()=>()=>{},onSyncError:()=>()=>{},search:async()=>({success:true,results:[]}),getCve:async()=>({success:false})},platform:'win32',appVersion:'2.0.0',onMenuAction:cb=>ae('menu-action',cb),onUpdateAvailable:cb=>ae('update-available',cb),onProgress:cb=>ae('progress',cb),onNvdSyncProgress:cb=>ae('nvd-sync-progress',cb),onNvdSyncComplete:cb=>ae('nvd-sync-complete',cb),removeAllListeners:c=>el.delete(c),\_emitEvent:ee};window.\_\_mockCves=[];console.log('[Mock] Electron API mock installed')})()"

**Expected Result:** Page loads with the dashboard visible.
**Pass Criteria:** Dashboard renders without console errors.

### Step 2: Navigate to search page via SPA router

**Tool:** mcp**chrome-devtools**navigate_page
**Parameters:**

- `type`: "url"
- `url`: "http://127.0.0.1:4173/search"

**Expected Result:** Search page loads within the SPA without a full page reload. The search input field is visible and focused.
**Pass Criteria:** URL updates to /search, search input element is present in the DOM snapshot.

### Step 3: Take snapshot to locate search input

**Tool:** mcp**chrome-devtools**take_snapshot
**Parameters:**

- (none)

**Expected Result:** Snapshot returns the accessibility tree including the search input element with its uid.
**Pass Criteria:** Search input element is found in the snapshot and its uid can be extracted.

### Step 4: Start performance trace without reload

**Tool:** mcp**chrome-devtools**performance_start_trace
**Parameters:**

- `reload`: false
- `autoStop`: false
- `filePath`: "e2e/mcp/results/traces/search-interaction-trace.json"

**Expected Result:** Trace recording begins on the current page state without triggering a reload, capturing only user interaction activity.
**Pass Criteria:** Trace starts successfully in the background.

### Step 5: Click the search input to focus it

**Tool:** mcp**chrome-devtools**click
**Parameters:**

- `uid`: [uid of the search input element from Step 3]

**Expected Result:** Search input receives focus, cursor is active in the field.
**Pass Criteria:** Input element is focused (visible in subsequent snapshot).

### Step 6: Type search query to trigger interaction

**Tool:** mcp**chrome-devtools**type_text
**Parameters:**

- `text`: "lodash"

**Expected Result:** The text "lodash" is typed into the search input character by character. Each keystroke may trigger search/filter operations that should remain responsive.
**Pass Criteria:** Text appears in the search input, search results update (or attempt to update) without UI freezing.

### Step 7: Stop performance trace

**Tool:** mcp**chrome-devtools**performance_stop_trace
**Parameters:**

- `filePath`: "e2e/mcp/results/traces/search-interaction-trace.json"

**Expected Result:** Trace recording stops and the trace data covering the typing interaction is saved to disk.
**Pass Criteria:** Trace file is saved successfully and contains interaction data.

### Step 8: Analyze long task insights during typing

**Tool:** mcp**chrome-devtools**performance_analyze_insight
**Parameters:**

- `insightSetId`: [use the first available insight set ID from trace results]
- `insightName`: "LongTasks"

**Expected Result:** Insight report shows no long tasks occurred during the typing interaction period.
**Pass Criteria:** No long tasks detected during the typing timeframe, confirming responsive input handling.

### Step 9: Analyze interaction-to-render latency

**Tool:** mcp**chrome-devtools**performance_analyze_insight
**Parameters:**

- `insightSetId`: [use the first available insight set ID from trace results]
- `insightName`: "DocumentLatency"

**Expected Result:** Insight report confirms that the search results rendered within the acceptable time window after the typing interaction.
**Pass Criteria:** Time from last keystroke to search results render is under 500ms.

---

## Assertions

| #   | Assertion                               | Tool                                          | Pass Criteria                                                            |
| --- | --------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------ |
| 1   | Search page loads without errors        | navigate_page                                 | HTTP 200, no error console messages                                      |
| 2   | Search input is present and interactive | take_snapshot                                 | Input element found in a11y tree                                         |
| 3   | No long tasks during typing interaction | performance_analyze_insight (LongTasks)       | Zero long tasks > 50ms during typing                                     |
| 4   | Search results render within threshold  | performance_analyze_insight (DocumentLatency) | Results render < 500ms after input                                       |
| 5   | Trace captures interaction period       | performance_stop_trace                        | Trace file saved at e2e/mcp/results/traces/search-interaction-trace.json |
| 6   | UI remains responsive during search     | type_text                                     | No visible lag or frozen frames reported                                 |

---

## Results

_This section is filled in during execution._

| Step | Status | Details | Screenshot |
| ---- | ------ | ------- | ---------- |
| 1    |        |         |            |
| 2    |        |         |            |
| 3    |        |         |            |
| 4    |        |         |            |
| 5    |        |         |            |
| 6    |        |         |            |
| 7    |        |         |            |
| 8    |        |         |            |
| 9    |        |         |            |
