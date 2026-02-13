// js/modules/utils.js

export function toABC(idx) {
    return String.fromCharCode(97 + idx);
}

export function toRoman(num) {
    const map = ["", "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x", "xi", "xii"];
    return map[num] || num;
}

export function renderHTML(text) {
    if (!text) return '';
    let safe = String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    safe = safe.replace(/\(\((.*?)\)\)/g, '<span class="preview-red">$1</span>');
    safe = safe.replace(/\{\{(.*?)\}\}/g, '<span class="preview-yellow">$1</span>');
    return safe.replace(/\n/g, '<br>');
}

export function handleDatePick(event, targetObj, fieldName) {
    const val = event.target.value; 
    if(!val) return;
    const parts = val.split('-');
    if(parts.length !== 3) return;
    const rocYear = parseInt(parts[0]) - 1911;
    const rocStr = `${rocYear}.${parts[1]}.${parts[2]}`;
    targetObj[fieldName] = rocStr;
}

export function compressImage(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1280;
                let width = img.width;
                let height = img.height;
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
                canvas.width = width;
                canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.8));
            };
        };
    });
}