/**
 * ตรวจว่า URL นี้เป็นสไตล์ชีตของ Google Fonts หรือไม่ (fonts.googleapis.com)
 * @param {string} url
 * @returns {boolean}
 */
export function isGoogleFontsUrl(url) {
    try {
        const parsed = new URL(url);
        return /(^|\.)fonts\.googleapis\.com$/i.test(parsed.hostname);
    } catch {
        return false;
    }
}

/**
 * แกะชื่อ font-family ตัวแรกออกจากลิงก์ Google Fonts (รองรับทั้ง css2 และ css เก่า)
 * เช่น ".../css2?family=Noto+Sans+Thai:wght@400;700&display=swap" -> "Noto Sans Thai"
 * @param {string} url
 * @returns {string|null} ชื่อ family หรือ null ถ้าแกะไม่ได้
 */
export function extractFamilyFromGoogleFontsUrl(url) {
    try {
        const parsed = new URL(url);
        const familyParams = parsed.searchParams.getAll("family");
        if (!familyParams.length) return null;

        // css เก่ารองรับหลาย family คั่นด้วย "|" ในพารามิเตอร์เดียว, css2 ใช้ family= ซ้ำหลายครั้ง
        const first = familyParams[0].split("|")[0];
        const namePart = first.split(":")[0];
        const family = namePart.replace(/\+/g, " ").trim();
        return family || null;
    } catch {
        return null;
    }
}

/**
 * ดึงรายชื่อ font-family ทั้งหมดที่อยู่ในลิงก์เดียว (เผื่อผู้ใช้วางลิงก์ที่รวมหลายฟอนต์)
 * @param {string} url
 * @returns {string[]}
 */
export function extractAllFamiliesFromGoogleFontsUrl(url) {
    try {
        const parsed = new URL(url);
        const familyParams = parsed.searchParams.getAll("family");
        const names = [];
        for (const param of familyParams) {
            for (const chunk of param.split("|")) {
                const name = chunk.split(":")[0].replace(/\+/g, " ").trim();
                if (name) names.push(name);
            }
        }
        return names;
    } catch {
        return [];
    }
}
