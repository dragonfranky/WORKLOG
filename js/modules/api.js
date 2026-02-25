// js/modules/api.js

// ⭐ 括號裡面多加一個 dateStr
export async function uploadImageToGAS(config, base64, dateStr = "") {
    const payload = {
        token: config.token,
        action: "uploadImage",
        folderId: config.folderId,
        base64: base64,
        fileName: "IMG_" + new Date().getTime() + ".jpg",
        date: dateStr // ⭐ 新增這行：把日期打包傳給 GAS
    };

    const response = await fetch(config.scriptUrl, {
        method: "POST",
        body: JSON.stringify(payload)
    });
    return response.json();
}

export async function deleteImageFromGAS(config, fileId) {
    const res = await fetch(config.scriptUrl, {
        method: 'POST',
        body: JSON.stringify({ action: 'deleteImage', token: config.token, fileId: fileId })
    });
    return await res.json();
}

export async function syncUpload(config, data) {
    const res = await fetch(config.scriptUrl, {
        method: 'POST',
        body: JSON.stringify({ action: 'syncUpload', token: config.token, data: data })
    });
    return await res.json();
}

export async function syncDownload(config) {
    const res = await fetch(config.scriptUrl, {
        method: 'POST',
        body: JSON.stringify({ action: 'syncDownload', token: config.token })
    });
    return await res.json();
}

export async function listFiles(config) {
    const res = await fetch(config.scriptUrl, {
        method: 'POST',
        body: JSON.stringify({ action: 'listFiles', token: config.token, folderId: config.folderId })
    });
    return await res.json();
}