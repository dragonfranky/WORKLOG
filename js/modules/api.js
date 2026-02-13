// js/modules/api.js

export async function uploadImageToGAS(config, base64) {
    const res = await fetch(config.scriptUrl, {
        method: 'POST',
        body: JSON.stringify({
            action: 'uploadImage',
            token: config.token,
            folderId: config.folderId,
            base64: base64,
            fileName: `img_${Date.now()}.jpg`
        })
    });
    return await res.json();
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