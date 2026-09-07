/**
 * escape ข้อความก่อนแทรกเป็น HTML (ป้องกัน XSS จากชื่อฟอนต์/ลิงก์ที่ผู้ใช้พิมพ์เอง)
 * @param {string} value
 * @returns {string}
 */
export function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/** ป้ายชื่อน้ำหนักที่อ่านง่ายสำหรับตัวเลข font-weight มาตรฐาน */
export const WEIGHT_LABELS = {
    "100": "Thin (100)",
    "200": "Extra Light (200)",
    "300": "Light (300)",
    "400": "Regular (400)",
    "500": "Medium (500)",
    "600": "Semi Bold (600)",
    "700": "Bold (700)",
    "800": "Extra Bold (800)",
    "900": "Black (900)",
};

export function weightLabel(weight) {
    if (WEIGHT_LABELS[weight]) return WEIGHT_LABELS[weight];
    if (/^\d+\s\d+$/.test(String(weight))) return `Variable (${weight})`;
    return String(weight);
}

/**
 * แปลงขนาดไฟล์ (byte) เป็นข้อความอ่านง่าย เช่น 128000 -> "125 KB"
 * @param {number} bytes
 */
export function formatFileSize(bytes) {
    if (!bytes || bytes <= 0) return "";
    const units = ["B", "KB", "MB", "GB"];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex++;
    }
    return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

/** debounce แบบง่าย ใช้กับ input ที่ยิงถี่ (เช่น พิมพ์ลิงก์) */
export function debounce(fn, delay = 300) {
    let timer = null;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}
