// js/main.js
import EditableText from './components/EditableText.js';
import * as Utils from './modules/utils.js';
import * as API from './modules/api.js';
import * as Exporter from './modules/exporter.js';

// 取得全域 Vue
const { createApp } = Vue;

const App = {
    components: { EditableText },
    data() {
        return {
            templateArrayBuffer: null, 
            templateLoaded: false, 
            isSaved: false, 
            isLoading: false,
            loadingMsg: '處理中...',
            showSettings: false, 
            showLightbox: false, 
            lightboxImg: '',
            config: { scriptUrl: '', token: '', folderId: '' },
            logs: [],
            // ⭐ 新增這兩行
            viewYear: null,
            viewMonth: null,
            viewDay: 'all', // ⭐ 新增：預設顯示全月
            searchQuery: '', // ⭐ 新增：搜尋關鍵字
            // ⭐ 新增這行：記錄目前停留在哪個分頁
            currentTab: 'worklog',
            
            showFilterModal: false,
            showReportMode: false, 
            filter: { projectName: '', startDate: '', endDate: '' },
            filteredLogs: []
        }
    },
    mounted() {
        const savedConfig = localStorage.getItem('v7_config');
        if (savedConfig) { try { this.config = JSON.parse(savedConfig); } catch(e) {} }
        if (!this.config.scriptUrl) { const oldUrl = localStorage.getItem('googleScriptUrl'); if (oldUrl) this.config.scriptUrl = oldUrl; }
        
        // ⭐ 改用專屬函式來載入資料
        this.loadTabData('worklog');

        window.addEventListener('keydown', this.handleKeydown);
    },
    unmounted() {
        window.removeEventListener('keydown', this.handleKeydown);
    },
    computed: {
        uniqueProjectNames() {
            const names = new Set();
            this.logs.forEach(day => {
                if (day.projects) {
                    day.projects.forEach(p => {
                        if (p.name && p.name.trim() !== "") names.add(p.name);
                    });
                }
            });
            return Array.from(names).sort();
        }, // 記得這裡要加逗號

        // ⭐ 新增：計算有哪些年份可選 (西元年)
        yearList() {
            const years = new Set();
            this.logs.forEach(day => {
                // 資料格式 "115.01.14" -> 取出 115
                const parts = day.date.split('.');
                if (parts.length > 0) {
                    const rocYear = parseInt(parts[0]);
                    if (!isNaN(rocYear)) years.add(rocYear + 1911); // 轉西元
                }
            });
            // 補上今年 (避免新檔案沒年份)
            const currentYear = new Date().getFullYear();
            years.add(currentYear);
            
            // 由大到小排序 (2026, 2025...)
            return Array.from(years).sort((a, b) => b - a);
        },

        // ⭐ 新增：計算當下可見的筆數
        visibleCount() {
            return this.logs.filter(day => this.isDayVisible(day)).length;
        },

        // ⭐ 新增：動態計算目前選擇的月份有幾天
        daysInSelectedMonth() {
            if (!this.viewYear || this.viewMonth === 'all') return 31;
            // 運用 JS 內建 Date 的小技巧：傳入 0 就能自動取得該月的最後一天 (自動處理大小月與閏年)
            return new Date(this.viewYear, parseInt(this.viewMonth), 0).getDate();
        }

    },
    watch: {
        // ⭐ 新增：監聽月份變化，遇到不合理的日期自動跳回全月
        viewMonth(newVal) {
            if (newVal === 'all') {
                this.viewDay = 'all';
            } else {
                const maxDays = new Date(this.viewYear, parseInt(newVal), 0).getDate();
                if (this.viewDay !== 'all' && parseInt(this.viewDay) > maxDays) {
                    this.viewDay = 'all'; 
                }
            }
        },
        logs: { 
            handler(newVal) { 
                // ⭐ 動態決定要存進本地端哪個抽屜
                const storageKey = this.currentTab === 'worklog' ? 'workLogData' : 'notesData';
                localStorage.setItem(storageKey, JSON.stringify(newVal)); 
                this.isSaved = true; 
                setTimeout(() => this.isSaved = false, 1500); 
            }, 
            deep: true 
        }
    },
    methods: {
        // ⭐ 新增 1：載入指定分頁的資料
        loadTabData(tabName) {
            const storageKey = tabName === 'worklog' ? 'workLogData' : 'notesData';
            const savedData = localStorage.getItem(storageKey);
            
            if (savedData) { 
                try { this.logs = JSON.parse(savedData); } catch(e) { this.logs = []; } 
            } else { 
                this.logs = []; 
                this.addNewDay(); 
            }
            
            // 切換分頁時，自動跳回「今天」的視角，並清空搜尋框
            const today = new Date();
            this.viewYear = today.getFullYear();
            this.viewMonth = String(today.getMonth() + 1).padStart(2, '0');
            this.viewDay = 'all'; // ⭐ 加入這行：切換分頁預設看全月
            this.searchQuery = '';
        },

        // ⭐ 新增 2：執行頁籤切換
        switchTab(tabName) {
            if (this.currentTab === tabName) return; 
            this.currentTab = tabName;
            this.isLoading = true;
            this.loadingMsg = '切換分頁中...';
            
            setTimeout(() => {
                this.loadTabData(tabName);
                this.isLoading = false;
            }, 300);
        },
        // --- 1. 橋接工具函式 (讓 Template 可以呼叫) ---
        toABC: Utils.toABC,
        toRoman: Utils.toRoman,
        renderHTML: Utils.renderHTML,
        handleDatePick: Utils.handleDatePick,

        // ⭐ 1. 判斷該日誌是否應該出現在畫面上 (結合搜尋與年月過濾)
        isDayVisible(day) {
            // --- 模式 A：如果有輸入搜尋字，啟動「無視年月」的全域搜尋 ---
            if (this.searchQuery && this.searchQuery.trim() !== '') {
                const lowerQuery = this.searchQuery.toLowerCase().trim();
                
                // 聰明搜尋法：將整天資料轉成字串比對
                // (利用 replacer 刻意排除圖片 Base64 編碼，避免亂碼造成誤判)
                const searchTarget = JSON.stringify(day, (key, value) => {
                    if (key === 'imgUrl' || key === 'driveId') return undefined;
                    return value;
                }).toLowerCase();
                
                return searchTarget.includes(lowerQuery);
            }

            // --- 模式 B：如果沒有搜尋，就乖乖依照「年月選單」過濾 ---
            if (!this.viewYear || !this.viewMonth) return true;

            const targetRocYear = this.viewYear - 1911;
            const parts = day.date.split('.');
            if (parts.length < 2) return false;
            
            const dYear = parseInt(parts[0]);
            const dMonth = parts[1];
            const dDay = parts.length > 2 ? parts[2] : null; // ⭐ 抓出資料中的「日」

            if (dYear !== targetRocYear) return false;
            if (this.viewMonth !== 'all' && dMonth !== this.viewMonth) return false;
            if (this.viewDay !== 'all' && dDay !== this.viewDay) return false;

            return true;
        },

        // ⭐ 2. 依照日期遞減排序，讓新增或修改的資料歸位
        sortLogs() {
            this.logs.sort((a, b) => {
                // 因為格式是 115.02.13，可以直接用字串比較大小
                if (a.date > b.date) return -1;
                if (a.date < b.date) return 1;
                return 0;
            });
            alert("✅ 已依日期重新排序歸位！");
        },

        saveConfig() { localStorage.setItem('v7_config', JSON.stringify(this.config)); this.showSettings = false; },
        
        // ⭐ 1. 抽離出來的共用上傳邏輯 (負責壓縮 + 上傳到 GAS)
        // ⭐ 1. 共用上傳邏輯 (接收 dateStr 參數並傳給 API)
        async uploadImageProcess(blob, item, dateStr) {
            const base64 = await Utils.compressImage(blob);
            item.imgUrl = base64; // 先顯示預覽

            if (!this.config.scriptUrl || !this.config.token || !this.config.folderId) {
                this.showSettings = true;
                return alert("⚠️ 請先在設定中填寫完整的 GAS 連結、Token 和 Folder ID");
            }

            this.isLoading = true;
            this.loadingMsg = '圖片處理上傳中...';
            
            try {
                // ⭐ 這裡多傳遞 dateStr 給 API
                const result = await API.uploadImageToGAS(this.config, base64, dateStr);
                if (result.success) { 
                    item.imgUrl = result.url; 
                    item.driveId = result.id; 
                } else { 
                    alert("上傳失敗：" + result.message); 
                }
            } catch (e) { 
                alert("上傳出錯: " + e); 
            }
            this.isLoading = false;
        },

        // ⭐ 2. 檔案上傳 (接收 dateStr)
        async handleImageUpload(event, item, dateStr) {
            const file = event.target.files[0];
            if (!file) return;
            await this.uploadImageProcess(file, item, dateStr); 
            event.target.value = ''; 
        },

        // ⭐ 3. 從剪貼簿貼上圖片 (接收 dateStr)
        async handlePasteImage(item, dateStr) {
            try {
                const clipboardItems = await navigator.clipboard.read();
                
                for (const clipboardItem of clipboardItems) {
                    const imageType = clipboardItem.types.find(type => type.startsWith('image/'));
                    if (imageType) {
                        const blob = await clipboardItem.getType(imageType);
                        await this.uploadImageProcess(blob, item, dateStr);
                        return; 
                    }
                }
                alert("📋 剪貼簿裡沒有圖片！\n請先按 Win+Shift+S (或 Mac 的 Cmd+Shift+4) 截圖。");
            } catch (err) {
                console.error(err);
                alert("無法讀取剪貼簿：\n1. 請確認瀏覽器已授權「剪貼簿」存取權限。\n2. 必須使用 https 或 localhost 環境。");
            }
        },

        async deleteImage(item) {
            if (!confirm("確定要刪除這張圖片嗎？\n\n注意：這將會把 Google Drive 上的原始檔案也移至垃圾桶！")) return;
            if (item.driveId && this.config.scriptUrl && this.config.token) {
                this.isLoading = true; this.loadingMsg = '正在刪除雲端檔案...';
                try {
                    const result = await API.deleteImageFromGAS(this.config, item.driveId);
                    if (!result.success) alert("雲端刪除失敗，但將移除本地連結。");
                } catch (e) { console.error(e); }
                this.isLoading = false;
            }
            item.imgUrl = ''; item.driveId = '';
        },

        deleteCloudFile(driveId) {
             if (!driveId || !this.config.scriptUrl || !this.config.token) return;
             API.deleteImageFromGAS(this.config, driveId).catch(e => console.error("雲端檔案刪除失敗:", e));
        },

        // --- 同步清理 (修復版) ---
        async syncGDImages() {
            if (!this.config.scriptUrl || !this.config.token || !this.config.folderId) {
                alert("⚠️ 請先在設定中填寫完整的 GAS 連結與 Folder ID");
                this.showSettings = true; return; 
            }
            this.isLoading = true; this.loadingMsg = '正在比對檔案...';
            try {
                const localIds = new Set();
                
                // 收集 ID 的遞迴函式
                const collect = (arr) => {
                    if (!Array.isArray(arr)) return; 
                    arr.forEach(item => {
                        if (!item) return;
                        if (item.driveId) localIds.add(item.driveId);
                        collect(item.subs || []);
                        collect(item.subsubs || []);
                    });
                };

                // ⭐ 核心修正：必須同時收集「工作日誌」和「一般記事」的圖片 ID
                const worklogData = this.currentTab === 'worklog' ? this.logs : JSON.parse(localStorage.getItem('workLogData') || '[]');
                const notesData = this.currentTab === 'notes' ? this.logs : JSON.parse(localStorage.getItem('notesData') || '[]');
                const allLocalLogs = [...worklogData, ...notesData];

                // 掃描所有資料
                allLocalLogs.forEach(d => {
                    (d.projects || []).forEach(p => {
                        collect(p.items || []); 
                    });
                });

                // 2. 取得雲端列表
                const result = await API.listFiles(this.config);
                if (!result.success) throw new Error(result.message);
                
                // 3. 比對
                const remoteFiles = result.files || []; 
                const orphans = remoteFiles.filter(f => !localIds.has(f.id));
                
                if (orphans.length === 0) {
                    alert("✅ 同步完成！雲端檔案與本機資料完全相符，沒有孤兒檔案。");
                } else {
                    if (confirm(`⚠️ 發現 ${orphans.length} 個未使用的孤兒檔案，是否刪除？\n\n(這些檔案存在雲端，但「工作日誌」與「一般記事」中都沒有使用到它們)`)) {
                        this.loadingMsg = '正在刪除...';
                        for (let f of orphans) {
                            await API.deleteImageFromGAS(this.config, f.id);
                        }
                        alert("✅ 清理完成！");
                    }
                }
            } catch (e) { 
                console.error(e); 
                alert("同步錯誤: " + e.message); 
            }
            this.isLoading = false;
        },

        // --- 3. 匯出/匯入 (使用 Exporter 模組) ---
        exportExcel() { 
        // ⭐ 判斷當前分頁，決定檔名與頁籤名稱
        const filePrefix = this.currentTab === 'worklog' ? '工作日誌資料庫' : '一般記事';
        const sheetName = this.currentTab === 'worklog' ? '工作日誌資料庫' : '一般記事資料庫';
    
        // 將兩個名稱一起傳給輸出模組
        Exporter.exportExcel(this.logs, filePrefix, sheetName); 
        },
        
        importExcel(event) {
            const file = event.target.files[0];
            if(!file) return;
            Exporter.importExcel(file, (newLogs) => {
                
                this.logs = newLogs;
                alert("資料庫匯入成功！");
                event.target.value = '';
            });
        },
        
        generateDocx() { 
         // 利用您原本寫好的 isDayVisible 判斷，篩選出畫面上看得到的資料
         const currentVisibleLogs = this.logs.filter(day => this.isDayVisible(day));
         Exporter.generateDocx(currentVisibleLogs, this.templateArrayBuffer); 
        },
        
        loadTemplate(e) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (evt) => { this.templateArrayBuffer = evt.target.result; this.templateLoaded = true; };
            reader.readAsArrayBuffer(file);
        },

        // --- 4. UI 互動與邏輯 (完全保留原始代碼) ---
        // 替換原有的 cleanUpOldData (確保下載覆蓋時，兩邊的圖片都不會變孤兒)
        cleanUpOldData(mode = 'all') {
            let orphanFiles = [];
            let targetLogs = [];

            // ⭐ 智慧判斷要檢查的範圍
            if (mode === 'all') {
                const worklogData = this.currentTab === 'worklog' ? this.logs : JSON.parse(localStorage.getItem('workLogData') || '[]');
                const notesData = this.currentTab === 'notes' ? this.logs : JSON.parse(localStorage.getItem('notesData') || '[]');
                targetLogs = [...worklogData, ...notesData];
            } else {
                targetLogs = this.logs; // 'current' 模式：只檢查目前畫面上的資料
            }

            targetLogs.forEach(day => {
                (day.projects || []).forEach(proj => {
                    (proj.items || []).forEach(item => {
                        if(item && item.driveId) orphanFiles.push(item.driveId);
                        if(item && item.subs) {
                            item.subs.forEach(sub => {
                                if(sub && sub.driveId) orphanFiles.push(sub.driveId);
                                if(sub && sub.subsubs) {
                                    sub.subsubs.forEach(ss => {
                                        if(ss && ss.driveId) orphanFiles.push(ss.driveId);
                                    });
                                }
                            });
                        }
                    });
                });
            });
            
            if (orphanFiles.length === 0) return;
            
            // ⭐ 動態顯示警告訊息的名稱
            const scopeName = mode === 'all' ? '「日誌」與「記事」' : (this.currentTab === 'worklog' ? '「工作日誌」' : '「一般記事」');
            const msg = `⚠️ 警告：目前的${scopeName}中共有 ${orphanFiles.length} 張已上傳的圖片！\n\n匯入新資料將會「覆蓋」掉這些紀錄，導致圖片變成永久佔用雲端空間的孤兒檔案。\n\n請問是否要先將這些舊圖片從 Google Drive 刪除？`;
            
            if (confirm(msg)) {
                orphanFiles.forEach(id => { this.deleteCloudFile(id); });
                console.log(`已發送 ${orphanFiles.length} 個刪除請求。`);
            }
        },

        generateReport() {
            if (!this.filter.projectName) return alert("請選擇案件名稱！");
            this.filteredLogs = [];
            const fStart = this.filter.startDate;
            const fEnd = this.filter.endDate;
            const fProj = this.filter.projectName;

            this.logs.forEach(day => {
                let inRange = true;
                if (fStart && day.date < fStart) inRange = false;
                if (fEnd && day.date > fEnd) inRange = false;
                if (inRange) {
                    const targetProject = day.projects.find(p => p.name === fProj);
                    if (targetProject) {
                        const dayClone = JSON.parse(JSON.stringify(day));
                        dayClone.projects = [JSON.parse(JSON.stringify(targetProject))];
                        this.filteredLogs.push(dayClone);
                    }
                }
            });
            this.showFilterModal = false;
            this.showReportMode = true;
        },

        // 替換原有的 checkAndUpload (打包上傳)
        async checkAndUpload() {
            if (!this.config.scriptUrl || !this.config.token) { alert("⚠️ 尚未設定連結！"); this.showSettings = true; return; }
            if(!confirm("⚠️ 確定將「工作日誌」與「一般記事」一同打包上傳至雲端備份？")) return;
            this.isLoading = true; this.loadingMsg = '正在打包並上傳至 Firebase...';
            try {
                // 抓取兩邊最新的資料
                const worklogData = this.currentTab === 'worklog' ? this.logs : JSON.parse(localStorage.getItem('workLogData') || '[]');
                const notesData = this.currentTab === 'notes' ? this.logs : JSON.parse(localStorage.getItem('notesData') || '[]');
                
                // ⭐ 核心技巧：將兩份資料封裝成一個「大包裹」丟給 Firebase
                const combinedData = {
                    worklog: worklogData,
                    notes: notesData
                };

                const res = await API.syncUpload(this.config, combinedData);
                if(res.result === "Success") alert("✅ 雙軌資料上傳成功");
                else alert("❌ 上傳失敗");
            } catch(e) { alert("❌ 錯誤: " + e); }
            this.isLoading = false;
        },

        // 替換原有的 checkAndDownload (拆解下載)
        async checkAndDownload() {
            if (!this.config.scriptUrl || !this.config.token) { alert("⚠️ 尚未設定連結！"); this.showSettings = true; return; }
            if(!confirm("⚠️ 確定要從雲端「下載」資料嗎？\n(這將會覆蓋您電腦上目前的「日誌」與「記事」資料！)")) return;
            
            this.isLoading = true; this.loadingMsg = '正在從 Firebase 下載...';
            try {
                const res = await API.syncDownload(this.config);
                
                if (Array.isArray(res)) {
                    // 兼容舊版：如果雲端抓下來是舊的純陣列格式，自動升級
                    localStorage.setItem('workLogData', JSON.stringify(res));
                    localStorage.setItem('notesData', JSON.stringify([]));
                    this.logs = this.currentTab === 'worklog' ? res : [];
                    alert("✅ 下載成功 (已自動升級為雙軌格式)");
                } else if (res && typeof res === 'object') {
                    // 拆包新版：將雲端大包裹拆解放回各自的抽屜
                    const wl = res.worklog || [];
                    const nt = res.notes || [];
                    localStorage.setItem('workLogData', JSON.stringify(wl));
                    localStorage.setItem('notesData', JSON.stringify(nt));
                    this.logs = this.currentTab === 'worklog' ? wl : nt;
                    alert("✅ 雙軌資料下載成功");
                } else {
                    alert("❌ 格式錯誤");
                }
            } catch(e) { alert("❌ 錯誤: " + e); }
            this.isLoading = false;
        },

        openLightbox(url) { this.lightboxImg = url; this.showLightbox = true; },
        closeLightbox() { this.showLightbox = false; this.lightboxImg = ''; },
        closeReport() { this.showReportMode = false; this.filteredLogs = []; },
        printToPdf() { document.body.classList.add('printing-report'); window.print(); document.body.classList.remove('printing-report'); },
        printPage() { window.print(); },
        printSingleDay(dIdx) {
            document.body.classList.add('printing-single-day');
            const card = document.getElementById('day-card-' + dIdx);
            if(card) card.classList.add('print-focus');
            window.print();
            document.body.classList.remove('printing-single-day');
            if(card) card.classList.remove('print-focus');
        },
        handleKeydown(e) { if (e.key === 'Escape') { if(this.showLightbox) this.closeLightbox(); if(this.showReportMode) this.closeReport(); } },
        clearStorage() { 
          // 動態判斷目前分頁的中文名稱，讓提示視窗更清楚
          const tabName = this.currentTab === 'worklog' ? '工作日誌' : '一般記事';
    
          if(confirm(`確定要清空「${tabName}」的所有資料嗎？\n(注意：此動作只會清空目前分頁，不會影響另一個分頁)`)) { 
              this.logs = []; 
        
          // 動態判斷要刪除的資料庫名稱
          const storageKey = this.currentTab === 'worklog' ? 'workLogData' : 'notesData';
          localStorage.removeItem(storageKey); 
        
          this.addNewDay(); 
          } 
        },
        
        // --- 替換這段 addNewDay 函式 ---
        addNewDay() {
            const today = new Date();
            let targetYear = today.getFullYear();
            let targetMonth = String(today.getMonth() + 1).padStart(2, '0');
            let targetDay = String(today.getDate()).padStart(2, '0');

            // ⭐ 智能感知：判斷使用者現在正在看哪一年、哪一月
            if (this.viewYear) {
                targetYear = this.viewYear;
            }
            if (this.viewMonth && this.viewMonth !== 'all') {
                targetMonth = this.viewMonth;
                
                // 如果使用者正在看的不是「當下真實的年月」(代表在補舊日誌)
                // 我們就把日期預設為該月的 01 號，讓他自己微調
                const isCurrentMonth = (targetYear === today.getFullYear() && targetMonth === String(today.getMonth() + 1).padStart(2, '0'));
                if (!isCurrentMonth) {
                    targetDay = '01'; 
                }
                // ⭐ 新增：判斷是否處於單日檢視模式
                if (this.viewDay && this.viewDay !== 'all') {
                    targetDay = this.viewDay; // 直接帶入選定的日子
                } else {
                    const isCurrentMonth = (targetYear === today.getFullYear() && targetMonth === String(today.getMonth() + 1).padStart(2, '0'));
                    if (!isCurrentMonth) {
                        targetDay = '01'; 
                    }
                }

            }

            // 轉換為民國年格式 (YYY.MM.DD)
            const rocYear = targetYear - 1911;
            const dateStr = `${rocYear}.${targetMonth}.${targetDay}`;
            
            // 新增資料到陣列最前面
            this.logs.unshift({ date: dateStr, projects: [] });

            // 防呆機制：確保下拉選單真的停留在這個年月
            this.viewYear = targetYear;
            if (this.viewMonth !== 'all') {
                this.viewMonth = targetMonth;
            }
            if (this.viewDay !== 'all') {
                this.viewDay = targetDay;
            }

            // 將畫面平滑捲動到最上面，確保他一眼就看到新卡片
            setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 100);
        },
        moveDay(idx, dir) { const n = idx+dir; if(n>=0&&n<this.logs.length) [this.logs[idx],this.logs[n]]=[this.logs[n],this.logs[idx]]; },
        removeDay(idx) { if(confirm('刪除整日？')) this.logs.splice(idx, 1); },
        addProject(dIdx) { this.logs[dIdx].projects.push({ name: '', items: [{ content: '', subs: [], imgUrl: '', driveId: '' }] }); },
        removeProject(dIdx, pIdx) { if(confirm('刪除案件？')) this.logs[dIdx].projects.splice(pIdx, 1); },
        moveProject(dIdx, pIdx, dir) { const arr=this.logs[dIdx].projects; const n=pIdx+dir; if(arr[n]) [arr[pIdx],arr[n]]=[arr[n],arr[pIdx]]; },
        
        addItem(dIdx, pIdx) { this.logs[dIdx].projects[pIdx].items.push({ content: '', subs: [], imgUrl: '', driveId: '' }); },
        moveItem(dIdx, pIdx, iIdx, dir) { const items=this.logs[dIdx].projects[pIdx].items; const n=iIdx+dir; if(items[n]) [items[iIdx],items[n]]=[items[n],items[iIdx]]; },
        removeItem(dIdx, pIdx, iIdx) { 
            const item = this.logs[dIdx].projects[pIdx].items[iIdx];
            if(item.driveId) this.deleteImage(item);
            this.logs[dIdx].projects[pIdx].items.splice(iIdx, 1); 
        },
        
        addSub(dIdx, pIdx, iIdx) { const item=this.logs[dIdx].projects[pIdx].items[iIdx]; if(!item.subs) item.subs=[]; item.subs.push({content:'', subsubs:[], imgUrl:'', driveId:''}); },
        moveSub(dIdx, pIdx, iIdx, sIdx, dir) { const subs=this.logs[dIdx].projects[pIdx].items[iIdx].subs; const n=sIdx+dir; if(subs[n]) [subs[sIdx],subs[n]]=[subs[n],subs[sIdx]]; },
        removeSub(dIdx, pIdx, iIdx, sIdx) {
            const sub = this.logs[dIdx].projects[pIdx].items[iIdx].subs[sIdx];
            if(sub.driveId) this.deleteImage(sub);
            this.logs[dIdx].projects[pIdx].items[iIdx].subs.splice(sIdx, 1);
        },

        addSubSub(dIdx, pIdx, iIdx, sIdx) { const sub=this.logs[dIdx].projects[pIdx].items[iIdx].subs[sIdx]; if(!sub.subsubs) sub.subsubs=[]; sub.subsubs.push({content:'', imgUrl:'', driveId:''}); },
        moveSubSub(dIdx, pIdx, iIdx, sIdx, ssIdx, dir) { const ss=this.logs[dIdx].projects[pIdx].items[iIdx].subs[sIdx].subsubs; const n=ssIdx+dir; if(ss[n]) [ss[ssIdx],ss[n]]=[ss[n],ss[ssIdx]]; },
        removeSubSub(dIdx, pIdx, iIdx, sIdx, ssIdx) {
            const ss = this.logs[dIdx].projects[pIdx].items[iIdx].subs[sIdx].subsubs[ssIdx];
            if(ss.driveId) this.deleteImage(ss);
            this.logs[dIdx].projects[pIdx].items[iIdx].subs[sIdx].subsubs.splice(ssIdx, 1);
        },
        copyFromDate(targetDay, event) {
            const sourceDate = event.target.value;
            if (!sourceDate) return;
            
            // 1. 溫馨提示：告知使用者圖片會被清空
            if (!confirm(`確定要從「${sourceDate}」帶入資料嗎？\n\n(注意：系統只會帶入「文字內容」。為了避免雲端檔案衝突，舊照片的格子將會被自動清空，請為新日期重新上傳照片。)`)) { 
                event.target.value = ""; 
                return; 
            }
            
            const sourceDay = this.logs.find(d => d.date === sourceDate);
            if (sourceDay) { 
                // 2. 深拷貝舊資料
                const copiedProjects = JSON.parse(JSON.stringify(sourceDay.projects));
                
                // 3. 建立一個遞迴函式，專門用來「拔除」所有圖片 ID
                const clearImages = (arr) => {
                    if (!Array.isArray(arr)) return;
                    arr.forEach(item => {
                        if (item) {
                            item.imgUrl = '';  // 清空畫面的預覽圖
                            item.driveId = ''; // 清空雲端的連結 ID
                            clearImages(item.subs);    // 繼續洗子項目
                            clearImages(item.subsubs); // 繼續洗子子項目
                        }
                    });
                };

                // 4. 執行圖片清洗
                copiedProjects.forEach(proj => {
                    clearImages(proj.items);
                });

                // 5. 把洗乾淨的純文字模板，貼給今天的日誌
                targetDay.projects = copiedProjects; 
            }
            event.target.value = "";
        }
    }
};

// 啟動 Vue
createApp(App).mount('#app');