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
            searchQuery: '', // ⭐ 新增：搜尋關鍵字
            
            showFilterModal: false,
            showReportMode: false, 
            filter: { projectName: '', startDate: '', endDate: '' },
            filteredLogs: []
        }
    },
    mounted() {
        // 讀取設定與資料
        const savedData = localStorage.getItem('workLogData');
        const savedConfig = localStorage.getItem('v7_config');
        if (savedConfig) { try { this.config = JSON.parse(savedConfig); } catch(e) {} }
        if (!this.config.scriptUrl) { const oldUrl = localStorage.getItem('googleScriptUrl'); if (oldUrl) this.config.scriptUrl = oldUrl; }
        if (savedData) { try { this.logs = JSON.parse(savedData); } catch(e) { console.error(e); } } else { this.addNewDay(); }
        
        // ⭐ 新增：程式啟動時，自動選取「今天」的年月
        const today = new Date();
        this.viewYear = today.getFullYear();
        this.viewMonth = String(today.getMonth() + 1).padStart(2, '0');

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
        }
    },
    watch: {
        logs: { handler(newVal) { localStorage.setItem('workLogData', JSON.stringify(newVal)); this.isSaved = true; setTimeout(() => this.isSaved = false, 1500); }, deep: true }
    },
    methods: {
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

            if (dYear !== targetRocYear) return false;
            if (this.viewMonth !== 'all' && dMonth !== this.viewMonth) return false;

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
        async uploadImageProcess(blob, item) {
            const base64 = await Utils.compressImage(blob);
            item.imgUrl = base64; // 先顯示預覽

            if (!this.config.scriptUrl || !this.config.token || !this.config.folderId) {
                this.showSettings = true;
                return alert("⚠️ 請先在設定中填寫完整的 GAS 連結、Token 和 Folder ID");
            }

            this.isLoading = true;
            this.loadingMsg = '圖片處理上傳中...';
            
            try {
                const result = await API.uploadImageToGAS(this.config, base64);
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

        // ⭐ 2. 修改原本的檔案上傳 (改呼叫上面的共用邏輯)
        async handleImageUpload(event, item) {
            const file = event.target.files[0];
            if (!file) return;
            await this.uploadImageProcess(file, item); // 呼叫共用函式
            event.target.value = ''; 
        },

        // ⭐ 3. 新增：從剪貼簿貼上圖片
        async handlePasteImage(item) {
            try {
                // 讀取剪貼簿項目
                const clipboardItems = await navigator.clipboard.read();
                
                for (const clipboardItem of clipboardItems) {
                    // 尋找是否有圖片類型的資料
                    const imageType = clipboardItem.types.find(type => type.startsWith('image/'));
                    
                    if (imageType) {
                        // 取得圖片 Blob
                        const blob = await clipboardItem.getType(imageType);
                        // 呼叫共用函式直接上傳
                        await this.uploadImageProcess(blob, item);
                        return; // 找到一張圖就處理並結束
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
                
                // ⭐ 修正點：加入陣列檢查，防止 undefined 報錯
                const collect = (arr) => {
                    if (!Array.isArray(arr)) return; // 如果不是陣列就跳过
                    arr.forEach(item => {
                        if (!item) return;
                        if (item.driveId) localIds.add(item.driveId);
                        // 遞迴檢查子項目，確保傳入的是陣列或空陣列
                        collect(item.subs || []);
                        collect(item.subsubs || []);
                    });
                };

                // 主迴圈也要防呆
                (this.logs || []).forEach(d => {
                    (d.projects || []).forEach(p => {
                        collect(p.items || []); // 這裡加上 || [] 是關鍵
                    });
                });

                // 2. 取得雲端列表
                const result = await API.listFiles(this.config);
                if (!result.success) throw new Error(result.message);
                
                // 3. 比對
                const remoteFiles = result.files || []; // 確保雲端回傳的也是陣列
                const orphans = remoteFiles.filter(f => !localIds.has(f.id));
                
                if (orphans.length === 0) {
                    alert("✅ 同步完成！沒有多餘檔案。");
                } else {
                    if (confirm(`⚠️ 發現 ${orphans.length} 個未使用的孤兒檔案，是否刪除？`)) {
                        this.loadingMsg = '正在刪除...';
                        for (let f of orphans) await API.deleteImageFromGAS(this.config, f.id);
                        alert("清理完成！");
                    }
                }
            } catch (e) { 
                console.error(e); // 在 console 顯示詳細錯誤
                alert("同步錯誤: " + e.message); 
            }
            this.isLoading = false;
        },

        // --- 3. 匯出/匯入 (使用 Exporter 模組) ---
        exportExcel() { Exporter.exportExcel(this.logs); },
        
        importExcel(event) {
            const file = event.target.files[0];
            if(!file) return;
            Exporter.importExcel(file, (newLogs) => {
                this.cleanUpOldData(); 
                this.logs = newLogs;
                alert("資料庫匯入成功！");
                event.target.value = '';
            });
        },
        
        generateDocx() { Exporter.generateDocx(this.logs, this.templateArrayBuffer); },
        
        loadTemplate(e) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (evt) => { this.templateArrayBuffer = evt.target.result; this.templateLoaded = true; };
            reader.readAsArrayBuffer(file);
        },

        // --- 4. UI 互動與邏輯 (完全保留原始代碼) ---
        cleanUpOldData() {
            let orphanFiles = [];
            (this.logs || []).forEach(day => {
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
            const msg = `⚠️ 警告：目前的畫面上有 ${orphanFiles.length} 張已上傳的圖片！\n\n匯入新資料將會「覆蓋」掉這些紀錄，導致圖片變成永久佔用空間的孤兒檔案。\n\n請問是否要先將這些舊圖片從 Google Drive 刪除？`;
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

        async checkAndUpload() {
            if (!this.config.scriptUrl || !this.config.token) { alert("⚠️ 尚未設定連結！"); this.showSettings = true; return; }
            if(!confirm("⚠️ 確定上傳？")) return;
            this.isLoading = true; this.loadingMsg = '正在上傳至 Firebase...';
            try {
                const res = await API.syncUpload(this.config, this.logs);
                if(res.result === "Success") alert("✅ 上傳成功");
                else alert("❌ 上傳失敗");
            } catch(e) { alert("❌ 錯誤: " + e); }
            this.isLoading = false;
        },

        async checkAndDownload() {
            if (!this.config.scriptUrl || !this.config.token) { alert("⚠️ 尚未設定連結！"); this.showSettings = true; return; }
            if(!confirm("⚠️ 確定要從雲端「下載」資料嗎？(將覆蓋本地資料)")) return;
            this.cleanUpOldData();
            this.isLoading = true; this.loadingMsg = '正在從 Firebase 下載...';
            try {
                const res = await API.syncDownload(this.config);
                if(Array.isArray(res)) { this.logs = res; alert("✅ 下載成功"); }
                else alert("❌ 格式錯誤");
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
        clearStorage() { if(confirm("確定清空？")) { this.logs = []; localStorage.removeItem('workLogData'); this.addNewDay(); } },
        
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
            if (!confirm(`從「${sourceDate}」帶入？`)) { event.target.value = ""; return; }
            const sourceDay = this.logs.find(d => d.date === sourceDate);
            if (sourceDay) { targetDay.projects = JSON.parse(JSON.stringify(sourceDay.projects)); }
            event.target.value = "";
        }
    }
};

// 啟動 Vue
createApp(App).mount('#app');