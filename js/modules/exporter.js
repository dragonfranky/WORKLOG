// js/modules/exporter.js
import { toABC, toRoman } from './utils.js';

// 輔助函式：攤平資料
function getFlattenedData(logs) {
    const rows = [];
    (logs || []).forEach(day => {
        (day.projects || []).forEach(proj => {
            if (!proj.items || proj.items.length === 0) { 
                rows.push([day.date, proj.name, "", "", "", "", "", "", "", "", ""]); 
            } else {
                proj.items.forEach(item => {
                    if(!item) return; 
                    if (!item.subs || item.subs.length === 0) {
                        rows.push([day.date, proj.name, item.content, "", "", item.imgUrl || "", "", "", item.driveId || "", "", ""]); 
                    } else {
                        item.subs.forEach(sub => {
                            if(!sub) return;
                            if (!sub.subsubs || sub.subsubs.length === 0) { 
                                rows.push([day.date, proj.name, item.content, sub.content, "", item.imgUrl || "", sub.imgUrl || "", "", item.driveId || "", sub.driveId || "", ""]);
                            } else { 
                                sub.subsubs.forEach(ss => { 
                                    rows.push([day.date, proj.name, item.content, sub.content, (ss ? ss.content : ""), item.imgUrl || "", sub.imgUrl || "", (ss ? ss.imgUrl : "") || "", item.driveId || "", sub.driveId || "", (ss ? ss.driveId : "") || ""]); 
                                });
                            }
                        });
                    }
                });
            }
        });
    });
    return rows;
}

// 輔助函式：解析資料
function parseFlattenedData(rows) {
    const newLogs = [];
    let currentDay = null, currentProj = null, currentItem = null, currentSub = null;
    rows.forEach(r => {
        const date = r[0]; const pName = r[1]; 
        const mainContent = r[2]; const subContent = r[3]; const ssContent = r[4]; 
        const mainImg = r[5]; const subImg = r[6]; const ssImg = r[7];
        const mainId = r[8]; const subId = r[9]; const ssId = r[10];
        if (!date) return;
        if (!currentDay || currentDay.date !== date) { currentDay = { date: date, projects: [] }; newLogs.push(currentDay); currentProj = null; }
        if (pName) { if (!currentProj || currentProj.name !== pName) { currentProj = { name: pName, items: [] }; currentDay.projects.push(currentProj); currentItem = null; } }
        if (mainContent) { 
            if (!currentItem || currentItem.content !== mainContent) { 
                currentItem = { content: mainContent, subs: [], imgUrl: mainImg || "", driveId: mainId || "" }; 
                if(currentProj) currentProj.items.push(currentItem);
                currentSub = null;
            } 
        }
        if (subContent) { 
            if (!currentSub || currentSub.content !== subContent) { 
                currentSub = { content: subContent, subsubs: [], imgUrl: subImg || "", driveId: subId || "" };
                if(currentItem) currentItem.subs.push(currentSub); 
            } 
        }
        if (ssContent && currentSub) { 
            currentSub.subsubs.push({ content: ssContent, imgUrl: ssImg || "", driveId: ssId || "" });
        }
    });
    return newLogs;
}

// ⭐ 括號內新增接收 filePrefix 和 sheetName 變數
export function exportExcel(logs, filePrefix = "工作日誌資料庫", sheetName = "工作日誌資料庫") {
    try {
        const rows = [["日期", "案件名稱", "主項目(1)", "子項目(a)", "子子項目(i)", "主圖", "子圖", "子子圖", "主圖ID", "子圖ID", "子子圖ID"]];
        const dataRows = getFlattenedData(logs);
        rows.push(...dataRows);
        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        
        // ⭐ 套用動態頁籤名稱
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
        
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        
        // ⭐ 套用動態檔案名稱 (保留了原本的日期尾巴，方便您辨識版本)
        const fileName = `${filePrefix}_${new Date().toISOString().slice(0,10)}.xlsx`;
        
        saveAs(new Blob([wbout], { type: "application/octet-stream" }), fileName);
    } catch (e) {
        console.error(e);
        alert("❌ 匯出 Excel 時發生錯誤：\n" + e.message);
    }
}

export function importExcel(file, callback) {
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, {type: 'array'});
            const ws = wb.Sheets[wb.SheetNames[0]]; 
            const rows = XLSX.utils.sheet_to_json(ws, {header: 1});
            const logs = parseFlattenedData(rows.slice(1).map(r => [
                r[0], r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10]
            ]));
            callback(logs);
        } catch(err) {
            console.error(err);
            alert("匯入失敗：" + err);
        }
    };
    reader.readAsArrayBuffer(file);
}

export function generateDocx(logs, templateArrayBuffer) {
    if (!templateArrayBuffer) {
        alert("⚠️ 請先載入 Word 範本檔案！");
        return;
    }

    const textToXML = (text, indent = 0, hanging = 0) => {
        if (!text) return "";
        const fontXML = '<w:rFonts w:ascii="標楷體" w:eastAsia="標楷體" w:hAnsi="標楷體" w:cs="標楷體" w:hint="eastAsia"/>';
        const sizeXML = '<w:sz w:val="24"/><w:szCs w:val="24"/>';
        const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const lines = String(text).split('\n');
        const runXmls = lines.map(line => {
            const parts = line.split(/(\(\(.*?\)\)|\{\{.*?\}\})/g);
            return parts.map(part => {
                let content = part; let color = "000000"; let highlight = "";
                if (part.startsWith('((') && part.endsWith('))')) { color = "FF0000"; content = part.slice(2, -2); } 
                else if (part.startsWith('{{') && part.endsWith('}}')) { highlight = '<w:highlight w:val="yellow"/>'; content = part.slice(2, -2); }
                if(!content) return "";
                return `<w:r><w:rPr>${fontXML}${sizeXML}<w:color w:val="${color}"/>${highlight}</w:rPr><w:t xml:space="preserve">${escape(content)}</w:t></w:r>`;
            }).join('');
        }).join('<w:r><w:br/></w:r>');
        return `<w:p><w:pPr><w:ind w:left="${indent}" w:hanging="${hanging}"/><w:spacing w:line="240" w:lineRule="auto"/></w:pPr>${runXmls}</w:p>`;
    };

    try {
        // 使用全域變數 PizZip 和 docxtemplater
        const zip = new PizZip(templateArrayBuffer);
        const doc = new window.docxtemplater(zip, { paragraphLoop: true, linebreaks: true });

        const renderData = {
            logs: (logs || []).map(day => {
                return {
                    date: day.date || '',
                    projects: (day.projects || []).map(proj => {
                        let xmlAccumulator = "";
                        (proj.items || []).forEach((item, i) => {
                            xmlAccumulator += textToXML(`${i+1}).${item.content || ''}`, 360, 360);
                            if(item.subs) {
                                (item.subs || []).forEach((sub, j) => {
                                    xmlAccumulator += textToXML(`${toABC(j)}.${sub.content || ''}`, 600, 240);
                                    if(sub.subsubs) { 
                                        (sub.subsubs || []).forEach((ss, k) => { 
                                            xmlAccumulator += textToXML(`${toRoman(k+1)}.${ss.content || ''}`, 840, 240); 
                                        }); 
                                    }
                                });
                            }
                        });
                        return { name: proj.name || '', xml_content: xmlAccumulator };
                    })
                };
            })
        };

        doc.render(renderData);
        const out = doc.getZip().generate({type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
        saveAs(out, `工作日誌彙整_${new Date().toISOString().slice(0,10)}.docx`);

    } catch (error) {
        console.error(error);
        if (error.properties && error.properties.errors) { 
            const errorMessages = error.properties.errors.map(err => err.properties.explanation).join("\n");
            alert("Word 範本標籤有誤！\n\n" + errorMessages); 
        } else { 
            alert("程式執行錯誤: " + error.message);
        }
    }
}