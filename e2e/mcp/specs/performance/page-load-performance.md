# Page Load Performance

**Category:** performance
**Priority:** critical
**Prerequisites:**

- Preview server running at http://127.0.0.1:4173
- Build completed (`npm run build`)

**MCP Tools Used:** mcp**chrome-devtools**navigate_page, mcp**chrome-devtools**performance_start_trace, mcp**chrome-devtools**performance_stop_trace, mcp**chrome-devtools**performance_analyze_insight

---

## Steps

### Step 1: Navigate to application with Electron mocks

**Tool:** mcp**chrome-devtools**navigate_page
**Parameters:**

- `type`: "url"
- `url`: "http://127.0.0.1:4173"
- `initScript`: "(function(){const m={ping:async()=>'pong','app-version':async()=>'2.0.0','app-platform':async()=>'win32','open-external':async()=>true,'nvd:search':async()=>({success:true,results:[],totalResults:0}),'nvd:getCve':async()=>({success:false}),'nvd:getStats':async()=>({success:true,stats:{dbSize:987000000,totalCves:331567}}),'osv:query':async()=>({success:true,results:[]}),'osv:getVulnerability':async()=>({success:false})};const SK='**mock_store**';const ds={'settings.theme':'system','settings.onboardingCompleted':true};const ms=localStorage.getItem(SK)?{...ds,...JSON.parse(localStorage.getItem(SK))}:{...ds};const el=new Map();const ae=(c,cb)=>{if(!el.has(c))el.set(c,new Set());el.get(c).add(cb)};const ee=(c,...a)=>{const l=el.get(c);if(l)l.forEach(cb=>cb(...a))};window.electronAPI={invoke:async(ch,...args)=>{if(m[ch])return m[ch](...args);return undefined},store:{get:async(k)=>ms[k],set:async(k,v)=>{ms[k]=v;localStorage.setItem(SK,JSON.stringify(ms))},delete:async(k)=>{delete ms[k];localStorage.setItem(SK,JSON.stringify(ms))}},secureStorage:{get:async()=>null,set:async()=>true,delete:async()=>true,has:async()=>false},getDatabaseStatus:async()=>({exists:true,path:'test',size:32768}),database:{getStats:async()=>({success:true,stats:{dbSize:32768,totalCves:0}}),getDetailedStats:async()=>({success:true,stats:{dbSize:987000000,totalCves:331567,totalCpes:2500000,lastUpdate:'2025-01-15'}}),getSyncConfig:async()=>({success:true,config:{}}),updateSyncConfig:async()=>({success:true}),updateStorageConfig:async()=>({success:true}),updatePerformanceConfig:async()=>({success:true}),cpeSearch:async()=>({success:true,results:[]}),reset:async()=>({success:true}),rebuildIndexes:async()=>({success:true}),sync:async()=>({success:true}),startDeltaSync:async()=>({success:true}),cancelSync:async()=>({success:true}),onSyncProgress:()=>()=>{},onSyncComplete:()=>()=>{},onSyncError:()=>()=>{},search:async()=>({success:true,results:[]}),getCve:async()=>({success:false})},platform:'win32',appVersion:'2.0.0',onMenuAction:cb=>ae('menu-action',cb),onUpdateAvailable:cb=>ae('update-available',cb),onProgress:cb=>ae('progress',cb),onNvdSyncProgress:cb=>ae('nvd-sync-progress',cb),onNvdSyncComplete:cb=>ae('nvd-sync-complete',cb),removeAllListeners:c=>el.delete(c),\_emitEvent:ee};window.\_\_mockCves=[];console.log('[Mock] Electron API mock installed')})()"

**Expected Result:** Page loads with the dashboard visible and no console errors.
**Pass Criteria:** HTTP 200 response, dashboard renders, no error-level console messages.

### Step 2: Start performance trace with page reload

**Tool:** mcp**chrome-devtools**performance_start_trace
**Parameters:**

- `reload`: true
- `autoStop`: true
- `filePath`: "e2e/mcp/results/traces/page-load-trace.json"

**Expected Result:** Trace recording captures the full page reload lifecycle including initial navigation, resource loading, script execution, and first paint/render milestones.
**Pass Criteria:** Trace starts successfully, records the reload, and saves to the specified file path.

### Step 3: Stop performance trace

**Tool:** mcp**chrome-devtools**performance_stop_trace
**Parameters:**

- `filePath`: "e2e/mcp/results/traces/page-load-trace.json"

**Expected Result:** Trace recording stops and the full trace data is written to disk.
**Pass Criteria:** Trace file is saved successfully, contains navigation and rendering data.

### Step 4: Analyze performance insights

**Tool:** mcp**chrome-devtools**performance_analyze_insight
**Parameters:**

- `insightSetId`: [use the first available insight set ID from trace results]
- `insightName`: "DocumentLatency"

**Expected Result:** Insight report shows document latency breakdown including server response time, parse time, and render time.
**Pass Criteria:** LCP value is returned and can be compared against the 2500ms threshold.

### Step 5: Analyze layout shift insights

**Tool:** mcp**chrome-devtools**performance_analyze_insight
**Parameters:**

- `insightSetId`: [use the first available insight set ID from trace results]
- `insightName`: "CLSCauses"

**Expected Result:** Insight report identifies any cumulative layout shifts during page load.
**Pass Criteria:** CLS score is returned and can be compared against the 0.1 threshold.

### Step 6: Analyze long task insights

**Tool:** mcp**chrome-devtools**performance_analyze_insight
**Parameters:**

- `insightSetId`: [use the first available insight set ID from trace results]
- `insightName`: "LongTasks"

**Expected Result:** Insight report lists any long tasks that block the main thread during initial load.
**Pass Criteria:** No individual long task exceeds 500ms duration.

---

## Assertions

| #   | Assertion                                     | Tool                                          | Pass Criteria                                              |
| --- | --------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------- |
| 1   | Largest Contentful Paint under threshold      | performance_analyze_insight (DocumentLatency) | LCP < 2500ms                                               |
| 2   | Cumulative Layout Shift under threshold       | performance_analyze_insight (CLSCauses)       | CLS < 0.1                                                  |
| 3   | No long tasks exceeding 500ms on initial load | performance_analyze_insight (LongTasks)       | All long tasks < 500ms                                     |
| 4   | Page loads without console errors             | list_console_messages                         | Zero messages of type "error"                              |
| 5   | Trace file saved to disk                      | performance_stop_trace                        | File exists at e2e/mcp/results/traces/page-load-trace.json |

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
